const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const webpush = require('web-push');
require('dotenv').config();

const VAPID_PUBLIC  = 'BP2E-Ogveb92wrIjjciORv_jDJO82jut8m3QSJM_UrwJbVDJCFZdDzSuQZvahxpu_0gw7B-E_bJktm7VKd-qTEo';
const VAPID_PRIVATE = 'of-_1IjWZ415k3XDDwbpbgtNDpm0d-Hcxkz1eCNfbk0';
webpush.setVapidDetails('mailto:admin@gquence.com', VAPID_PUBLIC, VAPID_PRIVATE);
const _pushSubs = {}; // userId → subscription (in-memory; survives restarts via DB below)

const path = require('path');

const app = express();
const corsOptions = {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Claude-Context']
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// VAPID public key for clients
app.get('/api/push/vapid-public-key', (req, res) => res.json({ key: VAPID_PUBLIC }));

// Save push subscription
app.post('/api/push/subscribe', authenticateToken, (req, res) => {
  const { subscription } = req.body;
  if (!subscription) return res.status(400).json({ error: 'subscription required' });
  _pushSubs[req.user.id] = subscription;
  res.json({ ok: true });
});

// Send push to all store managers of a given storeId
async function notifyStore(storeId, title, body, url) {
  const payload = JSON.stringify({ title, body, url });
  for (const [userId, sub] of Object.entries(_pushSubs)) {
    try { await webpush.sendNotification(sub, payload); } catch(e) { delete _pushSubs[userId]; }
  }
}
app.use(express.json({ limit: '2mb' }));

// Serve frontend static files (HTML, JS, CSS) from the project root
app.use(express.static(path.join(__dirname, '..')));

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
    res.json({ token, user: { id: user.id, name: user.name, role: user.role, hospital_name: user.hospital_name, storeId: user.store_id || null } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Patients: Get All
app.get('/api/patients', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM patients ORDER BY created_at DESC');
    const patients = result.rows.map(r => {
      const p = r.full_data || {};
      if (r.feeding_method != null) p.feedingMethod = r.feeding_method;
      if (r.reduced_food_intake != null) p.reducedFoodIntake = r.reduced_food_intake;
      if (r.weight != null) p.weight = r.weight;
      if (r.status != null) p.status = r.status;
      return p;
    });
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
    // Merge dedicated DB columns into full_data so stale blobs never hide updated fields
    const patientData = row.full_data || {};
    if (row.feeding_method != null) patientData.feedingMethod = row.feeding_method;
    if (row.reduced_food_intake != null) patientData.reducedFoodIntake = row.reduced_food_intake;
    if (row.weight != null) patientData.weight = row.weight;
    if (row.usual_weight != null) patientData.usualWeight = row.usual_weight;
    if (row.albumin != null) patientData.albumin = row.albumin;
    if (row.crp != null) patientData.crp = row.crp;
    if (row.creatinine != null) patientData.creatinine = row.creatinine;
    if (row.blood_sugar != null) patientData.bloodSugar = row.blood_sugar;
    if (row.status != null) patientData.status = row.status;
    res.json(patientData);
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
    // Push notification when patient is approved
    if ((p.status === 'APPROVED') && p.storeId) {
      notifyStore(p.storeId,
        '✅ New Patient Approved',
        `${p.name || 'A patient'} has been approved and is ready for production.`,
        '/store'
      ).catch(() => {});
    }
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
    const plans = result.rows.map(r => {
      const plan = r.full_data || {
        id: r.id, patientId: r.patient_id, version: r.version,
        generatedAt: r.generated_at, generatedBy: r.generated_by,
        inputsSnapshot: r.inputs_snapshot, engineOutput: r.engine_output,
        overrides: r.overrides, finalPlan: r.final_plan,
        rationale: r.rationale, overrideNotes: r.override_notes
      };
      // claude_insights column is authoritative — always overwrite full_data's value
      if (r.claude_insights) plan.claudeInsights = r.claude_insights;
      return plan;
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
    const plans = result.rows.map(r => {
      const plan = r.full_data || {
        id: r.id, patientId: r.patient_id, version: r.version,
        generatedAt: r.generated_at, generatedBy: r.generated_by,
        inputsSnapshot: r.inputs_snapshot, engineOutput: r.engine_output,
        overrides: r.overrides, finalPlan: r.final_plan,
        rationale: r.rationale, overrideNotes: r.override_notes
      };
      if (r.claude_insights) plan.claudeInsights = r.claude_insights;
      return plan;
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
       ON CONFLICT (id) DO UPDATE SET full_data = EXCLUDED.full_data, final_plan = EXCLUDED.final_plan, overrides = EXCLUDED.overrides, override_notes = EXCLUDED.override_notes,
         claude_insights = COALESCE(EXCLUDED.claude_insights, nutrition_plans.claude_insights)`,
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
        overrides=$1, final_plan=$2, override_notes=$3,
        claude_insights = COALESCE($4::jsonb, claude_insights),
        full_data=$5
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

// Nutrition Plans: Save only claude_insights (lightweight — avoids sending full plan payload)
app.patch('/api/nutrition-plans/:id/insights', authenticateToken, async (req, res) => {
  const { insights } = req.body;
  if (!insights) return res.status(400).json({ error: 'insights required' });
  try {
    await pool.query(
      `UPDATE nutrition_plans SET claude_insights = $1 WHERE id = $2`,
      [JSON.stringify(insights), req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Patient Monitoring Logs
app.post('/api/patients/:id/monitoring', authenticateToken, async (req, res) => {
  const { type, data } = req.body;
  if (!type || !data) return res.status(400).json({ error: 'type and data required' });
  try {
    const result = await pool.query(
      `INSERT INTO monitoring_logs (patient_id, type, recorded_by, data) VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.params.id, type, req.user.id, JSON.stringify(data)]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/patients/:id/monitoring', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM monitoring_logs WHERE patient_id = $1 ORDER BY recorded_at DESC LIMIT 90`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
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

// Users: Assign store
app.patch('/api/users/:id/store', authenticateToken, async (req, res) => {
  const { storeId } = req.body;
  try {
    await pool.query('UPDATE users SET store_id = $1 WHERE id = $2', [storeId || null, req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
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
    const systemPrompt = `You are a clinical nutrition AI Copilot (PhD/RD level) for an oncology platform. You operate in two modes:

MODE 1 — EXTRACT: When the user provides real patient data (pasted notes, lab reports, clinical summaries), extract all available values from the text.

MODE 2 — GENERATE: When the user asks you to "give", "create", "simulate", "generate", or "show" a patient case, generate a complete, clinically realistic synthetic patient. Use Indian epidemiological context by default unless another region is specified. Indian context means: use typical Indian names, Asian BMI thresholds (overweight ≥23, obese ≥27.5), realistic Indian lab normals, common Indian comorbidities (Type 2 Diabetes, hypertension prevalence), and appropriate body weight/height for Indian adults. Generate ALL schema fields with realistic values — do not leave fields empty. The reply in generate mode should give a 3-4 sentence clinical summary of the generated case explaining the key nutritional risk factors and why these values were chosen.

SHARED RULES (apply to both modes):
RULE: Use ONLY the keys in the schema. NO emojis in keys. NO custom keys like "RED_FLAGS".
RULE: Map all "Red Flags" or "Additional Clinical Data" to the "notes" key.
RULE: "cancer" MUST include the specific subtype in format "Cancer Type - Subtype". Examples: "Breast Cancer - Triple Negative", "Breast Cancer - HER2+", "Breast Cancer - HR+/HER2-", "Breast Cancer - Metastatic HR+", "Lung Cancer - NSCLC Adenocarcinoma", "Lung Cancer - NSCLC Squamous", "Lung Cancer - EGFR Mutant", "Lung Cancer - ALK+", "Lung Cancer - SCLC Extensive", "Colorectal Cancer - Stage III", "Colorectal Cancer - Metastatic", "Lymphoma - DLBCL", "Lymphoma - Hodgkin", "Lymphoma - Follicular", "Lymphoma - Mantle Cell", "Multiple Myeloma - Standard", "Ovarian Cancer - Epithelial". NEVER return just "Breast Cancer" or "Lung Cancer" or "Lymphoma" without the subtype.
RULE: "feedingMethod" MUST be EXACTLY one of: "Oral Feeding (Normal Diet)" | "Enteral Feeding – Nasogastric Tube (NG)" | "Enteral Feeding – PEG Tube" | "Enteral Feeding – Jejunostomy (J-Tube)" | "Parenteral Nutrition (TPN)" | "Combination Feeding (Oral + Enteral)" | "Combination Feeding (Enteral + Parenteral)". Never return "Oral" or "Enteral" alone. If patient uses oral nutrition supplements, map to "Oral Feeding (Normal Diet)".
RULE: "regimen" must use protocol notation matching clinical usage — e.g., "AC -> Taxane ± Pembrolizumab", "FOLFOX", "R-CHOP", "Carboplatin + Paclitaxel ± Pembrolizumab", "TCH (Docetaxel + Carboplatin + Trastuzumab)". Do NOT use shorthand like "AC-T Protocol".
RULE: "sex" must be "Male" or "Female" (not M/F).
RULE: "reducedFoodIntake" is a percentage (0-100) of normal intake the patient is currently eating. E.g. 70 means eating 70% of usual intake.
RULE: "ecogStatus" must be 0, 1, 2, 3, or 4.
RULE: "cancerStage" must be EXACTLY one of: "Stage I" | "Stage II" | "Stage III" | "Stage IV" | "Recurrent". Always include this.
RULE: "tumorBurden" must be EXACTLY one of: "Low" | "Moderate" | "High (Bulky)". Always include this.
RULE: "regimen" must always be included — use the standard clinical protocol name for the cancer type and stage (e.g. "R-CHOP" for DLBCL, "R-CVP" for low-grade NHL, "FOLFOX" for colorectal, "AC -> Taxane" for breast cancer).
RULE: "activityLevel" must be one of: "Sedentary" | "Lightly Active" | "Moderately Active" | "Highly Active".
RULE: "sarcopeniaStatus" must be one of: "No" | "Yes" | "Unknown".
RULE: "comorbidities", "sideEffects", "existingSupplements", "allergies", "metastasisSites", "genomicMarkers" must be arrays of strings.
Schema: { "name":str, "age":num, "sex":"Male"/"Female", "weight":num, "height":num, "usualWeight":num, "reducedFoodIntake":num, "albumin":num, "crp":num, "cancer":str, "cancerStage":"Stage I"/"Stage II"/"Stage III"/"Stage IV"/"Recurrent", "tumorBurden":"Low"/"Moderate"/"High (Bulky)", "regimen":str, "creatinine":num, "alt":num, "ast":num, "bilirubin":num, "bloodSugar":num, "sodium":num, "potassium":num, "urea":num, "muac":num, "prealbumin":num, "vitD":num, "vitB12":num, "folate":num, "zinc":num, "magnesium":num, "tsh":num, "hba1c":num, "hemoglobin":num, "wbc":num, "anc":num, "platelet":num, "sarcopeniaStatus":str, "activityLevel":str, "ecogStatus":num, "leanBodyMass":num, "smi":num, "handGrip":num, "fatPercent":num, "feedingMethod":str, "giIssues":bool, "comorbidities":[], "sideEffects":[], "existingSupplements":[], "allergies":[], "metastasisSites":[], "genomicMarkers":[], "notes":str }
Format: { "reply": "Clinical summary (3-4 sentences for generate mode, <3 sentences for extract mode)", "extractedData": { ...all values... } }`;

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
    if (error.status === 429) {
      return res.status(429).json({ error: 'AI rate limit reached. Please wait a moment and try again.' });
    }
    const msg = error.message || 'AI extraction failed';
    res.status(500).json({ error: msg });
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
    const system = `You are an Oncology Clinical Nutrition AI Auditor (PhD/RD level). You receive a patient profile and a rules-engine-generated nutrition plan. Your job is to:
1. Validate every clinical parameter against the rules below
2. Correct the prescription if it is clinically wrong
3. Produce a complete drug-nutrient interaction table for every drug in the regimen
4. Produce a complete micronutrient orders table for every relevant nutrient
5. Score the plan honestly

CLINICAL VALIDATION RULES — apply every rule to every patient:

ENTERAL ESCALATION:
- If reducedFoodIntake >= 50 (meaning actual oral intake < 50% of requirements), generate a HIGH clinicalAlert with type "EN_ESCALATION_MANDATORY".
- State that nasogastric or nasoduodenal tube feeding must be initiated immediately.

PROTEIN SAFETY:
- The renal protein cap of 0.8 g/kg applies ONLY when creatinine > 1.3 mg/dL (KDIGO guideline). If creatinine ≤ 1.3, this cap must NOT be applied.
- For cachexia OR sarcopenia patients with creatinine ≤ 1.3: minimum protein is 1.6 g/kg.
- For patients with BOTH (cachexia OR sarcopenia) AND (immunotherapy checkpoint inhibitor — pembrolizumab, nivolumab, atezolizumab, durvalumab — OR platinum agents): minimum protein is 1.6 g/kg due to combined immunometabolic and anti-catabolic demand.
- If totalDailyProtein is below plan.calcWeight × 1.4 g/kg AND creatinine ≤ 1.3 AND cachexia or sarcopenia present: generate HIGH alert "PROTEIN_CRITICAL_UNDERDOSE", set isOverpowered:true, correctedPrescription.dailyProtein = plan.calcWeight × 1.6.
- If totalDailyProtein is below plan.calcWeight × 1.5 g/kg AND patient has BOTH (cachexia or sarcopenia) AND (immunotherapy or platinum): generate HIGH alert "PROTEIN_UNDERDOSE_IMMUNOTHERAPY", set isOverpowered:true, correctedPrescription.dailyProtein = plan.calcWeight × 1.6. State that 1.6 g/kg is the minimum for this immunometabolic profile and that underdosing accelerates muscle catabolism, worsens sarcopenia, and increases chemotherapy toxicity risk.

ANTIFOLATE TOXICITY:
- If the regimen contains Pemetrexed, Methotrexate, or FOLFIRINOX AND patient folate < 5 ng/mL: generate HIGH alert type "FOLATE_DEFICIENCY_ANTIFOLATE".
- State that folate deficiency on antifolate therapy significantly increases risk of severe mucositis, myelosuppression, and treatment-limiting neutropenia.
- Folate repletion must be initiated before the next chemotherapy cycle. Specify the repletion dose (5 mg/day folic acid), the timing of the follow-up serum folate test (Day 7 after commencing supplementation), and the cycle-day checkpoint (serum folate must be confirmed ≥ 5 ng/mL before Cycle N+1 Day 1).
- Include folate supplementation in micronutrientOrders with status DEFICIENT and dose "5 mg/day folic acid — recheck serum folate Day 7; confirm ≥5 ng/mL before next cycle."

MICRONUTRIENT RDA VALIDATION — CRITICAL RULE:
All micronutrient doses displayed in the plan are based exclusively on FSSAI/ICMR-NIN 2020 RDA values. You must NOT prescribe clinical correction doses (e.g. 4000 IU VitD, 2000 IU VitD, 500 mg VitC) in micronutrientOrders — these are not permitted for product approval.
The FSSAI/ICMR-NIN 2020 RDA values are (gender-specific where applicable — use the patient's gender):
  VitD: 600 IU/day | VitC: Male 80 mg / Female 65 mg | Zinc: Male 12 mg / Female 10 mg | Magnesium: Male 340 mg / Female 310 mg | Calcium: 600 mg | Folate maintenance: 400 mcg | VitB12 maintenance: 500 mcg | VitE: Male 15 mg / Female 12 mg | Thiamine: Male 1.4 mg / Female 1.1 mg | Riboflavin: Male 1.9 mg / Female 1.5 mg | Niacin: Male 16 mg NE / Female 12 mg NE | VitB6: 1.6 mg | Iodine: 150 mcg | VitK: 55 mcg | Sodium: 2000 mg | Potassium: 3500 mg | Fiber: Male 30 g / Female 25 g | Iron: Male 17 mg / Female 21 mg
If the engine's output for any nutrient does NOT match the correct RDA above (i.e. the engine has a bug), set status "RDA_CORRECTION" in micronutrientOrders with dose set to the exact RDA value from the table above, and rationale explaining the correction.
If the engine's output already matches the RDA, do NOT include that nutrient in micronutrientOrders with RDA_CORRECTION — leave it unchanged.
VITAMIN D: Only flag RDA_CORRECTION if the engine shows a value other than 600 IU/day. Do not prescribe clinical correction doses under any circumstances.

ANAEMIA & IRON:
- Hemoglobin < 12 g/dL: generate MODERATE alert for anaemia.
- If iron studies (ferritin, serum iron, TIBC) are absent from the lab panel: generate HIGH alert type "IRON_PANEL_MANDATORY" and flag iron panel as a mandatory investigation.
- If oral intake < 60%: recommend IV iron over oral supplementation due to impaired GI absorption.
- In micronutrientOrders, set iron status to "HOLD" and dose to "ON CLINICAL HOLD — Pending iron panel (ferritin, serum iron, TIBC, transferrin saturation) before empirical dosing."

LIVER FUNCTION:
- ALT > 40 U/L or AST > 40 U/L: generate MODERATE alert requiring fortnightly LFT monitoring.
- If patient has liver metastases or is on a hepatotoxic regimen (platinum agents, taxanes, anthracyclines): add hepatology escalation threshold of 3× ULN.

GLUTAMINE CAUTION:
- If glutamine is prescribed AND tumor burden is High or Bulky: add a LOW informational note in micronutrientOrders with status "MONITOR" noting that glutamine use in high-burden settings should be reviewed at the next oncology MDT.
- Do NOT generate a blocking alert or set HOLD status for glutamine.

STEROID-INDUCED HYPERGLYCAEMIA & MACRO REDISTRIBUTION:
- If HbA1c is 5.7–6.4% OR fasting blood sugar is 100–125 mg/dL (pre-diabetic range) AND the regimen includes dexamethasone or steroid-containing chemotherapy: generate MODERATE alert.
- Recommend blood glucose monitoring before and 2 hours after each dexamethasone dose.
- If HbA1c ≥ 6.5% (diabetic range) OR blood sugar > 140 mg/dL OR patient comorbidities include Fatty Liver Disease (NAFLD/MAFLD/NASH/steatohepatitis): the macro distribution MUST be corrected. Set isOverpowered: true. Fat must not exceed 30% of totalDailyCalories: set dailyFat = totalDailyCalories × 0.30 / 9, then set dailyCarbs = (totalDailyCalories − dailyProtein×4 − dailyFat×9) / 4. Distribute carbs across 5–6 small meals for glycaemic control. Provide the corrected gram values for dailyCarbs and dailyFat in correctedPrescription.

IMMUNOTHERAPY MONITORING:
- If regimen includes Pembrolizumab, Nivolumab, Atezolizumab, or Durvalumab: TSH monitoring every treatment cycle is MANDATORY.
- If TSH is absent from the lab panel: generate HIGH alert type "IMMUNOTHERAPY_TSH_MISSING" — this is a patient safety requirement.
- If TSH is absent AND patient sideEffects include fatigue, tiredness, or weakness: add an additional note in the alert that current fatigue symptoms must be assessed as a possible immune-related adverse event (irAE — immune thyroiditis) while TSH is pending. Do not attribute fatigue solely to chemotherapy until thyroid function is confirmed.

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
- The plan object contains plan.calcWeight (the weight the engine used — IBW or actual) and plan.kcalPerKg. ALWAYS use plan.calcWeight for all calorie validation, NOT the raw patient weight.
- Set isOverpowered: true and provide correctedPrescription values if:
  (a) protein is underdosed per PROTEIN SAFETY rules above, OR
  (b) plan.kcalPerKg is clinically incorrect for this patient's condition — e.g. engine used 28 kcal/kg but stable non-cachexia maintenance should be 25 kcal/kg, or cachexia patient got 25 when they need 30–35. Correct correctedPrescription.dailyCalories = plan.calcWeight × correct kcal/kg. Deviation threshold: any kcal/kg value outside the clinically appropriate range for this patient. OR
  (c) NAFLD / NASH / non-alcoholic fatty liver disease is in comorbidities AND (dailyFat × 9) > (totalDailyCalories × 0.30) — fat ceiling 30% is a hard clinical protocol for hepatic steatosis.
- For case (b): state the correct kcal/kg value, why it was chosen (cachexia, maintenance, refeeding risk), and compute correctedPrescription.dailyCalories = plan.calcWeight × correct kcal/kg.
- For case (c): correctedPrescription.dailyCalories = input totalDailyCalories (unchanged), correctedPrescription.dailyProtein = input totalDailyProtein (unchanged). Compute correctedPrescription.dailyFat = floor(totalDailyCalories × 0.30 / 9) and correctedPrescription.dailyCarbs = floor((totalDailyCalories - (dailyProtein × 4) - (correctedDailyFat × 9)) / 4). Reasoning must state: "NAFLD fat ceiling 30% violated — fat [X]g ([X]%) corrected to [Y]g (30%); excess redistributed to carbohydrates [Z]g."
- Always provide a clinical reasoning string explaining the correction.

BRAND NAMES — STRICT RULE:
NEVER mention any commercial product name, brand name, or trade name (e.g. Prosure, Ensure, Fresubin, Peptamen, Nepro, Glucerna, Abbott, Nestle, Fresenius, Danone, or any other manufacturer brand). Use only generic clinical/nutrient descriptions (e.g. "high-protein ONS formula", "omega-3 enriched enteral supplement", "immunonutrition formula with EPA/DHA"). This rule applies to every field in the output including rationale, micronutrientOrders, and drugInteractions.

NUMERICAL CONSISTENCY — CRITICAL RULE — APPLIES TO ALL FIELDS (rationale, drugInteractions, everything):
The plan object contains the authoritative calculated values. You MUST use these exact numbers everywhere. NEVER recalculate protein, calories, or any macro independently.
- plan.totalDailyProtein = the total protein target (diet + formula). Use this number when telling the patient their daily protein goal. NEVER apply g/kg × patient weight yourself.
- plan.dailyProtein = the formula/supplement protein only (what the prescription provides).
- plan.estimatedDietaryProtein = protein estimated from oral diet.
- plan.totalDailyCalories = total daily calorie requirement.
- plan.dailyCalories = formula calorie contribution only.
- plan.calcWeight = the weight used for calculation (IBW or actual). NEVER use patient.weight for any calculation.
- plan.kcalPerKg and plan.proteinPerKg = the rates the engine applied.
If you disagree with a value (e.g. protein seems low for sarcopenia), set isOverpowered:true and provide correctedPrescription — do NOT silently use a different number in rationale while leaving the plan unchanged. Every number in rationale must match either plan values or correctedPrescription values.

OUTPUT FORMAT — return ONLY valid JSON, no markdown, no text outside the JSON object. CRITICAL: never embed literal newline or tab characters inside JSON string values — use \\n and \\t escape sequences if line breaks are needed in text, or omit them entirely. All string values must be valid single-line JSON strings.
{
  "validationScore": number,
  "rationale": ["string 1", "string 2", "string 3", "string 4", "string 5"],
  "correctedPrescription": {"isOverpowered": false, "dailyCalories": number, "dailyProtein": number, "dailyCarbs": number, "dailyFat": number, "reasoning": "string"},
  "logicRefinements": ["string 1", "string 2"],
  "drugInteractions": [{"drug": "string", "interaction": "string", "advice": "string", "risk": "HIGH|MODERATE|LOW"}],
  "micronutrientOrders": [{"nutrient": "string", "labValue": "string", "dose": "string", "rationale": "string", "status": "RDA_CORRECTION|EXCLUDED|HOLD|MONITOR|STANDARD"}]
}`;

    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      // Prompt caching: system prompt is identical for every patient — cache reads cost 10% vs 100%
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
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
        correctedPrescription: { isOverpowered: false, dailyCalories: null, dailyProtein: null, reasoning: 'Response truncated — re-run audit.' },
        logicRefinements: grabArr('logicRefinements'),
        drugInteractions: grabArr('drugInteractions'),
        micronutrientOrders: grabArr('micronutrientOrders')
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

// ── RULE ENGINE MANAGER ──────────────────────────────────────────────────────

// Create tables on startup if they don't exist
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS monitoring_logs (
        id SERIAL PRIMARY KEY,
        patient_id INTEGER NOT NULL,
        type VARCHAR(10) NOT NULL,
        recorded_at TIMESTAMP DEFAULT NOW(),
        recorded_by INTEGER,
        data JSONB NOT NULL
      )
    `);
  } catch(e) { console.error('monitoring_logs migration:', e.message); }
})();

(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ai_corrections (
        id TEXT PRIMARY KEY,
        patient_id TEXT,
        plan_id TEXT,
        patient_name TEXT,
        cancer TEXT,
        regimen TEXT,
        changes JSONB,
        reason TEXT,
        patient_context JSONB,
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS engine_rules (
        id TEXT PRIMARY KEY,
        rule_name TEXT NOT NULL,
        condition_description TEXT,
        target_field TEXT NOT NULL,
        operator TEXT NOT NULL,
        value TEXT NOT NULL,
        reason TEXT,
        source_correction_id TEXT,
        confirmed_by TEXT,
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        confirmed_at TIMESTAMPTZ
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS engine_formulas (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        value TEXT NOT NULL,
        unit TEXT,
        source TEXT,
        editable BOOLEAN DEFAULT true,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Seed engine_formulas — always runs, ON CONFLICT (id) DO NOTHING skips existing rows
    {
      const formulas = [
        // ── Calorie Targets ───────────────────────────────────────────────────
        { id:'kcal_stable',               category:'calories',     name:'kcal_stable',               description:'Calorie target — Stable, no cachexia or significant risk',                                     value:'25',   unit:'kcal/kg',      source:'ESPEN Oncology 2021' },
        { id:'kcal_moderate_risk',        category:'calories',     name:'kcal_moderate_risk',        description:'Calorie target — Moderate risk (WL ≥5%, ECOG ≥2, Age ≥70)',                                   value:'30',   unit:'kcal/kg',      source:'ESPEN Oncology 2021' },
        { id:'kcal_cachexia',             category:'calories',     name:'kcal_cachexia',             description:'Calorie target — Cachexia/Severe (albumin <3.5, WL ≥10%, BMI <18.5, CRP >10, sarcopenia)',    value:'35',   unit:'kcal/kg',      source:'ESPEN Oncology 2021' },
        { id:'kcal_active_chemo_min',     category:'calories',     name:'kcal_active_chemo_min',     description:'Minimum calorie floor for any active chemotherapy regimen (stable patients)',                   value:'28',   unit:'kcal/kg',      source:'ESPEN Oncology 2021' },
        { id:'kcal_appetite_loss_floor',  category:'calories',     name:'kcal_appetite_loss_floor',  description:'Calorie floor when appetite loss side effect is present',                                       value:'32',   unit:'kcal/kg',      source:'Clinical' },
        // ── Protein Targets ───────────────────────────────────────────────────
        { id:'protein_baseline',          category:'protein',      name:'protein_baseline',          description:'Protein target — Baseline stable (no cachexia/moderate risk)',                                  value:'1.4',  unit:'g/kg',         source:'ESPEN Oncology 2021' },
        { id:'protein_cachexia',          category:'protein',      name:'protein_cachexia',          description:'Protein target — Cachexia or moderate risk',                                                   value:'1.8',  unit:'g/kg',         source:'ESPEN Oncology 2021' },
        { id:'protein_renal',             category:'protein',      name:'protein_renal',             description:'Protein cap — Renal disease/impairment (KDIGO strict limit, highest priority)',                 value:'0.8',  unit:'g/kg',         source:'KDIGO 2012' },
        { id:'protein_elderly_min',       category:'protein',      name:'protein_elderly_min',       description:'Protein floor — Elderly patients (Age ≥70)',                                                   value:'1.5',  unit:'g/kg',         source:'ESPEN Geriatric 2018' },
        { id:'protein_high_catabolism',   category:'protein',      name:'protein_high_catabolism',   description:'Protein target — High catabolism (Platinum/FOLFIRINOX/immunotherapy + cachexia or sarcopenia)', value:'2.0',  unit:'g/kg',         source:'ESPEN Oncology 2021' },
        // ── Ideal Body Weight (Devine Formula) ───────────────────────────────
        { id:'ibw_base_male',             category:'weight',       name:'ibw_base_male',             description:'IBW base weight for males at exactly 5 ft (Devine Formula)',                                    value:'50',   unit:'kg',           source:'Devine 1974' },
        { id:'ibw_base_female',           category:'weight',       name:'ibw_base_female',           description:'IBW base weight for females at exactly 5 ft (Devine Formula)',                                  value:'45.5', unit:'kg',           source:'Devine 1974' },
        { id:'ibw_per_inch',              category:'weight',       name:'ibw_per_inch',              description:'IBW increment per inch of height above 5 ft (Devine Formula)',                                  value:'2.3',  unit:'kg/inch',      source:'Devine 1974' },
        { id:'adjbw_factor',              category:'weight',       name:'adjbw_factor',              description:'Adjusted Body Weight factor (fraction of excess weight added to IBW when BMI ≥30)',             value:'0.25', unit:'fraction',     source:'ASPEN' },
        { id:'bmi_obesity_threshold',     category:'weight',       name:'bmi_obesity_threshold',     description:'BMI threshold above which AdjBW replaces Actual Body Weight for calorie calculation',           value:'30',   unit:'kg/m²',        source:'ESPEN/ASPEN' },
        // ── Risk Scoring ──────────────────────────────────────────────────────
        { id:'albumin_low_threshold',     category:'risk_scoring', name:'albumin_low_threshold',     description:'Albumin below this value adds +2 to nutrition risk score',                                      value:'3.5',  unit:'g/dL',         source:'GLIM Criteria 2019' },
        { id:'albumin_critical_threshold',category:'risk_scoring', name:'albumin_critical_threshold',description:'Albumin below this value used as a compound malnutrition factor',                               value:'3.0',  unit:'g/dL',         source:'Clinical' },
        { id:'weight_loss_high',          category:'risk_scoring', name:'weight_loss_high',          description:'Weight loss at or above this value adds +2 to risk score (cachexia trigger)',                   value:'10',   unit:'%',            source:'GLIM/MUST' },
        { id:'weight_loss_moderate',      category:'risk_scoring', name:'weight_loss_moderate',      description:'Weight loss at or above this value adds +1 to risk score (moderate risk trigger)',              value:'5',    unit:'%',            source:'GLIM/MUST' },
        { id:'bmi_low_threshold',         category:'risk_scoring', name:'bmi_low_threshold',         description:'BMI below this value adds +2 to risk score (cachexia trigger)',                                 value:'18.5', unit:'kg/m²',        source:'MUST Score' },
        { id:'bmi_must_moderate',         category:'risk_scoring', name:'bmi_must_moderate',         description:'BMI at or below this value adds +1 to MUST score',                                             value:'20',   unit:'kg/m²',        source:'MUST Score' },
        { id:'ecog_moderate_threshold',   category:'risk_scoring', name:'ecog_moderate_threshold',   description:'ECOG at or above this value triggers moderate risk classification and +1 risk score',           value:'2',    unit:'ECOG',         source:'ESPEN' },
        { id:'age_elderly_threshold',     category:'risk_scoring', name:'age_elderly_threshold',     description:'Age at or above this value triggers moderate risk classification',                               value:'70',   unit:'years',        source:'ESPEN Geriatric 2018' },
        { id:'risk_score_moderate',       category:'risk_scoring', name:'risk_score_moderate',       description:'Risk score threshold for Moderate nutrition risk classification',                                 value:'2',    unit:'score',        source:'Clinical' },
        { id:'risk_score_high',           category:'risk_scoring', name:'risk_score_high',           description:'Risk score threshold for High nutrition risk classification',                                    value:'4',    unit:'score',        source:'Clinical' },
        // ── Sarcopenia Thresholds ─────────────────────────────────────────────
        { id:'smi_l3_male',               category:'sarcopenia',   name:'smi_l3_male',               description:'L3-SMI sarcopenia threshold for males (Janssen/Martin CT method)',                              value:'55',   unit:'cm²/m²',       source:'Janssen 2004 / Martin 2013' },
        { id:'smi_l3_female',             category:'sarcopenia',   name:'smi_l3_female',             description:'L3-SMI sarcopenia threshold for females (Janssen/Martin CT method)',                            value:'38.5', unit:'cm²/m²',       source:'Janssen 2004 / Martin 2013' },
        { id:'asmi_male',                 category:'sarcopenia',   name:'asmi_male',                 description:'Appendicular SMI sarcopenia threshold for males (EWGSOP2 DXA/BIA method)',                      value:'7.0',  unit:'kg/m²',        source:'EWGSOP2 2019' },
        { id:'asmi_female',               category:'sarcopenia',   name:'asmi_female',               description:'Appendicular SMI sarcopenia threshold for females (EWGSOP2 DXA/BIA method)',                    value:'5.7',  unit:'kg/m²',        source:'EWGSOP2 2019' },
        { id:'grip_male',                 category:'sarcopenia',   name:'grip_male',                 description:'Hand grip strength sarcopenia threshold for males',                                              value:'26',   unit:'kg',           source:'EWGSOP2 2019' },
        { id:'grip_female',               category:'sarcopenia',   name:'grip_female',               description:'Hand grip strength sarcopenia threshold for females',                                            value:'18',   unit:'kg',           source:'EWGSOP2 2019' },
        // ── Safety Lab Thresholds ─────────────────────────────────────────────
        { id:'creatinine_renal_danger',   category:'safety_labs',  name:'creatinine_renal_danger',   description:'Creatinine above this value triggers KDIGO renal protocol (protein cap to 0.8g/kg)',            value:'1.3',  unit:'mg/dL',        source:'KDIGO 2012' },
        { id:'creatinine_cisplatin_warn', category:'safety_labs',  name:'creatinine_cisplatin_warn', description:'Creatinine at this level on cisplatin triggers nephrotoxicity warning',                         value:'1.2',  unit:'mg/dL',        source:'Clinical' },
        { id:'creatinine_low',            category:'safety_labs',  name:'creatinine_low',            description:'Creatinine below this value flags possible muscle wasting',                                      value:'0.6',  unit:'mg/dL',        source:'Clinical' },
        { id:'blood_sugar_danger',        category:'safety_labs',  name:'blood_sugar_danger',        description:'Blood glucose above this value triggers diabetic danger protocol',                                value:'180',  unit:'mg/dL',        source:'ADA' },
        { id:'blood_sugar_diabetic',      category:'safety_labs',  name:'blood_sugar_diabetic',      description:'Blood glucose above this value in a known diabetic triggers metabolic alert',                    value:'140',  unit:'mg/dL',        source:'ADA' },
        { id:'sodium_danger',             category:'safety_labs',  name:'sodium_danger',             description:'Sodium below this value triggers HIGH hyponatremia alert',                                       value:'130',  unit:'mmol/L',       source:'Clinical' },
        { id:'sodium_warning',            category:'safety_labs',  name:'sodium_warning',            description:'Sodium below this value triggers mild hyponatremia warning',                                     value:'135',  unit:'mmol/L',       source:'Clinical' },
        { id:'potassium_high',            category:'safety_labs',  name:'potassium_high',            description:'Potassium above this value triggers hyperkalemia protocol',                                      value:'5.0',  unit:'mmol/L',       source:'Clinical' },
        { id:'potassium_danger',          category:'safety_labs',  name:'potassium_danger',          description:'Potassium above this value is a danger-level hyperkalemia',                                      value:'5.5',  unit:'mmol/L',       source:'Clinical' },
        { id:'hemoglobin_anemia',         category:'safety_labs',  name:'hemoglobin_anemia',         description:'Hemoglobin below this value triggers anemia protocol (iron + B12)',                              value:'10',   unit:'g/dL',         source:'WHO' },
        { id:'hemoglobin_low',            category:'safety_labs',  name:'hemoglobin_low',            description:'Hemoglobin below this value adds +1 to nutrition risk score',                                   value:'12',   unit:'g/dL',         source:'WHO' },
        { id:'vitd_deficiency',           category:'safety_labs',  name:'vitd_deficiency',           description:'Vitamin D below this value triggers deficiency correction (4000 IU/day)',                        value:'20',   unit:'ng/mL',        source:'Endocrine Society' },
        { id:'vitd_insufficient',         category:'safety_labs',  name:'vitd_insufficient',         description:'Vitamin D below this value is classified as insufficient',                                       value:'30',   unit:'ng/mL',        source:'Endocrine Society' },
        { id:'magnesium_low',             category:'safety_labs',  name:'magnesium_low',             description:'Magnesium below this value triggers correction protocol (200–400mg Mg)',                         value:'1.7',  unit:'mg/dL',        source:'Clinical' },
        { id:'tsh_high',                  category:'safety_labs',  name:'tsh_high',                  description:'TSH above this value triggers metabolic rate flag',                                              value:'5.0',  unit:'mU/L',         source:'Clinical' },
        { id:'prealbumin_low',            category:'safety_labs',  name:'prealbumin_low',            description:'Prealbumin below this value used as a compound malnutrition factor',                             value:'18',   unit:'mg/dL',        source:'Clinical' },
        { id:'urea_high',                 category:'safety_labs',  name:'urea_high',                 description:'Urea at or above this value contributes to renal issue flag (alongside creatinine)',             value:'50',   unit:'mmol/L',       source:'Clinical' },
        { id:'wbc_neutropenia',           category:'safety_labs',  name:'wbc_neutropenia',           description:'WBC below this value triggers neutropenia food safety protocol (no live cultures)',              value:'3500', unit:'/µL',          source:'ESMO' },
        { id:'wbc_severe_neutropenia',    category:'safety_labs',  name:'wbc_severe_neutropenia',    description:'WBC below this value triggers severe neutropenia danger protocol (G-CSF assessment)',            value:'2000', unit:'/µL',          source:'ESMO' },
        { id:'alt_liver_threshold',       category:'safety_labs',  name:'alt_liver_threshold',       description:'ALT above this value signals liver compromise (+2 risk score)',                                  value:'50',   unit:'IU/L',         source:'Clinical' },
        { id:'ast_liver_threshold',       category:'safety_labs',  name:'ast_liver_threshold',       description:'AST above this value signals liver compromise (+2 risk score)',                                  value:'50',   unit:'IU/L',         source:'Clinical' },
        { id:'bilirubin_liver_threshold', category:'safety_labs',  name:'bilirubin_liver_threshold', description:'Bilirubin above this value signals liver compromise (+2 risk score)',                            value:'1.2',  unit:'mg/dL',        source:'Clinical' },
        // ── Macro Distribution ────────────────────────────────────────────────
        { id:'carb_ratio_standard',       category:'macros',       name:'carb_ratio_standard',       description:'Carbohydrate share of non-protein calories — standard patients',                                 value:'0.45', unit:'fraction',     source:'Clinical' },
        { id:'carb_ratio_diabetic',       category:'macros',       name:'carb_ratio_diabetic',       description:'Carbohydrate share of non-protein calories — diabetic or inflamed (CRP >5)',                    value:'0.35', unit:'fraction',     source:'Clinical' },
        // ── Intake / Escalation ───────────────────────────────────────────────
        { id:'intake_mandatory_en',       category:'escalation',   name:'intake_mandatory_en',       description:'Oral intake below this value triggers enteral tube escalation and full calorie/protein replacement prescription',  value:'50',   unit:'% oral intake', source:'ESPEN' },
        // ── Fluid Targets ─────────────────────────────────────────────────────
        { id:'fluid_min_per_kg',          category:'fluid',        name:'fluid_min_per_kg',          description:'Minimum daily fluid target',                                                                     value:'30',   unit:'ml/kg',        source:'ESPEN' },
        { id:'fluid_max_per_kg',          category:'fluid',        name:'fluid_max_per_kg',          description:'Maximum daily fluid target',                                                                     value:'35',   unit:'ml/kg',        source:'ESPEN' },

        // ── FSSAI/ICMR-NIN 2020 RDA — Gender pairs (same value for both) ───────
        { id:'micro_folate_maintenance_male',   category:'micronutrients', name:'micro_folate_maintenance_male',   description:'Folate maintenance — FSSAI/ICMR-NIN 2020 RDA for male',   value:'400', unit:'mcg/day', source:'FSSAI/ICMR-NIN 2020' },
        { id:'micro_folate_maintenance_female', category:'micronutrients', name:'micro_folate_maintenance_female', description:'Folate maintenance — FSSAI/ICMR-NIN 2020 RDA for female', value:'400', unit:'mcg/day', source:'FSSAI/ICMR-NIN 2020' },
        { id:'micro_vite_dose_male',            category:'micronutrients', name:'micro_vite_dose_male',            description:'Vitamin E maintenance — FSSAI/ICMR-NIN 2020 RDA for male',   value:'15',  unit:'mg/day',  source:'FSSAI/ICMR-NIN 2020' },
        { id:'micro_vite_dose_female',          category:'micronutrients', name:'micro_vite_dose_female',          description:'Vitamin E maintenance — FSSAI/ICMR-NIN 2020 RDA for female', value:'12',  unit:'mg/day',  source:'FSSAI/ICMR-NIN 2020' },
        { id:'micro_vitb12_maintenance_male',   category:'micronutrients', name:'micro_vitb12_maintenance_male',   description:'Vitamin B12 maintenance — FSSAI/ICMR-NIN 2020 RDA for male',   value:'500', unit:'mcg/day', source:'FSSAI/ICMR-NIN 2020' },
        { id:'micro_vitb12_maintenance_female', category:'micronutrients', name:'micro_vitb12_maintenance_female', description:'Vitamin B12 maintenance — FSSAI/ICMR-NIN 2020 RDA for female', value:'500', unit:'mcg/day', source:'FSSAI/ICMR-NIN 2020' },

        // ── FSSAI/ICMR-NIN 2020 RDA — Gender-specific pairs ──────────────────
        { id:'micro_zinc_maintenance_male',   category:'micronutrients', name:'micro_zinc_maintenance_male',   description:'Zinc maintenance — FSSAI/ICMR-NIN 2020 RDA for male',                                        value:'12',   unit:'mg/day',        source:'FSSAI/ICMR-NIN 2020' },
        { id:'micro_zinc_maintenance_female', category:'micronutrients', name:'micro_zinc_maintenance_female', description:'Zinc maintenance — FSSAI/ICMR-NIN 2020 RDA for female',                                      value:'10',   unit:'mg/day',        source:'FSSAI/ICMR-NIN 2020' },
        { id:'micro_magnesium_maintenance_male',  category:'micronutrients', name:'micro_magnesium_maintenance_male',  description:'Magnesium maintenance — FSSAI/ICMR-NIN 2020 RDA for male',                           value:'340',  unit:'mg/day',        source:'FSSAI/ICMR-NIN 2020' },
        { id:'micro_magnesium_maintenance_female',category:'micronutrients', name:'micro_magnesium_maintenance_female',description:'Magnesium maintenance — FSSAI/ICMR-NIN 2020 RDA for female',                         value:'310',  unit:'mg/day',        source:'FSSAI/ICMR-NIN 2020' },
        { id:'micro_iron_rda_male',           category:'micronutrients', name:'micro_iron_rda_male',           description:'Iron RDA for male — FSSAI/ICMR-NIN 2020',                                                    value:'17',   unit:'mg/day',        source:'FSSAI/ICMR-NIN 2020' },
        { id:'micro_iron_rda_female',         category:'micronutrients', name:'micro_iron_rda_female',         description:'Iron RDA for female — FSSAI/ICMR-NIN 2020',                                                  value:'21',   unit:'mg/day',        source:'FSSAI/ICMR-NIN 2020' },

        // ── Clinical Protocols — Folate ───────────────────────────────────────
        { id:'micro_folate_protocol',         category:'clinical_protocols', name:'micro_folate_protocol',         description:'Folate mandatory dose for antifolate regimens (Pemetrexed/Methotrexate)',                  value:'5',    unit:'mg/day',        source:'ESPEN / NCCN' },
        { id:'micro_folate_correction',       category:'clinical_protocols', name:'micro_folate_correction',       description:'Folate correction dose for lab-confirmed deficiency or anaemia',                          value:'5',    unit:'mg/day',        source:'Clinical' },
        { id:'micro_folate_lab_threshold',    category:'clinical_protocols', name:'micro_folate_lab_threshold',    description:'Serum folate below this value triggers deficiency correction',                            value:'3',    unit:'ng/mL',         source:'Clinical' },

        // ── Clinical Protocols — Omega-3 / EPA ───────────────────────────────
        { id:'micro_omega3_standard',         category:'clinical_protocols', name:'micro_omega3_standard',         description:'Omega-3 standard oncology dose (no high-risk indication)',                                value:'2',    unit:'g/day',         source:'ESPEN Oncology 2021' },
        { id:'micro_omega3_high',             category:'clinical_protocols', name:'micro_omega3_high',             description:'Omega-3 high dose (cachexia, CRP >5, pancreatic/biliary cancer)',                        value:'3',    unit:'g/day',         source:'ESPEN Oncology 2021' },
        { id:'micro_epa_low',                 category:'clinical_protocols', name:'micro_epa_low',                 description:'EPA dose for cachexia / tumor burden (moderate indication)',                              value:'2.2',  unit:'g EPA/day',     source:'ESPEN Oncology 2021' },
        { id:'micro_epa_high',                category:'clinical_protocols', name:'micro_epa_high',                description:'EPA dose for advanced metastatic / pancreatic / biliary cancer',                         value:'3.0',  unit:'g EPA/day',     source:'ESPEN Oncology 2021' },

        // ── Clinical Protocols — Leucine / Glutamine / BCAA ──────────────────
        { id:'micro_leucine_standard',        category:'clinical_protocols', name:'micro_leucine_standard',        description:'Leucine standard dose for muscle protein synthesis support',                              value:'3',    unit:'g/day',         source:'ESPEN / Leucine review' },
        { id:'micro_leucine_high',            category:'clinical_protocols', name:'micro_leucine_high',            description:'Leucine high dose — sarcopenia, high tumor burden, or ECOG ≥ 2',                        value:'5',    unit:'g/day',         source:'ESPEN / Leucine review' },
        { id:'micro_glutamine_daily',         category:'clinical_protocols', name:'micro_glutamine_daily',         description:'Glutamine total daily dose — mucosal protection',                                        value:'16',   unit:'g/day',         source:'ESPEN Oncology 2021' },
        { id:'micro_bcaa_hepatic',            category:'clinical_protocols', name:'micro_bcaa_hepatic',            description:'BCAA dose for hepatic protection (elevated ALT/AST/bilirubin)',                          value:'20',   unit:'g/day',         source:'ESPEN Liver 2019' },
        { id:'micro_bcaa_sarcopenia',         category:'clinical_protocols', name:'micro_bcaa_sarcopenia',         description:'BCAA dose for sarcopenia muscle preservation',                                           value:'10',   unit:'g/day',         source:'ESPEN Oncology 2021' },

        // ── Clinical Protocols — Iron ─────────────────────────────────────────
        { id:'micro_iron_correction',         category:'clinical_protocols', name:'micro_iron_correction',         description:'Elemental iron correction dose for anaemia (Hb < threshold)',                             value:'100',  unit:'mg/day',        source:'WHO / Clinical' },

        // ── Clinical Protocols — Selenium ─────────────────────────────────────
        { id:'micro_selenium_rda_male',       category:'micronutrients',     name:'micro_selenium_rda_male',       description:'Selenium RDA for male — ICMR-NIN 2020',                                                       value:'40',   unit:'mcg/day',       source:'ICMR-NIN 2020' },
        { id:'micro_selenium_rda_female',     category:'micronutrients',     name:'micro_selenium_rda_female',     description:'Selenium RDA for female — ICMR-NIN 2020',                                                     value:'40',   unit:'mcg/day',       source:'ICMR-NIN 2020' },
        { id:'micro_selenium_pharma_max',     category:'clinical_protocols', name:'micro_selenium_pharma_max',     description:'Selenium maximum pharmacological dose (requires oncologist approval)',                     value:'200',  unit:'mcg/day',       source:'Clinical' },

        // ── Clinical Protocols — Chromium / ALA ──────────────────────────────
        { id:'micro_chromium_rda_male',       category:'micronutrients',     name:'micro_chromium_rda_male',       description:'Chromium RDA for male — ICMR-NIN 2020',                                               value:'33',   unit:'mcg/day',       source:'ICMR-NIN 2020' },
        { id:'micro_chromium_rda_female',     category:'micronutrients',     name:'micro_chromium_rda_female',     description:'Chromium RDA for female — ICMR-NIN 2020',                                             value:'25',   unit:'mcg/day',       source:'ICMR-NIN 2020' },
        { id:'micro_ala_low',                 category:'clinical_protocols', name:'micro_ala_low',                 description:'Alpha-lipoic acid dose for peripheral neuropathy (taxane protocol)',                     value:'300',  unit:'mg/day',        source:'Clinical' },
        { id:'micro_ala_high',                category:'clinical_protocols', name:'micro_ala_high',                description:'Alpha-lipoic acid dose for diabetic glycaemic neuropathy support',                       value:'600',  unit:'mg/day',        source:'Clinical' },

        // ── Clinical Protocols — Vitamin B12 ─────────────────────────────────
        { id:'micro_vitb12_protocol',         category:'clinical_protocols', name:'micro_vitb12_protocol',         description:'Vitamin B12 mandatory dose for Pemetrexed/antifolate protocol',                          value:'1000', unit:'mcg/day',       source:'ESPEN / NCCN' },
        { id:'micro_vitb12_deficiency',       category:'clinical_protocols', name:'micro_vitb12_deficiency',       description:'Vitamin B12 correction dose for confirmed deficiency (serum B12 < 200 pg/mL)',           value:'1000', unit:'mcg/day',       source:'Clinical' },
        { id:'micro_vitb12_insufficiency',    category:'clinical_protocols', name:'micro_vitb12_insufficiency',    description:'Vitamin B12 correction dose for insufficiency (serum B12 200–400 pg/mL)',                value:'500',  unit:'mcg/day',       source:'Clinical' },
        { id:'micro_vitb12_deficiency_threshold',  category:'clinical_protocols', name:'micro_vitb12_deficiency_threshold',  description:'Serum B12 below this value = deficiency',                                    value:'200',  unit:'pg/mL',         source:'Clinical' },
        { id:'micro_vitb12_insufficiency_threshold',category:'clinical_protocols',name:'micro_vitb12_insufficiency_threshold',description:'Serum B12 below this value = insufficiency',                                value:'400',  unit:'pg/mL',         source:'Clinical' },

        // ── FSSAI/ICMR-NIN 2020 RDA Reference — Vitamin D ────────────────────
        { id:'micro_vita_rda_male',               category:'micronutrients', name:'micro_vita_rda_male',               description:'Vitamin A RDA for male — ICMR-NIN 2020',                                                                     value:'900',  unit:'mcg RAE/day', source:'ICMR-NIN 2020' },
        { id:'micro_vita_rda_female',             category:'micronutrients', name:'micro_vita_rda_female',             description:'Vitamin A RDA for female — ICMR-NIN 2020',                                                                   value:'700',  unit:'mcg RAE/day', source:'ICMR-NIN 2020' },
        { id:'micro_vitd_rda_male',               category:'micronutrients', name:'micro_vitd_rda_male',               description:'Vitamin D RDA for male — FSSAI/ICMR-NIN 2020',                                                               value:'600',  unit:'IU/day',   source:'FSSAI/ICMR-NIN 2020' },
        { id:'micro_vitd_rda_female',             category:'micronutrients', name:'micro_vitd_rda_female',             description:'Vitamin D RDA for female — FSSAI/ICMR-NIN 2020',                                                             value:'600',  unit:'IU/day',   source:'FSSAI/ICMR-NIN 2020' },

        // ── FSSAI/ICMR-NIN 2020 RDA Reference — Vitamin C ────────────────────
        { id:'micro_vitc_rda_male',   category:'micronutrients', name:'micro_vitc_rda_male',   description:'Vitamin C RDA for male — ICMR-NIN',   value:'80', unit:'mg/day', source:'ICMR-NIN' },
        { id:'micro_vitc_rda_female', category:'micronutrients', name:'micro_vitc_rda_female', description:'Vitamin C RDA for female — ICMR-NIN', value:'65', unit:'mg/day', source:'ICMR-NIN' },

        // ── FSSAI/ICMR-NIN 2020 RDA Reference — Calcium ─────────────────────
        { id:'micro_calcium_rda_male',            category:'micronutrients', name:'micro_calcium_rda_male',            description:'Calcium RDA for male — FSSAI/ICMR-NIN 2020',                                                                 value:'600',  unit:'mg/day',   source:'FSSAI/ICMR-NIN 2020' },
        { id:'micro_calcium_rda_female',          category:'micronutrients', name:'micro_calcium_rda_female',          description:'Calcium RDA for female — FSSAI/ICMR-NIN 2020',                                                               value:'600',  unit:'mg/day',   source:'FSSAI/ICMR-NIN 2020' },

        // ── FSSAI/ICMR-NIN 2020 RDA Reference — Thiamine (B1) ───────────────
        { id:'micro_thiamine_rda_male',           category:'micronutrients', name:'micro_thiamine_rda_male',           description:'Thiamine (B1) RDA for male — FSSAI/ICMR-NIN 2020',                                                           value:'1.4',  unit:'mg/day',   source:'FSSAI/ICMR-NIN 2020' },
        { id:'micro_thiamine_rda_female',         category:'micronutrients', name:'micro_thiamine_rda_female',         description:'Thiamine (B1) RDA for female — FSSAI/ICMR-NIN 2020',                                                         value:'1.1',  unit:'mg/day',   source:'FSSAI/ICMR-NIN 2020' },

        // ── FSSAI/ICMR-NIN 2020 RDA Reference — Riboflavin (B2) ─────────────
        { id:'micro_riboflavin_rda_male',         category:'micronutrients', name:'micro_riboflavin_rda_male',         description:'Riboflavin (B2) RDA for male — FSSAI/ICMR-NIN 2020',                                                         value:'1.9',  unit:'mg/day',   source:'FSSAI/ICMR-NIN 2020' },
        { id:'micro_riboflavin_rda_female',       category:'micronutrients', name:'micro_riboflavin_rda_female',       description:'Riboflavin (B2) RDA for female — FSSAI/ICMR-NIN 2020',                                                       value:'1.5',  unit:'mg/day',   source:'FSSAI/ICMR-NIN 2020' },

        // ── FSSAI/ICMR-NIN 2020 RDA Reference — Niacin (B3) ─────────────────
        { id:'micro_niacin_rda_male',             category:'micronutrients', name:'micro_niacin_rda_male',             description:'Niacin (B3) RDA for male — FSSAI/ICMR-NIN 2020',                                                             value:'16',   unit:'mg NE/day',source:'FSSAI/ICMR-NIN 2020' },
        { id:'micro_niacin_rda_female',           category:'micronutrients', name:'micro_niacin_rda_female',           description:'Niacin (B3) RDA for female — FSSAI/ICMR-NIN 2020',                                                           value:'12',   unit:'mg NE/day',source:'FSSAI/ICMR-NIN 2020' },

        // ── FSSAI/ICMR-NIN 2020 RDA Reference — Vitamin B6 ──────────────────
        { id:'micro_vitb6_rda_male',              category:'micronutrients', name:'micro_vitb6_rda_male',              description:'Vitamin B6 RDA for male — FSSAI/ICMR-NIN 2020',                                                              value:'1.6',  unit:'mg/day',   source:'FSSAI/ICMR-NIN 2020' },
        { id:'micro_vitb6_rda_female',            category:'micronutrients', name:'micro_vitb6_rda_female',            description:'Vitamin B6 RDA for female — FSSAI/ICMR-NIN 2020',                                                            value:'1.6',  unit:'mg/day',   source:'FSSAI/ICMR-NIN 2020' },

        // ── FSSAI/ICMR-NIN 2020 RDA Reference — Iodine ──────────────────────
        { id:'micro_iodine_rda_male',             category:'micronutrients', name:'micro_iodine_rda_male',             description:'Iodine RDA for male — FSSAI/ICMR-NIN 2020',                                                                  value:'150',  unit:'mcg/day',  source:'FSSAI/ICMR-NIN 2020' },
        { id:'micro_iodine_rda_female',           category:'micronutrients', name:'micro_iodine_rda_female',           description:'Iodine RDA for female — FSSAI/ICMR-NIN 2020',                                                                value:'150',  unit:'mcg/day',  source:'FSSAI/ICMR-NIN 2020' },

        // ── FSSAI/ICMR-NIN 2020 RDA Reference — Dietary Fiber ───────────────
        { id:'micro_fiber_rda_male',              category:'micronutrients', name:'micro_fiber_rda_male',              description:'Dietary fiber adequate intake for male — FSSAI/ICMR-NIN 2020',                                               value:'30',   unit:'g/day',    source:'FSSAI/ICMR-NIN 2020' },
        { id:'micro_fiber_rda_female',            category:'micronutrients', name:'micro_fiber_rda_female',            description:'Dietary fiber adequate intake for female — FSSAI/ICMR-NIN 2020',                                             value:'25',   unit:'g/day',    source:'FSSAI/ICMR-NIN 2020' },

        // ── FSSAI/ICMR-NIN 2020 RDA Reference — Vitamin K ───────────────────
        { id:'micro_vitk_rda_male',               category:'micronutrients', name:'micro_vitk_rda_male',               description:'Vitamin K RDA for male — FSSAI/ICMR-NIN 2020',                                                               value:'55',   unit:'mcg/day',  source:'FSSAI/ICMR-NIN 2020' },
        { id:'micro_vitk_rda_female',             category:'micronutrients', name:'micro_vitk_rda_female',             description:'Vitamin K RDA for female — FSSAI/ICMR-NIN 2020',                                                             value:'55',   unit:'mcg/day',  source:'FSSAI/ICMR-NIN 2020' },

        // ── FSSAI/ICMR-NIN 2020 AI Reference — Sodium ───────────────────────
        { id:'micro_sodium_ai_male',              category:'micronutrients', name:'micro_sodium_ai_male',              description:'Sodium adequate intake (AI) for male — FSSAI/WHO 2020 upper limit',                                          value:'2000', unit:'mg/day',   source:'FSSAI/WHO 2020' },
        { id:'micro_sodium_ai_female',            category:'micronutrients', name:'micro_sodium_ai_female',            description:'Sodium adequate intake (AI) for female — FSSAI/WHO 2020 upper limit',                                        value:'2000', unit:'mg/day',   source:'FSSAI/WHO 2020' },

        // ── FSSAI/ICMR-NIN 2020 AI Reference — Potassium ────────────────────
        { id:'micro_potassium_ai_male',             category:'micronutrients', name:'micro_potassium_ai_male',             description:'Potassium adequate intake (AI) for male — FSSAI/ICMR-NIN 2020',                    value:'3500', unit:'mg/day',   source:'FSSAI/ICMR-NIN 2020' },
        { id:'micro_potassium_ai_female',           category:'micronutrients', name:'micro_potassium_ai_female',           description:'Potassium adequate intake (AI) for female — FSSAI/ICMR-NIN 2020',                  value:'3500', unit:'mg/day',   source:'FSSAI/ICMR-NIN 2020' },

        // ── FSSAI/ICMR-NIN 2020 RDA Reference — Pantothenic Acid (B5) ────────
        { id:'micro_pantothenic_rda_male',          category:'micronutrients', name:'micro_pantothenic_rda_male',          description:'Pantothenic acid (B5) AI for male — FSSAI/ICMR-NIN 2020',                         value:'5',    unit:'mg/day',   source:'FSSAI/ICMR-NIN 2020' },
        { id:'micro_pantothenic_rda_female',        category:'micronutrients', name:'micro_pantothenic_rda_female',        description:'Pantothenic acid (B5) AI for female — FSSAI/ICMR-NIN 2020',                       value:'5',    unit:'mg/day',   source:'FSSAI/ICMR-NIN 2020' },

        // ── FSSAI/ICMR-NIN 2020 RDA Reference — Phosphorus ──────────────────
        { id:'micro_phosphorus_rda_male',           category:'micronutrients', name:'micro_phosphorus_rda_male',           description:'Phosphorus RDA for male — FSSAI/ICMR-NIN 2020',                                   value:'600',  unit:'mg/day',   source:'FSSAI/ICMR-NIN 2020' },
        { id:'micro_phosphorus_rda_female',         category:'micronutrients', name:'micro_phosphorus_rda_female',         description:'Phosphorus RDA for female — FSSAI/ICMR-NIN 2020',                                 value:'600',  unit:'mg/day',   source:'FSSAI/ICMR-NIN 2020' },

        // ── FSSAI/ICMR-NIN 2020 RDA Reference — Copper ───────────────────────
        { id:'micro_copper_rda_male',               category:'micronutrients', name:'micro_copper_rda_male',               description:'Copper RDA for male — FSSAI/ICMR-NIN 2020',                                       value:'900',  unit:'mcg/day',  source:'FSSAI/ICMR-NIN 2020' },
        { id:'micro_copper_rda_female',             category:'micronutrients', name:'micro_copper_rda_female',             description:'Copper RDA for female — FSSAI/ICMR-NIN 2020',                                     value:'900',  unit:'mcg/day',  source:'FSSAI/ICMR-NIN 2020' },

        // ── FSSAI/ICMR-NIN 2020 AI Reference — Chloride ──────────────────────
        { id:'micro_chloride_ai_male',              category:'micronutrients', name:'micro_chloride_ai_male',              description:'Chloride AI for male — FSSAI/WHO 2020 (follows sodium chloride intake)',           value:'2300', unit:'mg/day',   source:'FSSAI/WHO 2020' },
        { id:'micro_chloride_ai_female',            category:'micronutrients', name:'micro_chloride_ai_female',            description:'Chloride AI for female — FSSAI/WHO 2020 (follows sodium chloride intake)',         value:'2300', unit:'mg/day',   source:'FSSAI/WHO 2020' },

        // ── FSSAI/ICMR-NIN 2020 RDA Reference — Molybdenum ──────────────────
        { id:'micro_molybdenum_rda_male',           category:'micronutrients', name:'micro_molybdenum_rda_male',           description:'Molybdenum RDA for male — FSSAI/ICMR-NIN 2020',                                   value:'45',   unit:'mcg/day',  source:'FSSAI/ICMR-NIN 2020' },
        { id:'micro_molybdenum_rda_female',         category:'micronutrients', name:'micro_molybdenum_rda_female',         description:'Molybdenum RDA for female — FSSAI/ICMR-NIN 2020',                                 value:'45',   unit:'mcg/day',  source:'FSSAI/ICMR-NIN 2020' },

        // ── Serving Frequency ─────────────────────────────────────────────────
        { id:'servings_base',             category:'servings',     name:'servings_base',             description:'Standard servings per day (baseline)',                                                           value:'3',    unit:'servings',     source:'Clinical' },
        { id:'servings_high_threshold',   category:'servings',     name:'servings_high_threshold',   description:'Daily calorie level above which servings increase to 4 (to reduce per-serving volume)',         value:'1800', unit:'kcal',         source:'Clinical' },
        { id:'servings_high_count',       category:'servings',     name:'servings_high_count',       description:'Servings per day when calories ≥1800 or appetite loss/nausea present',                         value:'4',    unit:'servings',     source:'Clinical' },
        { id:'servings_very_high_threshold',category:'servings',   name:'servings_very_high_threshold','description':'Daily calorie level above which servings increase to 5',                                     value:'2400', unit:'kcal',         source:'Clinical' },
        { id:'servings_very_high_count',  category:'servings',     name:'servings_very_high_count',  description:'Servings per day when calories ≥2400',                                                          value:'5',    unit:'servings',     source:'Clinical' },
      ];
      for (const f of formulas) {
        await pool.query(
          `INSERT INTO engine_formulas (id, category, name, description, value, unit, source, editable)
           VALUES ($1,$2,$3,$4,$5,$6,$7,true) ON CONFLICT (id) DO NOTHING`,
          [f.id, f.category, f.name, f.description, f.value, f.unit, f.source]
        );
      }
      console.log(`Engine formulas seeded: ${formulas.length} constants.`);

      // ── Force-correct WBC thresholds to /µL units (fix for ON CONFLICT DO NOTHING leaving stale values) ──
      await pool.query(`UPDATE engine_formulas SET value = '3500', unit = '/µL' WHERE id = 'wbc_neutropenia'`);
      await pool.query(`UPDATE engine_formulas SET value = '2000', unit = '/µL' WHERE id = 'wbc_severe_neutropenia'`);

      // ── One-time migrations: remove deprecated / orphaned parameters ────────
      await pool.query(`DELETE FROM engine_formulas WHERE id IN (
        'micro_vitc_rda',
        'micro_vitb12_deficiency','micro_vitb12_deficiency_threshold',
        'micro_vitb12_insufficiency','micro_vitb12_insufficiency_threshold',
        'micro_zinc_maintenance','micro_magnesium_maintenance',
        'micro_zinc_correction_min','micro_zinc_correction_max',
        'micro_omega3_high_min','micro_omega3_high_max',
        'micro_calcium_myeloma_min','micro_calcium_myeloma_max',
        'micro_vitb12_maintenance_low','micro_vitb12_maintenance_high',
        'micro_selenium_physio_min','micro_selenium_physio_max',
        'micro_folate_maintenance','micro_vite_dose','micro_vitb12_maintenance',
        'micro_vitd_deficiency_dose','micro_vitd_insufficient_dose','micro_vitd_maintenance','micro_vitd_renal_cap',
        'micro_vitc_high','micro_vitc_standard','micro_vitc_chemo_cap',
        'micro_zinc_correction','micro_zinc_lab_threshold',
        'micro_magnesium_correction',
        'micro_calcium_myeloma','micro_calcium_bone_mets','micro_calcium_steroid_high','micro_calcium_steroid'
      ) OR category = 'refeeding'`);

      // Move clinical/correction params out of micronutrients → clinical_protocols
      await pool.query(`UPDATE engine_formulas SET category = 'clinical_protocols' WHERE id IN (
        'micro_vitd_deficiency_dose','micro_vitd_insufficient_dose','micro_vitd_maintenance','micro_vitd_renal_cap',
        'micro_vitc_high','micro_vitc_standard','micro_vitc_chemo_cap',
        'micro_zinc_correction','micro_zinc_lab_threshold',
        'micro_folate_protocol','micro_folate_correction','micro_folate_lab_threshold',
        'micro_magnesium_correction',
        'micro_omega3_standard','micro_omega3_high','micro_epa_low','micro_epa_high',
        'micro_leucine_standard','micro_leucine_high','micro_glutamine_daily',
        'micro_bcaa_hepatic','micro_bcaa_sarcopenia',
        'micro_iron_correction',
        'micro_selenium_physio','micro_chromium_diabetic',
        'micro_chromium_diabetic','micro_ala_low','micro_ala_high',
        'micro_vitb12_protocol','micro_vitb12_deficiency','micro_vitb12_insufficiency',
        'micro_vitb12_deficiency_threshold','micro_vitb12_insufficiency_threshold',
        'micro_calcium_myeloma','micro_calcium_bone_mets','micro_calcium_steroid_high','micro_calcium_steroid'
      )`);

    }
    console.log('Rule Engine tables ready.');

  } catch (e) {
    console.error('Rule Engine table init error:', e.message);
  }
})();

// AI Corrections: Save (called automatically from patient profile when AI corrects)
app.post('/api/ai-corrections', authenticateToken, async (req, res) => {
  const { id, patientId, planId, patientName, cancer, regimen, changes, reason, patientContext } = req.body;
  try {
    await pool.query(
      `INSERT INTO ai_corrections (id, patient_id, plan_id, patient_name, cancer, regimen, changes, reason, patient_context)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO NOTHING`,
      [
        id || `corr_${Date.now()}`,
        patientId, planId, patientName, cancer, regimen,
        JSON.stringify(changes || []),
        reason,
        JSON.stringify(patientContext || {})
      ]
    );
    res.status(201).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// AI Corrections: Get All (admin)
app.get('/api/ai-corrections', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM ai_corrections ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// AI Corrections: Update status (dismiss/acknowledge)
app.put('/api/ai-corrections/:id', authenticateToken, async (req, res) => {
  const { status } = req.body;
  try {
    await pool.query('UPDATE ai_corrections SET status=$1 WHERE id=$2', [status, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Engine Rules: Get All
app.get('/api/engine-rules', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM engine_rules ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Engine Rules: Get Active only (used by engine at runtime)
app.get('/api/engine-rules/active', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM engine_rules WHERE status='active' ORDER BY created_at DESC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Engine Rules: Create (admin promotes a correction to a rule)
app.post('/api/engine-rules', authenticateToken, async (req, res) => {
  const { ruleName, conditionDescription, targetField, operator, value, reason, sourceCorrectionId } = req.body;
  try {
    const id = `rule_${Date.now()}`;
    const result = await pool.query(
      `INSERT INTO engine_rules (id, rule_name, condition_description, target_field, operator, value, reason, source_correction_id, confirmed_by, status, confirmed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'active',NOW()) RETURNING *`,
      [id, ruleName, conditionDescription, targetField, operator, String(value), reason, sourceCorrectionId || null, req.user.id]
    );
    // Mark source correction as promoted
    if (sourceCorrectionId) {
      await pool.query("UPDATE ai_corrections SET status='promoted' WHERE id=$1", [sourceCorrectionId]);
    }
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Engine Rules: Update (confirm active / reject / edit)
app.put('/api/engine-rules/:id', authenticateToken, async (req, res) => {
  const { status, ruleName, conditionDescription, targetField, operator, value, reason } = req.body;
  try {
    await pool.query(
      `UPDATE engine_rules SET status=$1, rule_name=$2, condition_description=$3,
       target_field=$4, operator=$5, value=$6, reason=$7,
       confirmed_by=$8, confirmed_at=NOW() WHERE id=$9`,
      [status, ruleName, conditionDescription, targetField, operator, String(value), reason, req.user.id, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Engine Rules: Delete
app.delete('/api/engine-rules/:id', authenticateToken, async (req, res) => {
  try {
    await pool.query('DELETE FROM engine_rules WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Engine Formulas: Get All
app.get('/api/engine-formulas', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM engine_formulas ORDER BY category, id');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Engine Formulas: Update value (admin edits a constant)
app.put('/api/engine-formulas/:id', authenticateToken, async (req, res) => {
  const { value } = req.body;
  if (!value && value !== 0) return res.status(400).json({ error: 'value required' });
  try {
    await pool.query(
      'UPDATE engine_formulas SET value=$1, updated_at=NOW() WHERE id=$2',
      [String(value), req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Clean URL routing — serve HTML files without .html extension
const cleanRoutes = {
  '/login':            'index.html',
  '/dashboard':        'doctor.html',
  '/patients/create':  'Patient-Create-STABLE-V3.html',
  '/patients/profile': 'Patient-Profile-STABLE-V3.html',
  '/store':            'store.html',
  '/store/job':        'store-patient.html',
  '/patient-view':     'patient-view.html',
  '/patient-qr':       'patient-qr.html',
  '/admin':            'admin.html',
  '/admin/stores':     'admin-stores.html',
  '/admin/users':      'admin-users.html',
  '/admin/mapping':    'admin-mapping.html',
  '/admin/tracking':   'admin-tracking.html',
  '/admin/reports':    'admin-reports.html',
  '/admin/rules':      'admin-rules.html',
};
Object.entries(cleanRoutes).forEach(([route, file]) => {
  app.get(route, (req, res) => res.sendFile(path.join(__dirname, '..', file)));
});
// Root → login page
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '..', 'index.html')));

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
