const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const corsOptions = {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Claude-Context']
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
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
    // Return full_data if available (complete client-side object), otherwise the DB row
    const patients = result.rows.map(r => r.full_data || r);
    res.json(patients);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Patients: Create
app.post('/api/patients', authenticateToken, async (req, res) => {
  const p = req.body;
  try {
    await pool.query(
      `INSERT INTO patients (
        id, uhic, name, age, sex, height, weight, usual_weight, albumin, crp, muac,
        feeding_method, gi_issues, assigned_doctor_id, created_by_id, status,
        cancer, regimen, sodium, potassium, urea, hba1c, weight_loss_percent,
        reduced_food_intake, hand_grip, smi, allergies, side_effects, comorbidities,
        genomic_markers, created_date, created_by_user_id, full_data,
        creatinine, egfr, alt, ast, bilirubin, blood_sugar, tsh, hemoglobin,
        prealbumin, vit_d, vit_b12, folate, zinc, magnesium, ecog_status,
        cancer_stage, tumor_burden, metastasis_sites, treatment_types, activity_level,
        bsa, lean_body_mass, sarcopenia_status, fat_percent, is_vegetarian,
        cultural_preferences, existing_supplements, store_id, palliative_stage
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
        $17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,
        $34,$35,$36,$37,$38,$39,$40,$41,$42,$43,$44,$45,$46,$47,$48,$49,$50,
        $51,$52,$53,$54,$55,$56,$57,$58,$59,$60,$61,$62
      )
      ON CONFLICT (id) DO UPDATE SET full_data = EXCLUDED.full_data`,
      [
        p.id, p.uhic, p.name, p.age, p.sex, p.height, p.weight,
        p.usualWeight || p.usual_weight, p.albumin, p.crp, p.muac,
        p.feedingMethod || p.feeding_method, !!(p.giIssues || p.gi_issues),
        p.assignedDoctorId || p.assigned_doctor_id, req.user.id,
        p.status || 'CREATED',
        p.cancer, p.regimen, p.sodium, p.potassium, p.urea, p.hba1c,
        p.weightLossPercent || p.weight_loss_percent,
        p.reducedFoodIntake || p.reduced_food_intake,
        p.handGrip || p.hand_grip, p.smi,
        Array.isArray(p.allergies) ? JSON.stringify(p.allergies) : p.allergies,
        Array.isArray(p.sideEffects) ? JSON.stringify(p.sideEffects) : (Array.isArray(p.side_effects) ? JSON.stringify(p.side_effects) : p.side_effects),
        Array.isArray(p.comorbidities) ? JSON.stringify(p.comorbidities) : p.comorbidities,
        Array.isArray(p.genomicMarkers) ? JSON.stringify(p.genomicMarkers) : (Array.isArray(p.genomic_markers) ? JSON.stringify(p.genomic_markers) : p.genomic_markers),
        p.createdDate || p.created_date, p.createdByUserId || req.user.id,
        JSON.stringify(p),
        p.creatinine, p.egfr, p.alt, p.ast, p.bilirubin,
        p.bloodSugar || p.blood_sugar, p.tsh, p.hemoglobin, p.prealbumin,
        p.vitD || p.vit_d, p.vitB12 || p.vit_b12, p.folate, p.zinc, p.magnesium,
        p.ecogStatus || p.ecog_status, p.cancerStage || p.cancer_stage,
        p.tumorBurden || p.tumor_burden,
        Array.isArray(p.metastasisSites) ? JSON.stringify(p.metastasisSites) : p.metastasis_sites,
        Array.isArray(p.treatmentTypes) ? JSON.stringify(p.treatmentTypes) : p.treatment_types,
        p.activityLevel || p.activity_level, p.bsa,
        p.leanBodyMass || p.lean_body_mass,
        p.sarcopeniaStatus || p.sarcopenia_status,
        p.fatPercent || p.fat_percent,
        !!(p.vegetarian || p.is_vegetarian),
        p.culturalPreferences || p.cultural_preferences,
        Array.isArray(p.existingSupplements) ? JSON.stringify(p.existingSupplements) : p.existing_supplements,
        p.storeId || p.store_id, p.palliativeStage || p.palliative_stage
      ]
    );
    res.status(201).json(p);
  } catch (err) {
    console.error('Patient create error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Patients: Get by ID
app.get('/api/patients/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM patients WHERE id = $1', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    const row = result.rows[0];
    res.json(row.full_data || row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Patients: Update
app.put('/api/patients/:id', authenticateToken, async (req, res) => {
  const p = req.body;
  try {
    await pool.query(
      `UPDATE patients SET
        name=$1, age=$2, sex=$3, height=$4, weight=$5, usual_weight=$6,
        albumin=$7, crp=$8, muac=$9, feeding_method=$10, gi_issues=$11,
        status=$12, cancer=$13, regimen=$14, sodium=$15, potassium=$16,
        urea=$17, hba1c=$18, weight_loss_percent=$19, reduced_food_intake=$20,
        hand_grip=$21, smi=$22, allergies=$23, side_effects=$24, comorbidities=$25,
        genomic_markers=$26, full_data=$27, creatinine=$28, alt=$29, ast=$30,
        bilirubin=$31, blood_sugar=$32, tsh=$33, hemoglobin=$34, prealbumin=$35,
        vit_d=$36, vit_b12=$37, folate=$38, zinc=$39, magnesium=$40,
        ecog_status=$41, cancer_stage=$42, tumor_burden=$43,
        metastasis_sites=$44, treatment_types=$45, activity_level=$46,
        bsa=$47, lean_body_mass=$48, sarcopenia_status=$49, fat_percent=$50,
        is_vegetarian=$51, cultural_preferences=$52, existing_supplements=$53,
        store_id=$54, assigned_doctor_id=$55
      WHERE id=$56`,
      [
        p.name, p.age, p.sex, p.height, p.weight,
        p.usualWeight || p.usual_weight, p.albumin, p.crp, p.muac,
        p.feedingMethod || p.feeding_method, !!(p.giIssues || p.gi_issues),
        p.status || 'CREATED', p.cancer, p.regimen, p.sodium, p.potassium,
        p.urea, p.hba1c, p.weightLossPercent || p.weight_loss_percent,
        p.reducedFoodIntake || p.reduced_food_intake,
        p.handGrip || p.hand_grip, p.smi,
        Array.isArray(p.allergies) ? JSON.stringify(p.allergies) : p.allergies,
        Array.isArray(p.sideEffects) ? JSON.stringify(p.sideEffects) : (Array.isArray(p.side_effects) ? JSON.stringify(p.side_effects) : p.side_effects),
        Array.isArray(p.comorbidities) ? JSON.stringify(p.comorbidities) : p.comorbidities,
        Array.isArray(p.genomicMarkers) ? JSON.stringify(p.genomicMarkers) : (Array.isArray(p.genomic_markers) ? JSON.stringify(p.genomic_markers) : p.genomic_markers),
        JSON.stringify(p), p.creatinine, p.alt, p.ast, p.bilirubin,
        p.bloodSugar || p.blood_sugar, p.tsh, p.hemoglobin, p.prealbumin,
        p.vitD || p.vit_d, p.vitB12 || p.vit_b12, p.folate, p.zinc, p.magnesium,
        p.ecogStatus || p.ecog_status, p.cancerStage || p.cancer_stage,
        p.tumorBurden || p.tumor_burden,
        Array.isArray(p.metastasisSites) ? JSON.stringify(p.metastasisSites) : p.metastasis_sites,
        Array.isArray(p.treatmentTypes) ? JSON.stringify(p.treatmentTypes) : p.treatment_types,
        p.activityLevel || p.activity_level, p.bsa,
        p.leanBodyMass || p.lean_body_mass,
        p.sarcopeniaStatus || p.sarcopenia_status,
        p.fatPercent || p.fat_percent,
        !!(p.vegetarian || p.is_vegetarian),
        p.culturalPreferences || p.cultural_preferences,
        Array.isArray(p.existingSupplements) ? JSON.stringify(p.existingSupplements) : p.existing_supplements,
        p.storeId || p.store_id,
        p.assignedDoctorId || p.assigned_doctor_id,
        req.params.id
      ]
    );
    res.json(p);
  } catch (err) {
    console.error('Patient update error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Patients: Delete
app.delete('/api/patients/:id', authenticateToken, async (req, res) => {
  try {
    await pool.query('DELETE FROM patients WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Assessments: Add to patient
app.post('/api/patients/:id/assessments', authenticateToken, async (req, res) => {
  const a = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO assessments (
        id, patient_id, assessment_date, weight, albumin, crp, muac, creatinine,
        alt, ast, bilirubin, blood_sugar, tsh, hemoglobin, prealbumin, vit_d,
        vit_b12, folate, zinc, magnesium, bsa, lean_body_mass, fat_percent,
        gi_issues, reduced_food_intake, notes
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
      RETURNING *`,
      [
        a.id, req.params.id, a.date || new Date().toISOString().split('T')[0],
        a.weight, a.albumin, a.crp, a.muac, a.creatinine,
        a.alt, a.ast, a.bilirubin, a.bloodSugar || a.blood_sugar,
        a.tsh, a.hemoglobin, a.prealbumin, a.vitD || a.vit_d,
        a.vitB12 || a.vit_b12, a.folate, a.zinc, a.magnesium,
        a.bsa, a.leanBodyMass || a.lean_body_mass, a.fatPercent || a.fat_percent,
        !!(a.giIssues || a.gi_issues), a.reducedFoodIntake || a.reduced_food_intake,
        a.notes || ''
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Nutrition Plans: Get all (optionally filtered by patient)
app.get('/api/nutrition-plans', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM nutrition_plans ORDER BY generated_at DESC'
    );
    const plans = result.rows.map(r => r.full_data || {
      id: r.id,
      patientId: r.patient_id,
      version: r.version,
      generatedAt: r.generated_at,
      generatedBy: r.generated_by,
      inputsSnapshot: r.inputs_snapshot,
      engineOutput: r.engine_output,
      overrides: r.overrides,
      finalPlan: r.final_plan,
      rationale: r.rationale,
      overrideNotes: r.override_notes,
      claudeInsights: r.claude_insights
    });
    res.json(plans);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Nutrition Plans: Get for a patient
app.get('/api/nutrition-plans/patient/:patientId', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM nutrition_plans WHERE patient_id = $1 ORDER BY version DESC',
      [req.params.patientId]
    );
    const plans = result.rows.map(r => r.full_data || {
      id: r.id, patientId: r.patient_id, version: r.version,
      generatedAt: r.generated_at, generatedBy: r.generated_by,
      inputsSnapshot: r.inputs_snapshot, engineOutput: r.engine_output,
      overrides: r.overrides, finalPlan: r.final_plan,
      rationale: r.rationale, overrideNotes: r.override_notes,
      claudeInsights: r.claude_insights
    });
    res.json(plans);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Nutrition Plans: Create
app.post('/api/nutrition-plans', authenticateToken, async (req, res) => {
  const pl = req.body;
  try {
    await pool.query(
      `INSERT INTO nutrition_plans (id, patient_id, version, inputs_snapshot, engine_output, overrides, final_plan, rationale, override_notes, generated_by, claude_insights, full_data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (id) DO UPDATE SET full_data = EXCLUDED.full_data, final_plan = EXCLUDED.final_plan, overrides = EXCLUDED.overrides, override_notes = EXCLUDED.override_notes`,
      [
        pl.id, pl.patientId || pl.patient_id, pl.version,
        pl.inputsSnapshot ? JSON.stringify(pl.inputsSnapshot) : null,
        pl.engineOutput ? JSON.stringify(pl.engineOutput) : null,
        pl.overrides ? JSON.stringify(pl.overrides) : null,
        pl.finalPlan ? JSON.stringify(pl.finalPlan) : null,
        pl.rationale || [],
        pl.overrideNotes || '',
        pl.generatedBy || 'ENGINE',
        pl.claudeInsights ? JSON.stringify(pl.claudeInsights) : null,
        JSON.stringify(pl)
      ]
    );
    res.status(201).json(pl);
  } catch (err) {
    console.error('Plan create error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Nutrition Plans: Update
app.put('/api/nutrition-plans/:id', authenticateToken, async (req, res) => {
  const pl = req.body;
  try {
    await pool.query(
      `UPDATE nutrition_plans SET
        overrides=$1, final_plan=$2, override_notes=$3, claude_insights=$4, full_data=$5
       WHERE id=$6`,
      [
        pl.overrides ? JSON.stringify(pl.overrides) : null,
        pl.finalPlan ? JSON.stringify(pl.finalPlan) : null,
        pl.overrideNotes || '',
        pl.claudeInsights ? JSON.stringify(pl.claudeInsights) : null,
        JSON.stringify(pl),
        req.params.id
      ]
    );
    res.json(pl);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Users: Get All (admin)
app.get('/api/users', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, email, phone, role, hospital_name, store_id, created_at FROM users ORDER BY created_at DESC');
    const rows = result.rows.map(u => ({
      ...u,
      username: u.email || u.phone,
      hospitalName: u.hospital_name,
      storeId: u.store_id
    }));
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Users: Create (admin)
app.post('/api/users', authenticateToken, async (req, res) => {
  const { id, name, email, password, role, hospital_name } = req.body;
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (id, name, email, password_hash, role, hospital_name) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, name, email, role, hospital_name',
      [id || `user_${Date.now()}`, name, email, hash, role, hospital_name]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Users: Delete
app.delete('/api/users/:id', authenticateToken, async (req, res) => {
  try {
    await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Users: Reset Password
app.put('/api/users/:id/password', authenticateToken, async (req, res) => {
  const { password } = req.body;
  try {
    const hash = await bcrypt.hash(password, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Stores: Get All
app.get('/api/stores', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM stores ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Stores: Create
app.post('/api/stores', authenticateToken, async (req, res) => {
  const { id, name, hospital, location } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO stores (id, name, hospital, location) VALUES ($1,$2,$3,$4) RETURNING *',
      [id || `store_${Date.now()}`, name, hospital || '', location || '']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Stores: Delete
app.delete('/api/stores/:id', authenticateToken, async (req, res) => {
  try {
    await pool.query('DELETE FROM stores WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Manufacturing Jobs: Get All
app.get('/api/manufacturing-jobs', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM manufacturing_jobs ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Manufacturing Jobs: Create
app.post('/api/manufacturing-jobs', authenticateToken, async (req, res) => {
  const j = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO manufacturing_jobs (id, patient_id, store_id, doctor_id, status, history) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [j.id, j.patientId, j.storeId, j.doctorId, j.status || 'APPROVED', JSON.stringify(j.history || [])]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Manufacturing Jobs: Update Status
app.put('/api/manufacturing-jobs/:id', authenticateToken, async (req, res) => {
  const { status, history } = req.body;
  try {
    const result = await pool.query(
      'UPDATE manufacturing_jobs SET status=$1, history=$2, updated_at=NOW() WHERE id=$3 RETURNING *',
      [status, JSON.stringify(history || []), req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mappings: Get doctor-assistant map
app.get('/api/mappings', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM doctor_assistant_map');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mappings: Create
app.post('/api/mappings', authenticateToken, async (req, res) => {
  const { assistantId, doctorId } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO doctor_assistant_map (assistant_id, doctor_id) VALUES ($1,$2) RETURNING *',
      [assistantId, doctorId]
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
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1600,
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
    RULE: "cancer" MUST include the specific subtype in format "Cancer Type - Subtype". Examples: "Breast Cancer - Triple Negative", "Breast Cancer - HER2+", "Breast Cancer - HR+/HER2-", "Breast Cancer - Metastatic HR+", "Lung Cancer - NSCLC Adenocarcinoma", "Lung Cancer - NSCLC Squamous", "Lung Cancer - EGFR Mutant", "Lung Cancer - ALK+", "Lung Cancer - SCLC Extensive", "Colorectal Cancer - Stage III", "Colorectal Cancer - Metastatic", "Lymphoma - DLBCL", "Lymphoma - Hodgkin", "Multiple Myeloma - Standard", "Ovarian Cancer - Epithelial". NEVER return just "Breast Cancer" or "Lung Cancer" without the subtype.
    RULE: "feedingMethod" MUST be EXACTLY one of: "Oral Feeding (Normal Diet)" | "Oral Nutrition Supplements (ONS)" | "Enteral Feeding – Nasogastric Tube (NG)" | "Enteral Feeding – PEG Tube" | "Enteral Feeding – Jejunostomy (J-Tube)" | "Parenteral Nutrition (TPN)" | "Combination Feeding (Oral + Enteral)" | "Combination Feeding (Enteral + Parenteral)". Never return "Oral" or "Enteral" alone.
    RULE: "regimen" must use protocol notation matching clinical usage — e.g., "AC -> Taxane ± Pembrolizumab", "FOLFOX", "R-CHOP", "Carboplatin + Paclitaxel ± Pembrolizumab", "TCH (Docetaxel + Carboplatin + Trastuzumab)". Do NOT use shorthand like "AC-T Protocol".
    RULE: "sex" must be "Male" or "Female" (not M/F).
    Schema: { "name":str, "age":num, "sex":"Male"/"Female", "weight":num, "height":num, "usualWeight":num, "reducedFoodIntake":num, "albumin":num, "crp":num, "cancer":str, "regimen":str, "creatinine":num, "alt":num, "ast":num, "bilirubin":num, "bloodSugar":num, "sodium":num, "potassium":num, "urea":num, "muac":num, "prealbumin":num, "vitD":num, "vitB12":num, "folate":num, "zinc":num, "magnesium":num, "tsh":num, "hba1c":num, "hemoglobin":num, "sarcopeniaStatus":str, "activityLevel":str, "ecogStatus":num, "leanBodyMass":num, "smi":num, "handGrip":num, "fatPercent":num, "feedingMethod":str, "giIssues":bool, "comorbidities":[], "sideEffects":[], "existingSupplements":[], "allergies":[], "metastasisSites":[], "genomicMarkers":[], "notes":str }
    Format: { "reply": "Short answer (<3 sentences)", "extractedData": { ...found values... } }`;

    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: "user", content: message }],
    });

    const rawText = msg.content[0].text;
    let data;
    try {
      // Robust Parser V5.1: Find the OUTERMOST curly braces
      let start = rawText.indexOf('{');
      let end = rawText.lastIndexOf('}');
      
      if (start !== -1) {
          let jsonCandidate = (end !== -1 && end > start) ? 
                              rawText.substring(start, end + 1) : 
                              rawText.substring(start);
          
          // Truncation Recovery: If JSON is cut off, try to close it
          let openBraces = (jsonCandidate.match(/\{/g) || []).length;
          let closeBraces = (jsonCandidate.match(/\}/g) || []).length;
          while (closeBraces < openBraces) {
              jsonCandidate += "}";
              closeBraces++;
          }

          try {
              data = JSON.parse(jsonCandidate);
          } catch (e) {
              // Last ditch: try to fix common truncation at end of string
              const fixed = jsonCandidate.replace(/,\s*$/, "").replace(/\"$/, "").trim();
              data = JSON.parse(fixed + "}".repeat(openBraces - (fixed.match(/\}/g) || []).length));
          }
      } else {
          throw new Error("No JSON braces found");
      }
      
      // Structural Normalization: Ensure { reply, extractedData } exists
      const commonKeys = ['name', 'age', 'weight', 'height', 'cancer', 'regimen', 'albumin', 'crp', 'notes'];
      
      if (data.extractedData && typeof data.extractedData === 'object') {
          // Already have extractedData, but make sure it's not JUST a reply
          data.reply = data.reply || data.extractedData.reply || "Clinical extraction complete.";
      } else {
          // Flattened response or mixed response
          const reply = data.reply || "Clinical extraction complete.";
          const extracted = { ...data };
          delete extracted.reply;
          
          // Check if it actually contains ANY data keys beyond the reply
          const hasKeys = Object.keys(extracted).length > 0;
          
          data = {
              reply: reply,
              extractedData: hasKeys ? extracted : null
          };
      }
    } catch (e) {
      console.warn("AI Parser Error:", e.message);
      // Fallback: Greedy match outermost braces
      try {
          const match = rawText.match(/\{[\s\S]*\}/)?.[0];
          if (match) {
              const parsed = JSON.parse(match);
              const { reply, ...rest } = (parsed.extractedData || parsed);
              data = { 
                  reply: parsed.reply || reply || "Extraction fallback successful.", 
                  extractedData: Object.keys(rest).length > 0 ? rest : null
              };
          } else {
              throw new Error("No braces in fallback");
          }
      } catch (e2) {
          data = { reply: rawText, extractedData: null };
      }
    }
    
    // Final check for empty objects
    if (data.extractedData && Object.keys(data.extractedData).length === 0) {
        data.extractedData = null;
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

// In-memory job store for async AI report generation
const __aiJobs = {};

app.get('/api/claude-report/status/:jobId', (req, res) => {
  const job = __aiJobs[req.params.jobId];
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

app.post('/api/claude-report', async (req, res) => {
  const { patient, plan } = req.body;
  if (!patient || !plan) return res.status(400).json({ error: 'Context required.' });

  // Return a jobId immediately so Cloudflare doesn't timeout
  const jobId = 'job_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  __aiJobs[jobId] = { status: 'pending' };
  res.json({ jobId });

  // Run Claude in background (no await — response already sent)
  (async () => {

  try {
    const system = `You are the Onvilox Clinical AI Auditor — Oncology RD/PhD level. You receive a patient profile and a rules-engine-generated nutrition plan. Your job is to:
1. Validate every clinical parameter against the rules below
2. Generate a full safety alert list — do NOT omit any that apply
3. Correct the prescription if it is clinically wrong
4. Produce a complete drug-nutrient interaction table for every drug in the regimen
5. Produce a complete micronutrient orders table for every relevant nutrient
6. Produce a full monitoring schedule
7. Produce patient-facing dietary instructions
8. Score the plan honestly

CLINICAL VALIDATION RULES — apply every rule to every patient:

ENTERAL ESCALATION:
- If reducedFoodIntake > 40 (meaning actual oral intake < 60% of requirements), generate a HIGH clinicalAlert with type "EN_ESCALATION_MANDATORY".
- State that nasogastric or nasoduodenal tube feeding must be initiated immediately per ESPEN guidelines.
- If intake is 40–60% (borderline), generate MODERATE alert for intensive ONS escalation.

PROTEIN SAFETY:
- The renal protein cap of 0.8 g/kg applies ONLY when creatinine > 1.3 mg/dL (KDIGO guideline). If creatinine ≤ 1.3, this cap must NOT be applied.
- For cachexia OR sarcopenia patients with creatinine ≤ 1.3: minimum protein is 1.8 g/kg.
- For patients with BOTH (cachexia OR sarcopenia) AND (immunotherapy checkpoint inhibitor — pembrolizumab, nivolumab, atezolizumab, durvalumab — OR platinum agents): minimum protein is 2.0 g/kg due to combined immunometabolic and anti-catabolic demand.
- If totalDailyProtein is below weight × 1.6 g/kg AND creatinine ≤ 1.3 AND cachexia or sarcopenia present: generate HIGH alert "PROTEIN_CRITICAL_UNDERDOSE", set isOverpowered:true, correctedPrescription.dailyProtein = weight × 1.8 (or × 2.0 if immunotherapy or platinum also present).
- If totalDailyProtein is below weight × 1.9 g/kg AND patient has BOTH (cachexia or sarcopenia) AND (immunotherapy or platinum): generate HIGH alert "PROTEIN_UNDERDOSE_IMMUNOTHERAPY", set isOverpowered:true, correctedPrescription.dailyProtein = weight × 2.0. State that 2.0 g/kg is the minimum for this immunometabolic profile and that underdosing accelerates muscle catabolism, worsens sarcopenia, and increases chemotherapy toxicity risk.

ANTIFOLATE TOXICITY:
- If the regimen contains Pemetrexed, Methotrexate, or FOLFIRINOX AND patient folate < 5 ng/mL: generate HIGH alert type "FOLATE_DEFICIENCY_ANTIFOLATE".
- State that folate deficiency on antifolate therapy significantly increases risk of severe mucositis, myelosuppression, and treatment-limiting neutropenia.
- Folate repletion must be initiated before the next chemotherapy cycle. Specify the repletion dose (5 mg/day folic acid), the timing of the follow-up serum folate test (Day 7 after commencing supplementation), and the cycle-day checkpoint (serum folate must be confirmed ≥ 5 ng/mL before Cycle N+1 Day 1).
- Include folate supplementation in micronutrientOrders with status DEFICIENT and dose "5 mg/day folic acid — recheck serum folate Day 7; confirm ≥5 ng/mL before next cycle."

VITAMIN D:
- vitD < 20 ng/mL = deficient. Prescribe 4000 IU/day repletion — NOT 2000 IU/day which is a maintenance dose only.
- vitD < 12 ng/mL = severe deficiency. Prescribe 50,000 IU/week for 8 weeks then recheck.
- vitD 20–30 ng/mL = insufficient. Prescribe 2000 IU/day maintenance.
- Always note the distinction between repletion and maintenance in micronutrientOrders.

ANAEMIA & IRON:
- Hemoglobin < 12 g/dL: generate MODERATE alert for anaemia.
- If iron studies (ferritin, serum iron, TIBC) are absent from the lab panel: generate HIGH alert type "IRON_PANEL_MANDATORY" and flag iron panel as a mandatory investigation.
- If oral intake < 60%: recommend IV iron over oral supplementation due to impaired GI absorption.
- In micronutrientOrders, set iron status to "HOLD" and dose to "ON CLINICAL HOLD — Pending iron panel (ferritin, serum iron, TIBC, transferrin saturation) before empirical dosing."
- Include iron assessment in monitoringSchedule.

LIVER FUNCTION:
- ALT > 40 U/L or AST > 40 U/L: generate MODERATE alert requiring fortnightly LFT monitoring.
- If patient has liver metastases or is on a hepatotoxic regimen (platinum agents, taxanes, anthracyclines): add hepatology escalation threshold of 3× ULN.
- Include LFTs in monitoringSchedule with escalation trigger.

GLUTAMINE CAUTION:
- If glutamine is prescribed AND tumor burden is High or Bulky: add a LOW informational note in micronutrientOrders with status "MONITOR" noting that glutamine use in high-burden settings should be reviewed at the next oncology MDT.
- Do NOT generate a blocking alert or set HOLD status for glutamine.

STEROID-INDUCED HYPERGLYCAEMIA & MACRO REDISTRIBUTION:
- If HbA1c is 5.7–6.4% OR fasting blood sugar is 100–125 mg/dL (pre-diabetic range) AND the regimen includes dexamethasone or steroid-containing chemotherapy: generate MODERATE alert.
- Recommend blood glucose monitoring before and 2 hours after each dexamethasone dose.
- If HbA1c ≥ 6.5% (diabetic range) OR blood sugar > 140 mg/dL OR patient comorbidities include Fatty Liver Disease (NAFLD/MAFLD/NASH/steatohepatitis): the macro distribution MUST be corrected. Set isOverpowered: true. Fat must not exceed 30% of totalDailyCalories: set dailyFat = totalDailyCalories × 0.30 / 9, then set dailyCarbs = (totalDailyCalories − dailyProtein×4 − dailyFat×9) / 4. Distribute carbs across 5–6 small meals for glycaemic control. Provide the corrected gram values for dailyCarbs and dailyFat in correctedPrescription.
- Include glycaemic monitoring in monitoringSchedule.

IMMUNOTHERAPY MONITORING:
- If regimen includes Pembrolizumab, Nivolumab, Atezolizumab, or Durvalumab: TSH monitoring every treatment cycle is MANDATORY.
- If TSH is absent from the lab panel: generate HIGH alert type "IMMUNOTHERAPY_TSH_MISSING" — this is a patient safety requirement.
- If TSH is absent AND patient sideEffects include fatigue, tiredness, or weakness: add an additional note in the alert that current fatigue symptoms must be assessed as a possible immune-related adverse event (irAE — immune thyroiditis) while TSH is pending. Do not attribute fatigue solely to chemotherapy until thyroid function is confirmed.
- Include thyroid function in monitoringSchedule with per-cycle frequency and TSH thresholds (<0.5 or >4.5 mIU/L → endocrinology referral).

ANTIOXIDANT SAFETY:
- If regimen includes Bortezomib, AC (Doxorubicin + Cyclophosphamide), Oxaliplatin, or Cisplatin: Vitamin C > 500 mg/day and Alpha-Lipoic Acid are CONTRAINDICATED during those specific cycles as they may reduce chemotherapy efficacy via ROS-dependent cytotoxic mechanisms.
- If any such supplement is present in the plan without phase-specific suspension guidance: generate HIGH clinicalAlert.
- Mark these as EXCLUDED in micronutrientOrders.
- PHASE-SPECIFIC ALA RULE (sequential regimens): If the regimen is AC → Taxane (or any anthracycline-first sequential protocol), ALA may be prescribed therapeutically during the Taxane phase for peripheral neuropathy prevention, BUT must be explicitly SUSPENDED during all AC/anthracycline cycles. If the plan prescribes ALA without this phase-specific suspension instruction documented, generate a MODERATE alert type "ALA_PHASE_SUSPENSION_MISSING" stating: "ALA must be held during AC cycles and resumed only at Taxane phase commencement. Continuous ALA administration through AC cycles risks attenuating doxorubicin cytotoxicity."

BCAA & LEUCINE OVERLAP:
- If BCAA ≥ 15g/day AND Leucine is also prescribed separately: flag MODERATE alert for potential leucine excess (>13–15g/day total may exceed anabolic threshold and cause metabolic stress).

ALA EXCLUSION ON CISPLATIN:
- ALA is contraindicated during Cisplatin cycles (same rationale as oxaliplatin — platinum cytotoxicity relies on oxidative stress; ALA antioxidant activity may attenuate efficacy).
- If ALA is prescribed AND the regimen includes Cisplatin: generate HIGH alert type "ALA_CISPLATIN_CONTRAINDICATION" and set status EXCLUDED in micronutrientOrders for ALA.
- For peripheral neuropathy management on Cisplatin in a diabetic patient: recommend High-potency B-Complex only. Do NOT recommend ALA as a substitute during active Cisplatin cycles.

CISPLATIN RENAL BORDERLINE:
- If creatinine is between 1.2–1.3 mg/dL AND regimen includes Cisplatin: generate MODERATE alert type "RENAL_BORDERLINE_CISPLATIN" noting creatinine is at the nephrotoxicity threshold, weekly monitoring is mandatory, and the escalation trigger is >1.5 mg/dL (hold Cisplatin, escalate to nephrology). Do NOT classify this as "Normal."

RADIATION ENTERITIS FORMULA ADAPTATION:
- If treatmentTypes includes any form of radiation (pelvic, abdominal, EBRT, brachytherapy) OR comorbidities/sideEffects include radiation enteritis: the formula protein source MUST be peptide-based or hydrolysed whey. Flag in micronutrientOrders and rationale that intact disaccharides (e.g. Palatinose) are contraindicated — low-residue carbohydrate only. If brachytherapy is planned, note elemental formula may be required peri-procedure. Generate MODERATE alert type "RADIATION_ENTERITIS_FORMULA" if the prescribed formula uses non-adapted protein or high-residue carbohydrates.

DRUG INTERACTIONS:
- For EVERY drug or drug class named in the regimen, you MUST generate a drugInteractions entry.
- Never return an empty drugInteractions array for a patient on active chemotherapy.
- Include: Cisplatin (renal Mg wasting + nephrotoxicity threshold monitoring), Carboplatin (myelosuppression + nutrition timing), Paclitaxel/Docetaxel (peripheral neuropathy — B12/B6 relevance), Doxorubicin (cardiotoxicity — antioxidant caution), Cyclophosphamide (nausea/hydration), Pembrolizumab/nivolumab (immune enterocolitis, TSH), Pemetrexed (folate protocol), 5-FU/Capecitabine (mucositis, folate timing), Bevacizumab (wound healing, protein adequacy), Bortezomib (neuropathy, antioxidant exclusion).

ARITHMETIC VERIFICATION:
- Verify: onsCalories ÷ servingsPerDay ≈ perServingCalories (±5 kcal tolerance). Flag discrepancy in logicRefinements.
- Verify: (totalDailyProtein × 4) + (dailyCarbs × 4) + (dailyFat × 9) ≤ totalDailyCalories × 1.05. Flag if macros significantly exceed total calories.
- Verify: prescribedProtein ÷ weight = proteinPerKg matches stated proteinPerKg (±0.1 tolerance).

SCORING (max 9.8):
- Start at 9.8. This ceiling represents a clinically complete, arithmetically correct plan with all mandatory labs present and no safety violations.
- Deduct 1.5 for each HIGH/unresolved CRITICAL alert.
- Deduct 0.5 for each MODERATE gap.
- Deduct 0.3 for each missing mandatory investigation.
- Deduct 0.5 for each arithmetic error.
- Do NOT round up to 10.0. A plan with 3+ HIGH issues should score ≤ 5.3.

OVERPOWER CORRECTION:
- Set isOverpowered: true and provide correctedPrescription values if:
  (a) protein is underdosed per PROTEIN SAFETY rules above, OR
  (b) totalDailyCalories deviates > 15% from weight × appropriate kcal/kg (25–35 kcal/kg based on cachexia/sarcopenia), OR
  (c) NAFLD / NASH / non-alcoholic fatty liver disease is in comorbidities AND (dailyFat × 9) > (totalDailyCalories × 0.30) — fat ceiling 30% is a hard clinical protocol for hepatic steatosis.
- For case (c): correctedPrescription.dailyCalories = input totalDailyCalories (unchanged), correctedPrescription.dailyProtein = input totalDailyProtein (unchanged). Compute correctedPrescription.dailyFat = floor(totalDailyCalories × 0.30 / 9) and correctedPrescription.dailyCarbs = floor((totalDailyCalories - (dailyProtein × 4) - (correctedDailyFat × 9)) / 4). Reasoning must state: "NAFLD fat ceiling 30% violated — fat [X]g ([X]%) corrected to [Y]g (30%); excess redistributed to carbohydrates [Z]g."
- Always provide a clinical reasoning string explaining the correction.

CRITICAL — CLINICAL ALERTS COMPLETENESS:
Every safety violation you identify — whether mentioned in rationale, logicRefinements, or instructions — MUST also appear as a structured entry in the clinicalAlerts array with the correct type and level. An empty or incomplete clinicalAlerts array while safety issues exist is a critical reporting failure. Do NOT summarise issues only in rationale and leave clinicalAlerts empty or partial.

OUTPUT FORMAT — return ONLY valid JSON, no markdown, no text outside the JSON object. CRITICAL: never embed literal newline or tab characters inside JSON string values — use \\n and \\t escape sequences if line breaks are needed in text, or omit them entirely. All string values must be valid single-line JSON strings.
{
  "validationScore": number,
  "rationale": ["string 1", "string 2", "string 3", "string 4", "string 5"],
  "instructions": ["patient instruction 1", "patient instruction 2", "patient instruction 3", "patient instruction 4", "patient instruction 5", "patient instruction 6"],
  "clinicalAlerts": [{"type": "string", "level": "HIGH|MODERATE|LOW", "message": "string"}],
  "correctedPrescription": {"isOverpowered": false, "dailyCalories": number, "dailyProtein": number, "dailyCarbs": number, "dailyFat": number, "reasoning": "string"},
  "logicRefinements": ["string 1", "string 2"],
  "drugInteractions": [{"drug": "string", "interaction": "string", "advice": "string", "risk": "HIGH|MODERATE|LOW"}],
  "micronutrientOrders": [{"nutrient": "string", "labValue": "string", "dose": "string", "rationale": "string", "status": "SUPPLEMENT|DEFICIENT|MONITOR|CAPPED|EXCLUDED|HOLD|STANDARD"}],
  "monitoringSchedule": [{"frequency": "string", "parameters": "string", "threshold": "string", "responsible": "string"}]
}`;

    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      system: system,
      messages: [{
        role: "user",
        content: `AUDIT: Patient: ${JSON.stringify(patient)} Plan: ${JSON.stringify(plan)}`
      }]
    });

    const rawText = msg.content[0].text;
    let data;

    // Escape literal control characters that appear inside JSON string values.
    // Claude occasionally writes real newlines/tabs within long string values which
    // produces "Expected ',' or ']'" errors even when the rest of the JSON is valid.
    function escapeControlsInStrings(s) {
      let out = '', inStr = false;
      for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (!inStr) {
          out += ch;
          if (ch === '"') inStr = true;
        } else {
          if (ch === '\\') { out += ch + (s[++i] || ''); } // skip already-escaped pair
          else if (ch === '"') { out += ch; inStr = false; }
          else if (ch === '\n') out += '\\n';
          else if (ch === '\r') out += '\\r';
          else if (ch === '\t') out += '\\t';
          else if (ch.charCodeAt(0) < 32) out += ' ';
          else out += ch;
        }
      }
      return out;
    }

    try {
      // Strip markdown code fences if Claude wrapped the output
      let jsonStr = rawText.replace(/^```(?:json)?\s*/m, '').replace(/```\s*$/m, '').trim();
      const jsonStart = jsonStr.indexOf('{');
      if (jsonStart < 0) throw new Error("No JSON");
      jsonStr = jsonStr.slice(jsonStart);

      // Pass 0: sanitize literal control chars inside string values
      jsonStr = escapeControlsInStrings(jsonStr);

      // Pass 1: balance unclosed braces AND brackets
      const openB = (jsonStr.match(/{/g) || []).length;
      const closeB = (jsonStr.match(/}/g) || []).length;
      const openArr = (jsonStr.match(/\[/g) || []).length;
      const closeArr = (jsonStr.match(/\]/g) || []).length;
      if (openArr > closeArr) jsonStr += ']'.repeat(openArr - closeArr);
      if (openB > closeB) jsonStr += '}'.repeat(openB - closeB);

      // Pass 2: direct parse
      try {
        data = JSON.parse(jsonStr);
      } catch {
        // Pass 3: truncate at last cleanly-closed boundary
        const lastClean = Math.max(jsonStr.lastIndexOf('],'), jsonStr.lastIndexOf('},'));
        if (lastClean > 10) {
          let trimmed = jsonStr.substring(0, lastClean + 1);
          const o2 = (trimmed.match(/{/g) || []).length;
          const c2 = (trimmed.match(/}/g) || []).length;
          const oa2 = (trimmed.match(/\[/g) || []).length;
          const ca2 = (trimmed.match(/\]/g) || []).length;
          if (oa2 > ca2) trimmed += ']'.repeat(oa2 - ca2);
          trimmed += '}'.repeat(Math.max(0, o2 - c2));
          data = JSON.parse(trimmed);
        } else {
          throw new Error('Unrecoverable parse failure');
        }
      }
    } catch (e) {
      console.error("Claude report parse failed, raw length:", rawText?.length, e.message);
      // Salvage whatever fields are present via regex rather than returning nothing
      const grabArr = (key) => { try { const m = rawText.match(new RegExp(`"${key}"\\s*:\\s*(\\[[\\s\\S]*?\\])`)); return m ? JSON.parse(m[1]) : []; } catch { return []; } };
      const grabNum = (key) => { const m = rawText.match(new RegExp(`"${key}"\\s*:\\s*([\\d.]+)`)); return m ? parseFloat(m[1]) : null; };
      data = {
        validationScore: grabNum('validationScore'),
        rationale: grabArr('rationale'),
        instructions: grabArr('instructions'),
        clinicalAlerts: grabArr('clinicalAlerts'),
        correctedPrescription: { isOverpowered: false, dailyCalories: null, dailyProtein: null, reasoning: 'Response truncated — re-run audit.' },
        logicRefinements: grabArr('logicRefinements'),
        drugInteractions: grabArr('drugInteractions'),
        micronutrientOrders: grabArr('micronutrientOrders'),
        monitoringSchedule: grabArr('monitoringSchedule')
      };
    }
    __aiJobs[jobId] = { status: 'done', data };
    // Clean up job after 10 minutes
    setTimeout(() => { delete __aiJobs[jobId]; }, 10 * 60 * 1000);
  } catch (error) {
    console.error("Claude Report Error:", error);
    __aiJobs[jobId] = { status: 'error', error: error.message };
  }
  })();
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
