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
    const msg = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 2000,
      system: extractionSystemPrompt,
      messages: [
        { role: "user", content: `Here is the raw clinical text to extract from:\n\n${pdfText}\n\nReturn ONLY a JSON object.` }
      ],
    });

    const rawText = msg.content[0].text;
    const jsonStr = rawText.match(/{[\s\S]*}/)?.[0] || rawText;
    const data = JSON.parse(jsonStr);
    res.json({ success: true, data });
  } catch (error) {
    console.error("Claude Extraction Error:", error);
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

    const msg = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 1000,
      system: systemPrompt,
      messages: [
        { role: "user", content: message }
      ],
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
      max_tokens: 3000,
      messages: [{
        role: "user",
        content: `You are a Senior Oncology Dietitian (PhD, RD) generating a structured clinical nutrition report for Onvilox Clinical Nutrition Systems.
Generate a COMPREHENSIVE, PATIENT-SPECIFIC report based on EXACT values below.

CLINICAL RULES:
- Cachexia: weight loss >5% OR albumin <3.5 → 35 kcal/kg, 1.8g protein/kg (whey isolate, leucine-rich)
- No cachexia + ECOG 0-1: 25-30 kcal/kg, 1.2-1.5g protein/kg
- Renal risk (creatinine >1.3): restrict protein 0.8-1.0g/kg, avoid phosphorus
- HER2+/Trastuzumab/Pertuzumab: CoQ10 200mg/day, Omega-3 3g/day, Na <2g/day, LVEF monitoring
- Docetaxel/Taxane: cap Vit C 500mg, NO ALA (antioxidant interference)
- Bortezomib: BLOCK all antioxidants (Vit C >500mg AND ALA)
- FOLFOX/Cisplatin/Carboplatin: ALA 600mg neuroprotection (unless Bortezomib), Mg supplementation, monitor Mg wasting
- Hyperglycemia (BG>126 or HbA1c>5.7): Palatinose (low-GI), chromium picolinate 200-400mcg
- Hyponatremia (Na<135): 1-2g NaCl supplementation
- Sarcopenia (SMI<45F/55M or grip<27F/35M): leucine 3g/serving, HMB 3g/day
- Anemia (Hb<12F/14M): iron 45-60mg elemental + B12 + folate
- Low Vit D (<30): correction dose 2000-4000 IU/day
- Inflammation (CRP>10): EPA 2-4g/day, anti-inflammatory focus
- All patients: Vit D, Omega-3, Zinc 15-30mg, Selenium 50-100mcg, B-Complex baseline

PATIENT DATA (use EXACT values):
Name: ${patient.name}, Age: ${patient.age}, Sex: ${patient.sex}
Cancer: ${patient.cancer}, Stage: ${patient.cancerStage}, Regimen: ${patient.regimen}
ECOG: ${patient.ecogStatus}, Phase: ${patient.treatmentTypes}
Weight: ${patient.weight}kg, Usual Weight: ${patient.usualWeight}kg, Height: ${patient.height}cm
Weight Loss: ${patient.weightLossPercent}%, BMI: ${plan.bmi}
Albumin: ${patient.albumin}g/dL, Prealbumin: ${patient.prealbumin || 'Not tested'}
CRP: ${patient.crp}mg/L, Hemoglobin: ${patient.hemoglobin}g/dL
Blood Sugar: ${patient.bloodSugar}mg/dL, HbA1c: ${patient.hba1c || 'Not tested'}
Sodium: ${patient.sodium}mEq/L, Potassium: ${patient.potassium}mEq/L, Magnesium: ${patient.magnesium || 'Not tested'}mg/dL
Creatinine: ${patient.creatinine}mg/dL, ALT: ${patient.alt}U/L, AST: ${patient.ast}U/L, Bilirubin: ${patient.bilirubin}mg/dL
Vitamin D: ${patient.vitD}ng/mL, B12: ${patient.vitB12 || 'Not tested'}, Folate: ${patient.folate || 'Not tested'}, Zinc: ${patient.zinc || 'Not tested'}
SMI: ${patient.smi}, Handgrip: ${patient.handGrip}kg, MUAC: ${patient.muac}cm, LVEF: ${patient.lvef || 'Not tested'}
Feeding: ${patient.feedingMethod}, Oral Intake: ${100-(patient.reducedFoodIntake||0)}%
Comorbidities: ${JSON.stringify(patient.comorbidities)}, Allergies: ${JSON.stringify(patient.allergies)}
Side Effects: ${JSON.stringify(patient.sideEffects)}, Cultural Preferences: ${patient.culturalPreferences}

CALCULATED PLAN:
Calories: ${plan.dailyCalories}kcal/day (${plan.kcalPerKg}kcal/kg), Protein: ${plan.dailyProtein}g/day (${plan.proteinPerKg}g/kg)
Route: ${plan.prescribedRoute}, Cachexia: ${plan.cachexia}, Protein Type: ${plan.proteinType}
Safety Alerts: ${JSON.stringify(plan.safetyAlerts)}

GENERATE this exact JSON structure:
{
  "rationale": [
    "Technical bullet 1 for doctor - reference specific biomarkers, pathway names, ESPEN/ASPEN guideline numbers",
    "Technical bullet 2 - specific drug-nutrient interaction with biochemical mechanism",
    "Technical bullet 3 - outcome-focused clinical reasoning with specific targets"
  ],
  "instructions": [
    "Patient-friendly instruction 1 - warm, specific, actionable (mention real foods/timing)",
    "Patient-friendly instruction 2",
    "Patient-friendly instruction 3",
    "Patient-friendly instruction 4 - encouraging, hope-focused"
  ],
  "clinicalAlerts": [
    {"type": "CARDIAC|GLYCEMIC|ANEMIA|DRUG|NUTRITION|RENAL", "level": "HIGH|MODERATE|LOW", "message": "Specific alert text referencing exact lab values"}
  ],
  "drugInteractions": [
    {"drug": "Drug name", "interaction": "Specific nutrient/supplement that interacts", "advice": "Precise clinical advice with doses", "risk": "HIGH|MODERATE|LOW"}
  ],
  "micronutrientOrders": [
    {"nutrient": "Nutrient name", "labValue": "e.g. 22 ng/mL or Not tested", "dose": "Specific dose with units", "rationale": "One-line clinical rationale", "status": "SUPPLEMENT|MONITOR|CAPPED|EXCLUDED|STANDARD|DEFICIENT|CARDIAC Rx|GLYCEMIC Rx"}
  ],
  "monitoringSchedule": [
    {"frequency": "e.g. Every 2 weeks", "parameters": "What to measure", "threshold": "Action trigger value", "responsible": "Who monitors"}
  ]
}

Rules:
- Reference EXACT lab values from patient data in every section
- drugInteractions must ONLY include drugs from the actual regimen
- clinicalAlerts must ONLY flag actual abnormal findings from patient labs
- micronutrientOrders must be specific to this patient's deficiencies and regimen
- Return ONLY valid JSON, no markdown, no extra text`
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
