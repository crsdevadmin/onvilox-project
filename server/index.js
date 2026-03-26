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
Return ONLY valid JSON. START with '{' and END with '}'. NO preamble, NO markdown code blocks, NO headers.
If unknown, return null.
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
    const systemPrompt = `Onvilox AI Copilot (PhD/RD). Goal: Extract clinical data.
    RULE: Use ONLY the keys in the schema. NO emojis in keys. NO custom keys like "RED_FLAGS". 
    RULE: Map all "Red Flags" or "Additional Clinical Data" to the "notes" key.
    Schema: { "name":str, "age":num, "sex":"M/F", "weight":num, "height":num, "usualWeight":num, "reducedFoodIntake":num, "albumin":num, "crp":num, "cancer":str, "regimen":str, "creatinine":num, "alt":num, "ast":num, "bilirubin":num, "bloodSugar":num, "sodium":num, "potassium":num, "urea":num, "muac":num, "prealbumin":num, "vitD":num, "vitB12":num, "folate":num, "zinc":num, "magnesium":num, "tsh":num, "hba1c":num, "hemoglobin":num, "sarcopeniaStatus":str, "activityLevel":str, "ecogStatus":num, "leanBodyMass":num, "smi":num, "handGrip":num, "fatPercent":num, "feedingMethod":str, "giIssues":bool, "comorbidities":[], "sideEffects":[], "existingSupplements":[], "allergies":[], "metastasisSites":[], "genomicMarkers":[], "notes":str }
    Format: { "reply": "Short answer (<3 sentences)", "extractedData": { ...found values... } }`;

    const msg = await anthropic.messages.create({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: "user", content: message }],
    });

    const rawText = msg.content[0].text;
    let data;
    try {
      // Robust Parser: Try code blocks, then greedy braces, then the whole string
      const jsonCandidate = (rawText.match(/```json\s*(\{[\s\S]*?\})\s*```/)?.[1]) || 
                            (rawText.match(/{[\s\S]*}/)?.[0]) || 
                            rawText;
      data = JSON.parse(jsonCandidate);
      
      // Map result to standard Schema { reply, extractedData }
      if (!data.reply && (data.name || data.extractedData)) {
          data = { 
            reply: data.reply || "Clinical data extracted successfully.", 
            extractedData: data.extractedData || data 
          };
      }
    } catch (e) {
      console.warn("AI Parser Error:", e.message);
      data = { reply: rawText, extractedData: null };
    }
    res.json(data);
  } catch (error) {
    console.error("Claude Chat Error:", error);
    res.status(500).json({ error: 'Failed' });
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
    const rules = "1. Oral <60% = EN. 2. Protein 1.8g/kg if Sarcopenia/Cachexia. 3. Gap >5% = MANDATORY CORRECTED PRESCRIPTION (isOverpowered:true). 4. Renal: CR>1.3 = max 0.8g/kg. 5. Bortezomib/AC: No ALA/High VitC. 6. Immunotherapy: Monitor Thyroid/Gi; TSH is mandatory.";
    const system = `Onvilox PhD RD Auditing Engine V5-VALIDATOR. Rules: ${rules}. Max 5 rationale, 10 steps. 
    ROLE: You are a skeptical Clinical Validator. Your primary job is to find inconsistencies in the provided plan (especially Protein Gaps or safety clashes) and FIX THEM.
    MANDATORY Analysis: Check Pembrolizumab irAEs, Protein Target vs Delivery consistency, and Vitamin C/AC clashes. 
    INSTRUCTION: If Total Delivery Protein != Target Protein (within 5%), YOU MUST set "isOverpowered": true and provide the corrected values in "correctedPrescription".
    MANDATORY Tables: drugInteractions, micronutrientOrders, monitoringSchedule.
    JSON ONLY: { "validationScore": num(0-10), "rationale":[], "instructions":[], "clinicalAlerts":[{"type":str,"level":str,"message":str}], "correctedPrescription":{"isOverpowered":bool, "dailyCalories":num, "dailyProtein":num, "reasoning":str}, "logicRefinements":[], "drugInteractions":[], "micronutrientOrders":[], "monitoringSchedule":[] }`;

    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 3000,
      system: system,
      messages: [{
        role: "user",
        content: `AUDIT: Patient: ${JSON.stringify(patient)} Plan: ${JSON.stringify(plan)}`
      }]
    });

    const rawText = msg.content[0].text;
    let data;
    try {
      const jsonMatch = rawText.match(/{[\s\S]*}/);
      if (!jsonMatch) throw new Error("No JSON");
      let jsonStr = jsonMatch[0];
      const open = (jsonStr.match(/{/g) || []).length;
      const close = (jsonStr.match(/}/g) || []).length;
      if (open > close) jsonStr += "}".repeat(open - close);
      data = JSON.parse(jsonStr);
    } catch (e) {
      data = { rationale: ["Analysis too complex/long for current token limit."], instructions: ["Check logs."], clinicalAlerts: [] };
    }
    res.json(data);
  } catch (error) {
    console.error("Claude Report Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
