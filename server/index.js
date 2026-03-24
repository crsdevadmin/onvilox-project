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

// --- OPENAI INTEGRATION ---
const { OpenAI } = require('openai');
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Prompt for mapping Clinical Data
const extractionSystemPrompt = `
You are an expert Oncology Assistant. 
Extract the following clinical parameters from the provided text/PDF content and return a precise JSON object matching this schema.
Return ONLY valid JSON. If a value is unknown, return null (or an empty string if string expected).
Fields to extract (match formatting exactly):
{
  "name": "String", "age": "Number", "sex": "Male/Female", "weight": "Number (kg)", "height": "Number (cm)", 
  "usualWeight": "Number (kg)", "uhic": "String (Hospital ID)", "cancer": "String (e.g. Pancreatic Cancer)",
  "regimen": "String", "feedingMethod": "String", "tumorBurden": "String", "sarcopeniaStatus": "String",
  "cancerStage": "String", "ecogStatus": "Number", "activityLevel": "String",
  "reducedFoodIntake": "Number (The % deficit, e.g. if intake is 20%, gap is 80)",
  "albumin": "Number (g/dL)", "crp": "Number (mg/L)", "muac": "Number (cm)", "creatinine": "Number",
  "alt": "Number", "ast": "Number", "bilirubin": "Number", "bloodSugar": "Number",
  "sodium": "Number", "potassium": "Number", "urea": "Number", "tsh": "Number",
  "prealbumin": "Number", "hemoglobin": "Number", "vitD": "Number", "vitB12": "Number", 
  "folate": "Number", "zinc": "Number", "magnesium": "Number",
  "leanBodyMass": "Number", "fatPercent": "Number", "smi": "Number", "handGrip": "Number", "bsa": "Number",
  "giIssues": "Boolean", "allergies": "Array of Strings", "existingSupplements": "Array of Strings",
  "comorbidities": "Array of Strings", "sideEffects": "Array of Strings", "genomicMarkers": "Array of Strings",
  "treatmentTypes": "Array of Strings"
}
`;

app.post('/api/extract', async (req, res) => {
  const { pdfText } = req.body;
  if (!pdfText) return res.status(400).json({ error: 'No text provided.' });

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: extractionSystemPrompt },
        { role: "user", content: `Here is the raw clinical text to extract from:\n\n${pdfText}` }
      ],
      response_format: { type: "json_object" }
    });

    const data = JSON.parse(completion.choices[0].message.content);
    res.json({ success: true, data });
  } catch (error) {
    console.error("OpenAI Extraction Error:", error);
    res.status(500).json({ error: 'Failed to extract data using AI.' });
  }
});

app.post('/api/chat', async (req, res) => {
  const { message, contextObj } = req.body;
  if (!message) return res.status(400).json({ error: 'No message provided.' });

  try {
    let contextStr = "No patient context provided.";
    if (contextObj) {
      contextStr = JSON.stringify(contextObj);
    }

    const systemPrompt = `You are a clinical oncology nutrition assistant (Onvilox AI Co-pilot).
You assist clinicians in filling out forms, evaluating outcomes, and answering oncology nutrition questions.
Use ESMO and ASCO guidelines. Never prescribe medication. Keep answers very concise and professional (under 3 sentences unless asked for details).
Current Patient Context:
${contextStr}
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message }
      ]
    });

    res.json({ reply: completion.choices[0].message.content });
  } catch (error) {
    console.error("OpenAI Chat Error:", error);
    res.status(500).json({ error: 'Failed to generate AI response.' });
  }
});

// --- ANTHROPIC (CLAUDE) INTEGRATION ---
const Anthropic = require('@anthropic-ai/sdk');
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

app.post('/api/claude-report', async (req, res) => {
  // Debug to terminal: what did we actually get?
  console.log("CLAUDE_INCOMING_DATA_KEYS:", Object.keys(req.body || {}));
  
  const { patient, plan } = req.body;
  if (!patient || !plan) {
    return res.status(400).json({ 
        error: 'Context required.', 
        debug_keys: Object.keys(req.body || {}),
        tip: 'Check if express.json() is active and headers are correct.'
    });
  }

  try {
    const msg = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20240620",
      max_tokens: 1024,
      messages: [{
        role: "user",
        content: `You are a Senior Oncology Dietitian (PhD). Based on the following patient data and calculated nutrition plan, generate:
        1. A clinical rationale for the doctor (3 bullet points, highly technical).
        2. Personal instructions for the patient (4 bullet points, simple and encouraging).
        
        Patient: ${JSON.stringify(patient)}
        Generated Plan: ${JSON.stringify(plan)}
        
        Return ONLY a JSON object with keys "rationale" (Array) and "instructions" (Array).`
      }],
    });

    // Extract JSON from Claude's response (handling potential markdown wrapping)
    const rawText = msg.content[0].text;
    const jsonStr = rawText.match(/{[\s\S]*}/)?.[0] || rawText;
    const data = JSON.parse(jsonStr);
    res.json(data);
  } catch (error) {
    console.error("Claude Error:", error);
    res.status(500).json({ error: 'Claude failed to generate clinical insight.' });
  }
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
