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
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      system: extractionSystemPrompt,
      messages: [{ role: "user", content: `Extract from:\n\n${pdfText}` }],
    });

    const rawText = msg.content[0].text;
    let extracted;
    try {
      const jsonStr = rawText.match(/{[\s\S]*}/)?.[0] || rawText;
      extracted = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error("JSON Parse Error in Extraction:", rawText);
      return res.status(422).json({ error: 'AI returned malformed data. Please try again.' });
    }
    res.json({ success: true, data: extracted });
  } catch (error) {
    if (error.status === 429) {
      return res.status(429).json({ error: 'AI Rate Limit exceeded. Please wait a moment.' });
    }
    console.error("Claude Extraction Error:", error);
    res.status(500).json({ error: 'Internal AI failure.' });
  }
});

app.post('/api/chat', async (req, res) => {
  const { message, contextObj } = req.body;
  if (!message) return res.status(400).json({ error: 'No message provided.' });

  try {
    const contextStr = contextObj ? JSON.stringify(contextObj) : "No context.";
    const systemPrompt = `You are a clinical oncology nutrition assistant (Onvilox AI Co-pilot) running on Claude 4.6.
    Use ESMO/ASCO guidelines.
    
    EXTRACTION ROLE:
    If the user's message contains clinical values (vitals, labs, cancer specs, anthropometry), extract them into a precise JSON object alongside your reply.
    
    SCHEMA FOR extractedData:
    {
      "name": "string", "age": number, "sex": "Male/Female", "weight": number, "height": number, "usualWeight": number,
      "uhic": "string", "cancer": "string", "regimen": "string", "cancerStage": "string", "tumorBurden": "string",
      "reducedFoodIntake": number, "albumin": number, "crp": number, "creatinine": number, "hemoglobin": number,
      "bloodSugar": number, "hba1c": number, "alt": number, "ast": number, "bilirubin": number, "tsh": number,
      "sodium": number, "potassium": number, "urea": number, "muac": number, "prealbumin": number,
      "vitD": number, "vitB12": number, "folate": number, "zinc": number, "magnesium": number,
      "sarcopeniaStatus": "Yes/No", "activityLevel": "string", "ecogStatus": number, "leanBodyMass": number,
      "smi": number, "handGrip": number, "fatPercent": number, "feedingMethod": "string", "giIssues": boolean,
      "comorbidities": [], "sideEffects": [], "existingSupplements": [], "allergies": [], "metastasisSites": [], "genomicMarkers": []
    }

    Response format (Strict JSON):
    {
      "reply": "Conversational reply under 4 sentences.",
      "extractedData": { ... entire schema above with found values, null otherwise ... }
    }`;

    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: "user", content: message }],
    });

    const rawText = msg.content[0].text;
    let data;
    try {
      const jsonMatch = rawText.match(/{[\s\S]*}/);
      if (jsonMatch) {
         data = JSON.parse(jsonMatch[0]);
      } else {
         data = { reply: rawText, extractedData: null };
      }
    } catch (e) {
      data = { reply: rawText, extractedData: null };
    }
    
    res.json(data);
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
    const ESPEN_ONCOLOGY_2024 = `
    1. INTAKE THRESHOLD: If oral intake is PERSISTENTLY < 60% of requirements, Enteral Nutrition (EN) via tube feeding MUST be assessed.
    2. PROTEIN TARGET: Target 1.8g/kg for patients with Sarcopenia, Cachexia, or active Platinum-based/FOLFOX/VRD chemo. 
    3. THE GAP RULE: If the engine leaves a >20% calorie/protein gap by assuming the patient will eat the rest orally (especially when intake < 65%), the AI must increase the supplement dose to Full Replacement (100% of target).
    4. SKEPTICISM: Verbal reports of '55% intake' are unvalidated. Treat <70% oral intake as 'High Risk' in reports.
    `;

    const systemInstruction = `You are the Final Sign-off Oncology Clinician (PhD, RD) for Onvilox.
    Your mission is to AUDIT the deterministic engine and CORRECT it where it drifts from ESPEN 2024 / ASCO guidelines.
    
    ${ESPEN_ONCOLOGY_2024}

    AUDIT PROTOCOL:
    - Compare RAW_PATIENT_DATA vs ENGINE_CALCULATIONS.
    - If the engine under-prescribes, AUTHORIZED to 'Overpower'.
    - CONCISENESS: Limit 'rationale' to top 5 points. Limit 'instructions' to top 10 actionable steps.
    - MANDATORY TABLES: You MUST always provide 'drugInteractions', 'micronutrientOrders', and 'monitoringSchedule'. These are not optional. If none apply, return an empty array [].
    - If you overpower, you must include a "CLINICAL OVERPOWER" alert.
    
    CRITICAL SAFETY (NON-NEGOTIABLES):
    1. RENAL SAFETY: If CR > 1.3, absolute CAP at 0.8g/kg.
    2. ANTIOXIDANT SAFETY: Absolute exclusion of ALA/Vit C > 500mg for Bortezomib.
    3. ANTIOXIDANT SAFETY: CAP Vit C at 500mg for Platinum-based until cleared.
    
    Return ONLY valid JSON. START with '{' and END with '}'.`;

    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      system: systemInstruction,
      messages: [{
        role: "user",
        content: `AUDIT TASK:
        Review the Patient Data and Engine Draft. Identify gaps in Calorie/Protein delivery or Escalation Timing.
        
        PATIENT DATA: ${JSON.stringify(patient, null, 2)}
        ENGINE CALCULATIONS: ${JSON.stringify(plan, null, 2)}
        
        REQUIRED JSON STRUCTURE:
        {
          "rationale": ["Detailed clinical audit - must cite ESPEN 2024 if overriding engine"],
          "instructions": ["Step-by-step patient guidance"],
          "clinicalAlerts": [
            {"type": "Nutrition/Engine-Audit/Drug/GI", "level": "HIGH/MODERATE/LOW", "message": "Clear specific action guidance"}
          ],
          "correctedPrescription": {
             "isOverpowered": boolean,
             "dailyCalories": number,
             "dailyProtein": number,
             "reasoning": "Specify why the engine default was corrected"
          },
          "logicRefinements": [
             "Specific instruction for developers to update the engine code based on your clinical audit findings"
          ],
          "drugInteractions": [...],
          "micronutrientOrders": [...],
          "monitoringSchedule": [...]
        }`
      }],
    });

    const rawText = msg.content[0].text;
    let data;
    try {
      // Find the JSON block
      const jsonMatch = rawText.match(/{[\s\S]*}/);
      if (!jsonMatch) throw new Error("No JSON found");
      
      let jsonStr = jsonMatch[0];
      
      // If the JSON is slightly truncated (e.g. missing trailing braces), try a basic repair
      const openBraces = (jsonStr.match(/{/g) || []).length;
      const closeBraces = (jsonStr.match(/}/g) || []).length;
      if (openBraces > closeBraces) {
         jsonStr += "}".repeat(openBraces - closeBraces);
      }
      
      data = JSON.parse(jsonStr);
    } catch (e) {
      console.error("REPORT PARSE FAILED. Raw Response:", rawText);
      // Fallback: If it's a total failure, send the raw text as a rationale
      data = { 
        rationale: ["AI error: Report was too long for the current token limit. Technical repair attempted."],
        instructions: ["Please re-generate the report or check server logs."],
        clinicalAlerts: [{ type: "SYSTEM", level: "HIGH", message: "AI response truncated" }]
      };
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
