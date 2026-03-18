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

// Patients: Get One
app.get('/api/patients/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM patients WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Patient not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Patients: Create
app.post('/api/patients', authenticateToken, async (req, res) => {
  const p = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO patients (
        id, uhic, name, age, sex, height, weight, usual_weight, albumin, crp, muac, 
        creatinine, egfr, alt, ast, bilirubin, blood_sugar, tsh, hemoglobin, prealbumin, 
        vit_d, vit_b12, folate, zinc, magnesium, ecog_status, cancer_stage, tumor_burden, 
        metastasis_sites, treatment_types, palliative_stage, activity_level, bsa, 
        lean_body_mass, sarcopenia_status, fat_percent, is_vegetarian, cultural_preferences, 
        existing_supplements, feeding_method, gi_issues, assigned_doctor_id, created_by_id, status
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, 
        $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, 
        $35, $36, $37, $38, $39, $40, $41, $42, $43, $44
      ) RETURNING *`,
      [
        p.id, p.uhic, p.name, p.age, p.sex, p.height, p.weight, p.usual_weight, p.albumin, p.crp, p.muac,
        p.creatinine, p.egfr, p.alt, p.ast, p.bilirubin, p.blood_sugar, p.tsh, p.hemoglobin, p.prealbumin,
        p.vit_d, p.vit_b12, p.folate, p.zinc, p.magnesium, p.ecog_status, p.cancer_stage, p.tumor_burden,
        JSON.stringify(p.metastasis_sites || []), JSON.stringify(p.treatment_types || []), p.palliative_stage, p.activity_level, p.bsa,
        p.lean_body_mass, p.sarcopenia_status, p.fat_percent, p.is_vegetarian, p.cultural_preferences,
        JSON.stringify(p.existing_supplements || []), p.feeding_method, p.gi_issues, p.assigned_doctor_id, req.user.id, p.status || 'CREATED'
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Patients: Update
app.put('/api/patients/:id', authenticateToken, async (req, res) => {
  const p = req.body;
  try {
    const result = await pool.query(
      `UPDATE patients SET 
        name=$1, age=$2, sex=$3, height=$4, weight=$5, usual_weight=$6, albumin=$7, crp=$8, muac=$9,
        creatinine=$10, egfr=$11, alt=$12, ast=$13, bilirubin=$14, blood_sugar=$15, tsh=$16, 
        hemoglobin=$17, prealbumin=$18, vit_d=$19, vit_b12=$20, folate=$21, zinc=$22, magnesium=$23, 
        ecog_status=$24, cancer_stage=$25, tumor_burden=$26, metastasis_sites=$27, treatment_types=$28, 
        palliative_stage=$29, activity_level=$30, bsa=$31, lean_body_mass=$32, sarcopenia_status=$33, 
        fat_percent=$34, is_vegetarian=$35, cultural_preferences=$36, existing_supplements=$37, 
        feeding_method=$38, gi_issues=$39, status=$40
      WHERE id = $41 RETURNING *`,
      [
        p.name, p.age, p.sex, p.height, p.weight, p.usual_weight, p.albumin, p.crp, p.muac,
        p.creatinine, p.egfr, p.alt, p.ast, p.bilirubin, p.blood_sugar, p.tsh, p.hemoglobin, p.prealbumin,
        p.vit_d, p.vit_b12, p.folate, p.zinc, p.magnesium, p.ecog_status, p.cancer_stage, p.tumor_burden,
        JSON.stringify(p.metastasis_sites || []), JSON.stringify(p.treatment_types || []), p.palliative_stage, p.activity_level, p.bsa,
        p.lean_body_mass, p.sarcopenia_status, p.fat_percent, p.is_vegetarian, p.cultural_preferences,
        JSON.stringify(p.existing_supplements || []), p.feeding_method, p.gi_issues, p.status,
        req.params.id
      ]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Patient not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- ASSESSMENTS ---

// Get assessments for a patient
app.get('/api/assessments/patient/:patientId', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM assessments WHERE patient_id = $1 ORDER BY assessment_date DESC', [req.params.patientId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create assessment
app.post('/api/assessments', authenticateToken, async (req, res) => {
  const a = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO assessments (
        id, patient_id, assessment_date, weight, albumin, crp, muac, creatinine, 
        alt, ast, bilirubin, blood_sugar, tsh, hemoglobin, prealbumin, vit_d, 
        vit_b12, folate, zinc, magnesium, bsa, lean_body_mass, fat_percent, 
        gi_issues, reduced_food_intake, notes
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26
      ) RETURNING *`,
      [
        a.id, a.patient_id, a.assessment_date, a.weight, a.albumin, a.crp, a.muac, a.creatinine,
        a.alt, a.ast, a.bilirubin, a.blood_sugar, a.tsh, a.hemoglobin, a.prealbumin, a.vit_d,
        a.vit_b12, a.folate, a.zinc, a.magnesium, a.bsa, a.lean_body_mass, a.fat_percent,
        a.gi_issues, a.reduced_food_intake, a.notes
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- NUTRITION PLANS ---

// Get plans for a patient
app.get('/api/nutrition-plans/patient/:patientId', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM nutrition_plans WHERE patient_id = $1 ORDER BY version DESC', [req.params.patientId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create nutrition plan (versioned)
app.post('/api/nutrition-plans', authenticateToken, async (req, res) => {
  const p = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO nutrition_plans (
        id, patient_id, version, inputs_snapshot, engine_output, overrides, 
        final_plan, rationale, override_notes, generated_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
      ) RETURNING *`,
      [
        p.id, p.patient_id, p.version, JSON.stringify(p.inputs_snapshot), JSON.stringify(p.engine_output),
        JSON.stringify(p.overrides), JSON.stringify(p.final_plan), p.rationale, p.override_notes, p.generated_by
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
