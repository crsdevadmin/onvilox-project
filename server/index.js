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
const rawKey = process.env.ANTHROPIC_API_KEY || '';
console.log("ANTHROPIC_KEY_DIAGNOSTIC:", { 
    length: rawKey.length, 
    prefix: rawKey.substring(0, 7) 
});

const anthropic = new Anthropic({
  apiKey: rawKey,
});

// DIAGNOSTIC: List available models for this API key
app.get('/api/list-models', async (req, res) => {
  try {
    const models = await anthropic.models.list();
    res.json({ models: models.data.map(m => m.id) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
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
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 1024,
      messages: [{
        role: "user",
        content: `You are a Senior Oncology Dietitian (PhD, RD) with 20 years of experience in cancer nutrition support. 
You must generate a DYNAMIC, PATIENT-SPECIFIC clinical report based on the EXACT values provided below.

CLINICAL RULES TO APPLY:
- Cachexia: if weight loss > 5% OR albumin < 3.5 g/dL → use 35 kcal/kg, 1.8 g protein/kg (whey isolate preferred)
- Renal risk: if creatinine > 1.3 → restrict protein to 0.8-1.0 g/kg, avoid high phosphorus
- Hyperglycemia: if blood sugar > 126 mg/dL → use Palatinose (low GI), add chromium picolinate 400mcg
- Hyponatremia: if sodium < 135 mEq/L → add 1-2g NaCl supplementation
- Sarcopenia: if SMI < 45 (F) / 55 (M) OR handgrip < 27 (F) / 35 (M) → add leucine 3g/serving, HMB 3g/day
- Enteral escalation: if oral intake deficit > 40% → strongly recommend enteral feeding
- High inflammation: if CRP > 10 mg/L → add EPA 2-4g/day, prioritize anti-inflammatory nutrients
- Elderly (age > 70): minimum protein 1.5 g/kg regardless of other factors
- Liver risk: if ALT/AST elevated → avoid high-dose fat-soluble vitamins, reduce lipid load
- Hepatic cancer: reduce protein to 1.0-1.2 g/kg, use BCAA supplementation
- Bortezomib regimen: BLOCK all antioxidants (Vit C > 500mg, ALA)
- Cisplatin/FOLFOX regimen: add alpha-lipoic acid 600mg for neuroprotection (unless Bortezomib)
- All patients: Vitamin D 2000IU, Omega-3, Zinc 15-30mg, Selenium 50-100mcg baseline

PATIENT DATA (use these EXACT values):
Name: ${patient.name}, Age: ${patient.age}, Sex: ${patient.sex}
Cancer: ${patient.cancer}, Regimen: ${patient.regimen}, Stage: ${patient.cancerStage}
Weight: ${patient.weight}kg, Usual Weight: ${patient.usualWeight}kg, Height: ${patient.height}cm
Weight Loss: ${patient.weightLossPercent}%, Albumin: ${patient.albumin} g/dL, CRP: ${patient.crp} mg/L
Blood Sugar: ${patient.bloodSugar} mg/dL, Sodium: ${patient.sodium} mEq/L, Creatinine: ${patient.creatinine}
Hemoglobin: ${patient.hemoglobin}, ALT: ${patient.alt}, AST: ${patient.ast}
Feeding Method: ${patient.feedingMethod}, Oral Intake: ${100-(patient.reducedFoodIntake||0)}%
SMI: ${patient.smi}, Handgrip: ${patient.handGrip}kg, BMI: ${plan.bmi}
Comorbidities: ${JSON.stringify(patient.comorbidities)}
Side Effects: ${JSON.stringify(patient.sideEffects)}
Allergies: ${JSON.stringify(patient.allergies)}
Cultural Preferences: ${patient.culturalPreferences}

CALCULATED PLAN:
Calories: ${plan.dailyCalories} kcal/day (${plan.kcalPerKg} kcal/kg)
Protein: ${plan.dailyProtein} g/day (${plan.proteinPerKg} g/kg)
Routing: ${plan.prescribedRoute}
Cachexia Flag: ${plan.cachexia}
Protein Type: ${plan.proteinType}
Safety Alerts: ${JSON.stringify(plan.safetyAlerts)}

GENERATE:
1. "rationale": Array of 3 highly technical bullet points for the doctor. Each must reference SPECIFIC lab values, named biochemical pathways, and clinical guideline justification (ESPEN/ASPEN). Must be unique to THIS patient's exact data.
2. "instructions": Array of 4 patient-friendly bullet points. Warm, encouraging, actionable. No jargon. Reference real specifics (e.g. actual foods, timing, what tube feeding means).

Return ONLY a valid JSON object: { "rationale": [...], "instructions": [...] }`
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
