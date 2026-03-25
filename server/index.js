const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Database Connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Auth Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// --- ROUTES ---

// Health Check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Auth: Login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    if (!user) return res.status(400).json({ error: 'User not found' });

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) return res.status(400).json({ error: 'Invalid password' });

    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET);
    res.json({ token, user: { id: user.id, name: user.name, role: user.role, hospital_name: user.hospital_name } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Patients: Get All
app.get('/api/patients', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM patients ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Patients: Create
app.post('/api/patients', authenticateToken, async (req, res) => {
  const p = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO patients (id, uhic, name, age, sex, height, weight, usual_weight, albumin, crp, muac, feeding_method, gi_issues, assigned_doctor_id, created_by_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING *`,
      [p.id, p.uhic, p.name, p.age, p.sex, p.height, p.weight, p.usual_weight, p.albumin, p.crp, p.muac, p.feeding_method, p.gi_issues, p.assigned_doctor_id, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// AI configuration is handled by Anthropic SDK below

// --- ANTHROPIC (CLAUDE) INTEGRATION ---
const Anthropic = require('@anthropic-ai/sdk');
const rawKey = process.env.ANTHROPIC_API_KEY || '';
const anthropic = new Anthropic({ apiKey: rawKey });

// Prompt for mapping Clinical Data
const extractionSystemPrompt = `You are an expert Oncology Assistant. 
Extract clinical parameters from the provided text/PDF and return a precise JSON object.
Return ONLY valid JSON. If unknown, return null.
Schema: {
  "name": "String", "age": "Number", "sex": "Male/Female", "weight": "Number (kg)", "height": "Number (cm)", 
  "usualWeight": "Number (kg)", "uhic": "String", "cancer": "String", "regimen": "String", "feedingMethod": "String",
  "tumorBurden": "String", "sarcopeniaStatus": "String", "cancerStage": "String", "ecogStatus": "Number", "activityLevel": "String",
  "reducedFoodIntake": "Number (%)", "albumin": "Number", "crp": "Number", "muac": "Number", "creatinine": "Number",
  "alt": "Number", "ast": "Number", "bilirubin": "Number", "bloodSugar": "Number", "sodium": "Number", "potassium": "Number",
  "urea": "Number", "tsh": "Number", "prealbumin": "Number", "hemoglobin": "Number", "vitD": "Number", "vitB12": "Number", 
  "folate": "Number", "zinc": "Number", "magnesium": "Number", "hba1c": "Number", "giIssues": "Boolean",
  "allergies": [], "existingSupplements": [], "comorbidities": [], "sideEffects": [], "genomicMarkers": [], "treatmentTypes": []
}`;

app.post('/api/extract', async (req, res) => {
  const { pdfText } = req.body;
  if (!pdfText) return res.status(400).json({ error: 'No text provided.' });

  try {
    const msg = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 2000,
      system: extractionSystemPrompt,
      messages: [{ role: "user", content: `Extract from:\n\n${pdfText}` }],
    });

    const rawText = msg.content[0].text;
    const jsonStr = rawText.match(/{[\s\S]*}/)?.[0] || rawText;
    res.json({ success: true, data: JSON.parse(jsonStr) });
  } catch (error) {
    console.error("Claude Extraction Error:", error);
    res.status(500).json({ error: 'Failed to extract data using AI.' });
  }
});

app.post('/api/chat', async (req, res) => {
  const { message, contextObj } = req.body;
  if (!message) return res.status(400).json({ error: 'No message provided.' });

  try {
    const contextStr = contextObj ? JSON.stringify(contextObj) : "No context.";
    const systemPrompt = `You are a clinical oncology nutrition assistant (Onvilox AI Co-pilot).
Use ESMO/ASCO guidelines. Keep answers under 3 sentences unless asked for detail.
Patient Context: ${contextStr}`;

    const msg = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: "user", content: message }],
    });

    res.json({ reply: msg.content[0].text });
  } catch (error) {
    console.error("Claude Chat Error:", error);
    res.status(500).json({ error: 'Failed to generate AI response.' });
  }
});

app.get('/api/list-models', async (req, res) => {
  try {
    const models = await anthropic.models.list();
    res.json({ models: models.data.map(m => m.id) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/claude-report', async (req, res) => {
  const { patient, plan } = req.body;
  if (!patient || !plan) return res.status(400).json({ error: 'Context required.' });

  try {
    const systemInstruction = `You are a Senior Oncology Dietitian (PhD, RD) generating a structured clinical nutrition report for Onvilox.
CRITICAL LOGIC SYNC:
1. RENAL SAFETY: If patient has Renal Risk (CR > 1.3), you MUST prioritize the 0.8g/kg protein target.
2. ESCALATION HARMONY: If route is 'Enteral', ensure instructions focus on tube-feeding safety (Rinse, Rate, Position).
3. VOLUME SAFETY: Cap initial enteral rate at 20-40ml/hr if patient has severe weight loss or low albumin.
4. MICRONUTRIENT CAPS: Do NOT recommend >1000mg Vit C or >2000 IU Vit D without explicit "Requires Oncology Clearance" side-notes, especially during active chemo.
Return ONLY valid JSON. START with '{' and END with '}'.`;

    const msg = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 8192,
      system: systemInstruction,
      messages: [{
        role: "user",
        content: `MANDATORY CLINICAL SAFETY RULES:
- Antioxidant Safety (FOLFOX/Oxaliplatin): High-dose Vit C (>1000mg) or ALA (600mg) REQUIRES Oncologist Clearance. It must be flagged as "CAPPED" or "EXCLUDED" in micronutrientOrders until cleared.
- Antioxidant Safety (Bortezomib/Velcade): Vit C > 500mg or any ALA is CONTRAINDICATED. Must be "EXCLUDED" immediately.
- Renal Risk (Creatinine >1.3): Protein MUST be capped at 0.8g/kg. 
- Sarcopenia (SMI < 7.0 M / 5.7 F): Confirmation of "Sarcopenic Cachexia" is mandatory in rationale.
- Glycemic: HbA1c missing + BG > 180 -> Status: CAPPED. Rationale: Screening required.
- Enteral Escalation: If intake <= 50%, instructions must focus 100% on tube-feeding protocol. Remove oral instructions.

PATIENT DATA: ${JSON.stringify(patient, null, 2)}

ENGINE CALCULATIONS: ${JSON.stringify(plan, null, 2)}

GENERATE JSON STRUCTURE:
{
  "rationale": ["Clinical logic - must mention ${plan.totalProteinDelivery}g vs ${plan.baseProtein}g target"],
  "instructions": ["Step 1", "Step 2"],
  "clinicalAlerts": [
    {"type": "Nutrition/Glycemic/Electrolyte/Drug/GI/Hematology", "level": "HIGH/MODERATE/LOW", "message": "Clear specific action guidance"}
  ],
  "drugInteractions": [
    {"drug": "Name", "interaction": "Effect", "advice": "Clinical action", "risk": "HIGH/MODERATE/LOW"}
  ],
  "micronutrientOrders": [
    {"nutrient": "Name", "labValue": "Value", "dose": "Prescription", "rationale": "Clinical logic", "status": "SUPPLEMENT/DEFICIENT/MONITOR/CAPPED/EXCLUDED"}
  ],
  "monitoringSchedule": [
    {"frequency": "e.g. Weekly", "parameters": "Labs to check", "threshold": "Trigger level", "responsible": "Clinic/Patient"}
  ]
}
IMPORTANT: Return ONLY valid JSON. No markdown preamble.`
      }],
    });

    const rawText = msg.content[0].text;
    let data;
    try {
      const jsonStr = rawText.match(/{[\s\S]*}/)?.[0] || rawText;
      data = JSON.parse(jsonStr);
    } catch (e) {
      console.error("JSON PARSE FAILED:", rawText);
      throw new Error("Invalid JSON from AI");
    }
    res.json(data);
  } catch (error) {
    console.error("Claude Report Error:", error);
    res.status(500).json({ 
      error: `Claude Error: ${error.message}`, 
      detail: error.stack 
    });
  }
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
