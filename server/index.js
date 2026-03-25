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
      model: "claude-sonnet-4-5-20250929",
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
      model: "claude-sonnet-4-5-20250929",
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

// --- ANTHROPIC (CLAUDE) INTEGRATION ---
const Anthropic = require('@anthropic-ai/sdk');
const rawKey = process.env.ANTHROPIC_API_KEY || '';
const anthropic = new Anthropic({ apiKey: rawKey });

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
        const systemInstruction = `You are a Senior Oncology Dietitian (PhD, RD) generating a structured clinical nutrition report for Onvilox Clinical Nutrition Systems.
Generate a COMPREHENSIVE, PATIENT-SPECIFIC report based on EXACT values provided.
Return ONLY valid JSON. No markdown, no preambles.`;

    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 3500,
      system: systemInstruction,
      messages: [{
        role: "user",
        content: `CLINICAL RULES (EXACT MATCH REQUIRED):
- Tier 3 (Severe/Cachexia): Weight loss >=10% OR albumin <3.5 OR Sarcopenia OR Bulky Tumor -> 35 kcal/kg, 1.8g protein/kg.
- Tier 2 (Moderate Risk): Weight loss 5-10% OR ECOG >=2 OR Age >=70 -> 30 kcal/kg, 1.8g protein/kg.
- Tier 1 (Baseline/Stable): No risk factors above -> 25 kcal/kg, 1.4g protein/kg.
- Supplement Logic: If Oral Intake > 50%, formulation is a GAP-FILLING SUPPLEMENT (Calories = Deficit Portion). If <=50% or Enteral, it is FULL REPLACEMENT.
- Renal Risk (Creatinine >1.3): Protein strictly capped at 0.8g/kg.
- Glycemic Safety: If T2DM/High BS (>180) AND no HbA1c exists -> Add "CRITICAL: HbA1c Screening Required" alert.
- Sodium Safety: For Hyponatremia (Na<135) -> "Target 1-2g NaCl; [SAFETY] Cap correction at +8–10 mEq/L per 24h to avoid ODS."
- Antioxidant Safety: For FOLFOX/Oxaliplatin -> High-dose Vit C (>1000mg) or ALA (600mg) REQUIRES Oncologist Clearance. Do not recommend automatically.
- Bortezomib: BLOCK all antioxidants (Vit C > 500mg and ALA).
- Sarcopenia (SMI<45F/55M or grip<27F/35M): leucine 3g/serving, HMB 3g/day.
- Anemia (Hb<12F/14M): iron 45-60mg elemental + B12 + folate.
- Low Vit D (<30): correction dose 2000-4000 IU/day.
- Inflammation (CRP>10): EPA 2-4g/day.
- All patients: Zinc 15-30mg, Selenium 50-100mcg, B-Complex.

PATIENT DATA (use EXACT values):
Name: ${patient.name}, Age: ${patient.age}, Sex: ${patient.sex}
Cancer: ${patient.cancer}, Stage: ${patient.cancerStage}, Regimen: ${patient.regimen}
ECOG: ${patient.ecogStatus}, Phase: ${JSON.stringify(patient.treatmentTypes)}
Weight: ${patient.weight}kg, Usual Weight: ${patient.usualWeight}kg, Height: ${patient.height}cm
Weight Loss: ${patient.weightLossPercent}%, BMI: ${plan.bmi}
Albumin: ${patient.albumin}g/dL, CRP: ${patient.crp}mg/L, Hemoglobin: ${patient.hemoglobin}g/dL
Blood Sugar: ${patient.bloodSugar}mg/dL, Creatinine: ${patient.creatinine}mg/dL
ALT: ${patient.alt}U/L, AST: ${patient.ast}U/L, Bilirubin: ${patient.bilirubin}mg/dL
Vitamin D: ${patient.vitD}ng/mL, Prealbumin: ${patient.prealbumin || 'Not tested'}, B12: ${patient.vitB12 || 'Not tested'}, Folate: ${patient.folate || 'Not tested'}, Zinc: ${patient.zinc || 'Not tested'}, Magnesium: ${patient.magnesium || 'Not tested'}
SMI: ${patient.smi}, Handgrip: ${patient.handGrip}kg, MUAC: ${patient.muac}cm, LVEF: ${patient.lvef || 'Not tested'}
Feeding: ${patient.feedingMethod}, Oral Intake: ${100-(patient.reducedFoodIntake||0)}%
Comorbidities: ${JSON.stringify(patient.comorbidities)}, Side Effects: ${JSON.stringify(patient.sideEffects)}
Allergies: ${JSON.stringify(patient.allergies)}, Genomic Markers: ${JSON.stringify(patient.genomicMarkers)}

CALCULATED PLAN:
Calories: ${plan.dailyCalories}kcal/day, Protein: ${plan.dailyProtein}g/day
Route: ${plan.prescribedRoute}, Cachexia: ${plan.cachexia}, Protein Type: ${plan.proteinType}

GENERATE exact JSON structure:
{
  "rationale": [
    "Technical bullet 1 for doctor - reference specific biomarkers, pathway names, ESPEN/ASPEN guidelines",
    "Technical bullet 2 - specific drug-nutrient interaction with biochemical mechanism",
    "Technical bullet 3 - outcome-focused clinical reasoning"
  ],
  "instructions": [
    "Patient-friendly instruction 1 - warm, specific, actionable (mention real foods/timing)",
    "Patient-friendly instruction 2",
    "Patient-friendly instruction 3",
    "Patient-friendly instruction 4"
  ],
  "clinicalAlerts": [
    {"type": "CARDIAC|GLYCEMIC|ANEMIA|DRUG|NUTRITION|RENAL", "level": "HIGH|MODERATE|LOW", "message": "Specific alert text referencing exact labs"}
  ],
  "drugInteractions": [
    {"drug": "Drug name", "interaction": "Nutrient/supplement", "advice": "Clinical advice", "risk": "HIGH|MODERATE|LOW"}
  ],
  "micronutrientOrders": [
    {"nutrient": "Name", "labValue": "Value", "dose": "Dose", "rationale": "Rationale", "status": "SUPPLEMENT|MONITOR|CAPPED|EXCLUDED|STANDARD|DEFICIENT|CARDIAC Rx|GLYCEMIC Rx"}
  ],
  "monitoringSchedule": [
    {"frequency": "Frequency", "parameters": "Biomarkers", "threshold": "Action trigger", "responsible": "Owner"}
  ]
}
Return ONLY valid JSON. No markdown.`
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
