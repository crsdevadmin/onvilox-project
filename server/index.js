const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const VAPID_PUBLIC  = 'BP2E-Ogveb92wrIjjciORv_jDJO82jut8m3QSJM_UrwJbVDJCFZdDzSuQZvahxpu_0gw7B-E_bJktm7VKd-qTEo';
const VAPID_PRIVATE = 'of-_1IjWZ415k3XDDwbpbgtNDpm0d-Hcxkz1eCNfbk0';
const _pushSubs = {};
let webpush = null;
try {
  webpush = require('web-push');
  webpush.setVapidDetails('mailto:admin@gquence.com', VAPID_PUBLIC, VAPID_PRIVATE);
  console.log('web-push loaded OK');
} catch(e) {
  console.warn('web-push unavailable — push notifications disabled:', e.message);
}

const path = require('path');

const app = express();
const corsOptions = {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Claude-Context']
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '2mb' }));

// Serve frontend static files (HTML, JS, CSS) from the project root.
// HTML, the service worker, and app JS/CSS are served with no-cache so every
// deploy is picked up automatically — users never need to clear cache. (Static
// assets that rarely change, like images/fonts, may still be cached by the browser.)
app.use(express.static(path.join(__dirname, '..'), {
  etag: true,
  setHeaders: (res, filePath) => {
    if (/\.(html|js|css)$/i.test(filePath) || /sw\.js$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

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

// Push notification helpers
app.get('/api/push/vapid-public-key', (req, res) => res.json({ key: VAPID_PUBLIC }));
app.post('/api/push/subscribe', authenticateToken, async (req, res) => {
  const { subscription } = req.body;
  if (!subscription) return res.status(400).json({ error: 'subscription required' });
  _pushSubs[req.user.id] = subscription;
  try {
    await pool.query(
      `INSERT INTO push_subscriptions (user_id, subscription, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id) DO UPDATE SET subscription=$2, updated_at=NOW()`,
      [req.user.id, JSON.stringify(subscription)]
    );
  } catch(e) { console.warn('push sub save:', e.message); }
  res.json({ ok: true });
});
// Send a push to a specific set of user IDs (one per active subscription).
async function notifyUsers(userIds, title, body, url) {
  if (!webpush || !userIds || !userIds.length) return;
  const payload = JSON.stringify({ title, body, url });
  for (const uid of userIds) {
    const sub = _pushSubs[uid];
    if (!sub) continue;
    try { await webpush.sendNotification(sub, payload); } catch(e) { delete _pushSubs[uid]; }
  }
}

// Resolve the user IDs belonging to a store, optionally filtered by role.
async function storeUserIds(storeId, roles) {
  if (!storeId) return [];
  try {
    const r = roles && roles.length
      ? await pool.query('SELECT id FROM users WHERE store_id=$1 AND role = ANY($2)', [storeId, roles])
      : await pool.query('SELECT id FROM users WHERE store_id=$1', [storeId]);
    return r.rows.map(x => x.id);
  } catch(e) { console.warn('storeUserIds:', e.message); return []; }
}

// Notify only the users mapped to a given store (default: store roles).
async function notifyStore(storeId, title, body, url, roles) {
  const ids = await storeUserIds(storeId, roles || ['STORE', 'STORE_APPROVER']);
  return notifyUsers(ids, title, body, url);
}

// Health Check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Test push — send a test notification to the calling user
app.post('/api/push/test', authenticateToken, async (req, res) => {
  const sub = _pushSubs[req.user.id];
  if (!sub) return res.status(404).json({ error: 'No subscription found for this user. Make sure notifications are enabled and you have visited the store dashboard.' });
  if (!webpush) return res.status(503).json({ error: 'web-push not loaded on server' });
  try {
    await webpush.sendNotification(sub, JSON.stringify({
      title: '✅ Gquence Test Notification',
      body: 'Push notifications are working correctly! Tap to open store.',
      url: '/store'
    }));
    res.json({ ok: true, message: 'Test notification sent' });
  } catch(e) {
    delete _pushSubs[req.user.id];
    res.status(500).json({ error: e.message });
  }
});

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
      // Ensure assigned doctor is always present under the camelCase key the frontend uses
      if (!p.assignedDoctorId && r.assigned_doctor_id) p.assignedDoctorId = r.assigned_doctor_id;
      if (!p.id && r.id) p.id = r.id;
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
    if (row.height != null) patientData.height = row.height;
    if (row.sex    != null) patientData.sex    = row.sex;
    if (row.albumin    != null) patientData.albumin    = row.albumin;
    if (row.crp        != null) patientData.crp        = row.crp;
    if (row.creatinine != null) patientData.creatinine = row.creatinine;
    if (row.urea       != null) patientData.urea       = row.urea;
    if (row.sodium     != null) patientData.sodium     = row.sodium;
    if (row.potassium  != null) patientData.potassium  = row.potassium;
    if (row.blood_sugar != null) patientData.bloodSugar = row.blood_sugar;
    if (row.hemoglobin != null) patientData.hemoglobin = row.hemoglobin;
    if (row.alt        != null) patientData.alt        = row.alt;
    if (row.ast        != null) patientData.ast        = row.ast;
    if (row.bilirubin  != null) patientData.bilirubin  = row.bilirubin;
    if (row.status     != null) patientData.status     = row.status;
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
    // Push notification when patient is approved — only the store's manager(s)
    if ((p.status === 'APPROVED') && p.storeId) {
      notifyStore(p.storeId,
        '✅ New Patient Approved',
        `${p.name || 'A patient'} is ready for production. Tap to view plan.`,
        `/patients/profile?id=${req.params.id}&store=1`,
        ['STORE']
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
  if (insights === undefined) return res.status(400).json({ error: 'insights required' });
  try {
    const result = await pool.query(
      `UPDATE nutrition_plans SET claude_insights = $1 WHERE id = $2`,
      [insights ? JSON.stringify(insights) : null, req.params.id]
    );
    // rowCount tells client whether the plan existed in DB (0 = plan missing, needs POST first)
    res.json({ ok: true, rowCount: result.rowCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Patient Monitoring Logs
// ── Weekly Prescription calculation ───────────────────────────────────────
// ── Weekly Recipe Ingredient Calculator ───────────────────────────────────
// Derives a deterministic ingredient breakdown from supplement kcal + protein targets.
// Glutamine (16 g) is a clinical adjunct added on top of suppKcal — consistent with
// how the initial prescription handles it.
function calcWeeklyRecipe(suppKcal, suppProtein, formulation) {
  if (!suppKcal || !suppProtein || suppKcal <= 0 || suppProtein <= 0) return null;

  const isHydrolyzed = formulation === 'Hydrolyzed';
  const isDiabetic   = formulation === 'Diabetic';
  const isAntiInflam = formulation === 'Anti-inflammatory';

  // Protein source
  const pPerGram  = isHydrolyzed ? 0.85 : 0.90;
  const protName  = isHydrolyzed ? 'Hydrolyzed Whey Protein' : 'Whey Protein Isolate (90%)';
  const protId    = isHydrolyzed ? 'whey_hydrolyzed' : 'whey_isolate';
  const protGrams = Math.round(suppProtein / pPerGram);
  const protDeliv = Math.round(protGrams * pPerGram * 10) / 10;
  const protRationale = isHydrolyzed
    ? 'Hydrolyzed peptides for rapid absorption and reduced osmotic load in patients with GI toxicity.'
    : 'High Leucine content to stimulate muscle protein synthesis during treatment.';

  // Macro targets from suppKcal (standard oncology ratios)
  // Diabetic: lower carbs (25 %), more fat (57 %)   Standard/other: 37 % C / 45 % F
  const fatPct  = isDiabetic ? 0.57 : 0.45;
  const carbPct = isDiabetic ? 0.25 : 0.37;

  // MCT Powder (70 % fat, 30 % carb carrier)
  const fatGrams = suppKcal * fatPct / 9;
  const mctGrams = Math.max(0, Math.round(fatGrams / 0.70));
  const mctFat   = Math.round(mctGrams * 0.70 * 10) / 10;
  const mctCarbs = Math.round(mctGrams * 0.30 * 10) / 10;

  // Omega-3 Powder (higher dose for anti-inflammatory)
  const omega3Grams    = isAntiInflam ? 6 : 3.9;
  const omega3Fat      = Math.round(omega3Grams * 0.5 * 10) / 10;
  const omega3Carbs    = Math.round(omega3Grams * 0.5 * 10) / 10;
  const omega3Rationale = isAntiInflam
    ? 'High EPA/DHA (6 g/day) to downregulate pro-inflammatory cytokines and stabilize lean mass.'
    : 'Anti-inflammatory / EPA support.';

  // Carb source (palatinose for diabetic, maltodextrin otherwise)
  const carbGramsTotal   = suppKcal * carbPct / 4;
  const carbSourceGrams  = Math.max(0, Math.round((carbGramsTotal - mctCarbs - omega3Carbs) * 10) / 10);
  const carbName         = isDiabetic ? 'Palatinose (Slow Release)' : 'Maltodextrin (DE 19)';
  const carbId           = isDiabetic ? 'palatinose' : 'maltodextrin';
  const carbRationale    = isDiabetic
    ? 'Slow-release carbohydrate to maintain stable blood glucose levels in diabetic oncology patients.'
    : 'Complex carbohydrate with low osmolality for sustained energy release and GI comfort.';

  // Glutamine — fixed clinical adjunct (mucosal protection, not counted in suppKcal)
  const glutGrams = 16;

  // Batch totals
  const totalPowder  = Math.round((protGrams + carbSourceGrams + mctGrams + omega3Grams + glutGrams) * 10) / 10;
  const totalProtein = Math.round((protDeliv + glutGrams) * 10) / 10; // glutamine = 1 g protein/g
  const totalCarbs   = Math.round((mctCarbs + omega3Carbs + carbSourceGrams) * 10) / 10;
  const totalFat     = Math.round((mctFat + omega3Fat) * 10) / 10;

  return {
    servingsPerDay: 3,
    ingredients: [
      { id: protId, name: protName, grams: protGrams, deliveredProtein: protDeliv,
        rationale: protRationale,
        contrib: { protein: protDeliv, carbs: Math.round(protGrams*0.02*10)/10, fat: Math.round(protGrams*0.01*10)/10 } },
      { id: carbId, name: carbName, grams: carbSourceGrams, rationale: carbRationale,
        contrib: { protein: 0, carbs: carbSourceGrams, fat: 0 } },
      { id: 'mct_powder', name: 'MCT Powder (70%)', grams: mctGrams,
        rationale: 'Metabolic energy without glycemic load',
        contrib: { protein: 0, carbs: mctCarbs, fat: mctFat } },
      { id: 'omega3_powder', name: 'Omega-3 Powder', grams: omega3Grams,
        rationale: omega3Rationale,
        contrib: { protein: 0, carbs: omega3Carbs, fat: omega3Fat } },
      { id: 'glutamine', name: 'L-Glutamine powder', grams: glutGrams,
        rationale: 'Mucosal protection.',
        contrib: { protein: glutGrams, carbs: 0, fat: 0 } }
    ],
    totals: { powder: totalPowder, protein: totalProtein, carbs: totalCarbs, fat: totalFat },
    proteinBreakdown: `Formula ${protDeliv}g + Glutamine ${glutGrams}g`
  };
}

// Helper: fetch engine_formulas from DB and return as { id: value } map
async function loadFormulaConstants(pool) {
  try {
    const r = await pool.query('SELECT id, value FROM engine_formulas');
    const map = {};
    r.rows.forEach(row => { map[row.id] = row.value; });
    return map;
  } catch(e) {
    console.warn('loadFormulaConstants failed, using hardcoded defaults:', e.message);
    return {};
  }
}

function calcWeeklyRxTargets(baseline, mon, formulas) {
  // formulas = rows from engine_formulas keyed by id (e.g. formulas.kcal_cachexia = 35)
  const F = formulas || {};
  const fd = baseline || {};

  // ── STATIC — always from patient's saved baseline record, never re-entered ─
  const height      = fd.height              || null;   // patient.height (cm)
  const sex         = fd.sex                 || 'M';    // patient.sex
  const weightBasis = fd.weightBasisOverride || 'ibw';  // patient.weightBasisOverride
  const giIssues    = fd.giIssues            || false;  // patient.giIssues (hydrolyzed?)

  // ── DYNAMIC — from weekly monitoring; fall back to last saved baseline value ─
  const weight     = mon.weight      != null ? mon.weight      : (fd.weight      || null);
  const ecog       = parseInt(mon.ecog != null ? mon.ecog      : (fd.ecogStatus  || '0'), 10);
  const albumin    = mon.albumin     != null ? mon.albumin     : (fd.albumin     || null);
  const crp        = mon.crp         != null ? mon.crp         : (fd.crp         || null);
  const glucose    = mon.glucose     != null ? mon.glucose     : (fd.bloodSugar  || null);
  const creatinine = mon.creatinine  != null ? mon.creatinine  : (fd.creatinine  || null);
  const urea       = mon.urea        != null ? mon.urea        : (fd.urea        || null);

  // ── Feeding route — preserved from initial plan ──
  // Read from finalPlan.feedingMethod first, then patient-level fields
  const _fp0 = fd.finalPlan || fd.engineOutput || {};
  const feedingRoute = _fp0.feedingMethod || _fp0.prescribedRoute
                    || fd.prescribedRoute  || fd.feedingMethod || '';
  // isTubeFeed based on saved plan's feeding route — but monitoring oralIntake overrides this.
  // If the doctor records oralIntake > 0 in the monitoring form, the patient IS eating orally.
  const _savedRouteIsTube = /enteral|tube|ng[- ]?tube|peg|jej|parenteral|tpn/i.test(feedingRoute);
  const isTubeFeed = (mon.oralIntake != null)
    ? (Number(mon.oralIntake) === 0)   // monitoring is ground truth: 0% oral = tube, >0 = partial oral
    : _savedRouteIsTube;

  // oralIntake from monitoring is 0–100 %; baseline stores reducedFoodIntake (deficit %)
  const oralPct = (mon.oralIntake != null)
    ? Number(mon.oralIntake)   // monitoring entry is always the ground truth
    : (isTubeFeed ? 0 : (fd.reducedFoodIntake != null ? 100 - fd.reducedFoodIntake : 60));

  if (!weight) return null; // need at least weight

  // IBW (Hamwi) — use saved value from finalPlan first (same number doctor approved),
  // recalculate from height only as a fallback.
  // Sanity-check: if saved IBW is < 40% of actual weight it was computed from wrong
  // height data (e.g. height entered in metres instead of cm) — discard and recalculate.
  let calcWeight = weight;
  let ibw = null;
  let bsa = null;
  const isFemaleIBW = sex && (sex.toLowerCase() === 'female' || sex.toLowerCase() === 'f');
  if (_fp0.ibw) {
    const candidateIbw = Math.round(_fp0.ibw * 10) / 10;
    // Plausibility gate: saved IBW must be at least 40% of the monitoring weight.
    // If not, the saved IBW was computed from bad height data — recalculate instead.
    const ibwIsPlausible = !weight || (candidateIbw >= weight * 0.4 && candidateIbw <= weight * 1.5);
    if (ibwIsPlausible) {
      ibw = candidateIbw;
    }
  }
  if (!ibw && height) {
    // Recalculate Hamwi from stored height
    const heightIn = height / 2.54;
    ibw = isFemaleIBW
      ? Math.max(30, 45.5 + 2.2 * (heightIn - 60))
      : Math.max(30, 48   + 2.7 * (heightIn - 60));
    ibw = Math.round(ibw * 10) / 10;
  }
  calcWeight = (weightBasis === 'ibw' && ibw) ? ibw : weight;
  if (height) bsa = Math.round(Math.sqrt(height * weight / 3600) * 100) / 100;

  // ── Read base kcal/kg and protein/kg from the patient's saved initial prescription ──
  // Try finalPlan first, then engineOutput, then top-level fd fields.
  const fp = fd.finalPlan || fd.engineOutput || {};

  // kcal/kg: stored value → derive from baseEnergy/calcWeight → cachexia default
  const _fpKcalPerKg = fp.kcalPerKg
    || (fp.baseEnergy && fp.calcWeight ? Math.round(fp.baseEnergy / fp.calcWeight) : null)
    || fd.kcalPerKg
    || null;
  // Formula grid defaults (from engine_formulas table, admin-configurable)
  const fKcalCachexia       = parseFloat(F.kcal_cachexia)           || 35;
  const fKcalModerate       = parseFloat(F.kcal_moderate_risk)      || 30;
  const fKcalStable         = parseFloat(F.kcal_stable)             || 25;
  const fProtCachexia       = parseFloat(F.protein_cachexia)        || 1.8;
  const fProtBaseline       = parseFloat(F.protein_baseline)        || 1.4;
  const fProtHighCatab      = parseFloat(F.protein_high_catabolism) || 2.0;
  const fProtRenal          = parseFloat(F.protein_renal)           || 0.8;  // KDIGO cap
  const fCreatinineRenal    = parseFloat(F.creatinine_renal_danger) || 1.3;
  const fUreaHigh           = parseFloat(F.urea_high)               || 45;

  // Doctor override from monitoring entry takes highest priority
  const baseKcalPerKg = mon.kcalPerKg || _fpKcalPerKg || fKcalCachexia;

  // protein/kg: stored value → derive from totalDailyProtein/calcWeight → stored dailyProtein/calcWeight → default
  const _fpProtPerKg = fp.proteinPerKg
    || (fp.totalDailyProtein && fp.calcWeight ? Math.round(fp.totalDailyProtein / fp.calcWeight * 10) / 10 : null)
    || (fp.dailyProtein && fp.calcWeight      ? Math.round((fp.dailyProtein / fp.calcWeight) * 2 * 10) / 10 : null)
    || fd.proteinPerKg
    || null;
  // Doctor override from monitoring entry takes highest priority
  const baseProteinPerKg = mon.proteinPerKg || _fpProtPerKg || fProtBaseline;

  // ECOG adjustment: step down if status has deteriorated from baseline
  const baseEcog = parseInt(fd.ecogStatus || '0', 10);
  let kcalPerKg = baseKcalPerKg;
  if      (ecog >= 3 && baseEcog < 3) kcalPerKg = Math.max(fKcalStable,    baseKcalPerKg - 7);
  else if (ecog >= 2 && baseEcog < 2) kcalPerKg = Math.max(fKcalModerate - 2, baseKcalPerKg - 4);

  const totalKcal = Math.round(calcWeight * kcalPerKg);

  // Protein: albumin-driven, then hard-capped by renal safety rule
  const fAlbuminLow  = parseFloat(F.albumin_low_threshold)      || 3.5;
  const fAlbuminCrit = parseFloat(F.albumin_critical_threshold) || 3.0;
  let proteinPerKg = (!albumin || albumin >= fAlbuminLow)
    ? baseProteinPerKg
    : albumin >= fAlbuminCrit
      ? Math.max(baseProteinPerKg, fProtCachexia)
      : Math.max(baseProteinPerKg, fProtHighCatab);

  // KDIGO renal safety cap — highest priority, overrides all other protein targets.
  // Triggered when creatinine ≥ 1.3 mg/dL OR urea ≥ 50 mmol/L.
  const hasRenalFlag = (creatinine != null && creatinine >= fCreatinineRenal)
                    || (urea       != null && urea       >= fUreaHigh);
  if (hasRenalFlag) proteinPerKg = Math.min(proteinPerKg, fProtRenal);

  const totalProtein = Math.round(calcWeight * proteinPerKg * 10) / 10; // one decimal to show cap clearly

  // Supplement portion
  const oralKcal    = Math.round(totalKcal    * (oralPct / 100));
  const suppKcal    = Math.max(0, totalKcal   - oralKcal);
  const suppProtein = Math.max(0, Math.round((totalProtein * (1 - oralPct / 100)) * 10) / 10);

  // Formulation flags
  const isAntiInflam = crp     != null && crp     >= 10;
  const isDiabetic   = glucose != null && glucose >  200;
  const isHydrolyzed = giIssues; // set at baseline, persists unless doctor changes it
  const formulation  = isDiabetic ? 'Diabetic'
                     : isAntiInflam ? 'Anti-inflammatory'
                     : isHydrolyzed ? 'Hydrolyzed'
                     : 'Standard';

  const flags = [];
  if (hasRenalFlag) {
    const renalReason = (creatinine != null && creatinine >= fCreatinineRenal)
      ? `Creatinine ${creatinine} mg/dL (≥${fCreatinineRenal})`
      : `Urea ${urea} mmol/L (≥${fUreaHigh})`;
    flags.push(`⚠️ RENAL: ${renalReason} — KDIGO protocol applied, protein capped to ${fProtRenal} g/kg (${totalProtein}g/day)`);
  }
  if (albumin && albumin < 3.5 && !hasRenalFlag) flags.push(`Low albumin (${albumin} g/dL) → protein target increased to ${proteinPerKg} g/kg`);
  if (isAntiInflam) flags.push(`High CRP (${crp} mg/L) → anti-inflammatory formulation`);
  if (isDiabetic)   flags.push(`High glucose (${glucose} mg/dL) → diabetic formulation`);
  if (ecog >= 3)    flags.push(`ECOG ${ecog} → reduced calorie target (${kcalPerKg} kcal/kg)`);

  const recipe = calcWeeklyRecipe(suppKcal, suppProtein, formulation);

  return { calcWeight: Math.round(calcWeight*10)/10, ibw: ibw ? Math.round(ibw*10)/10 : null, bsa,
           totalKcal, kcalPerKg, totalProtein, proteinPerKg,
           oralKcal, suppKcal, suppProtein, formulation, flags,
           ecog, albumin, crp, glucose, oralPct, weight, height,
           baseKcalPerKg, baseProteinPerKg,
           feedingRoute, isTubeFeed,
           recipe };
}

app.post('/api/patients/:id/monitoring', authenticateToken, async (req, res) => {
  const { type, data } = req.body;
  if (!type || !data) return res.status(400).json({ error: 'type and data required' });
  try {
    const result = await pool.query(
      `INSERT INTO monitoring_logs (patient_id, type, recorded_by, data) VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.params.id, type, req.user.id, JSON.stringify(data)]
    );
    const log = result.rows[0];

    // Auto-generate weekly prescription when type='weekly'
    let weeklyRx = null;
    if (type === 'weekly') {
      try {
        const patRow = await pool.query('SELECT full_data, name, height, sex FROM patients WHERE id=$1', [req.params.id]);
        const baseline = patRow.rows[0] ? (patRow.rows[0].full_data || {}) : {};
        // Dedicated columns override stale full_data blob (same merge as GET /api/patients/:id)
        if (patRow.rows[0] && patRow.rows[0].height != null) baseline.height = patRow.rows[0].height;
        if (patRow.rows[0] && patRow.rows[0].sex    != null) baseline.sex    = patRow.rows[0].sex;
        // Pull finalPlan from nutrition_plans (it's NOT in patients.full_data)
        const planRow = await pool.query(
          'SELECT final_plan, engine_output FROM nutrition_plans WHERE patient_id=$1 ORDER BY version DESC LIMIT 1',
          [req.params.id]
        );
        if (planRow.rowCount) {
          baseline.finalPlan   = planRow.rows[0].final_plan   || baseline.finalPlan;
          baseline.engineOutput = planRow.rows[0].engine_output || baseline.engineOutput;
        }
        const formulaConstants = await loadFormulaConstants(pool);
        const targets  = calcWeeklyRxTargets(baseline, data, formulaConstants);
        if (targets) {
          // Batch code: StudyID-Wn-YYMM (fall back to patientId prefix)
          const enr = await pool.query('SELECT study_id FROM trial_enrollments WHERE patient_id=$1', [req.params.id]);
          const studyId = enr.rows[0] ? enr.rows[0].study_id : req.params.id.slice(0,6).toUpperCase();
          const now = new Date();
          const yymm = String(now.getFullYear()).slice(2) + String(now.getMonth()+1).padStart(2,'0');
          const weekNo = data.week || 1;
          // Include last 4 digits of patient ID to prevent batch code collisions
          // when two patients share the same studyId prefix and week number
          const patSuffix = String(req.params.id).replace(/\D/g,'').slice(-4).padStart(4,'0');
          const batchCode = `${studyId}-W${weekNo}-${yymm}-${patSuffix}`;

          // Baseline snapshot for delta comparison (uses correct patient field names)
          const baselineSnap = {
            weight:     baseline.weight                                       || null,
            albumin:    baseline.albumin                                      || null,
            crp:        baseline.crp                                          || null,
            ecog:       baseline.ecogStatus                                   || 0,
            oralIntake: baseline.reducedFoodIntake != null
                          ? 100 - baseline.reducedFoodIntake : null
          };

          // Explicit SELECT → UPDATE or INSERT to avoid batch_code unique constraint conflicts
          const existingRxAuto = await pool.query(
            'SELECT id FROM weekly_prescriptions WHERE patient_id=$1 AND week_number=$2',
            [req.params.id, weekNo]
          );
          let rxRes;
          if (existingRxAuto.rowCount) {
            rxRes = await pool.query(
              `UPDATE weekly_prescriptions
                 SET monitoring_log_id=$1, batch_code=$2, clinical_params=$3,
                     targets=$4, baseline_snapshot=$5, status='PENDING_REVIEW', updated_at=NOW()
               WHERE patient_id=$6 AND week_number=$7
               RETURNING *`,
              [log.id, batchCode, JSON.stringify(data), JSON.stringify(targets),
               JSON.stringify(baselineSnap), req.params.id, weekNo]
            );
          } else {
            rxRes = await pool.query(
              `INSERT INTO weekly_prescriptions
                 (patient_id, week_number, monitoring_log_id, batch_code,
                  clinical_params, targets, baseline_snapshot, status, created_by)
               VALUES ($1,$2,$3,$4,$5,$6,$7,'PENDING_REVIEW',$8)
               RETURNING *`,
              [req.params.id, weekNo, log.id, batchCode,
               JSON.stringify(data), JSON.stringify(targets),
               JSON.stringify(baselineSnap), req.user.id]
            );
          }
          weeklyRx = rxRes.rows[0];
        }
      } catch(rxErr) { console.error('weekly_rx auto-gen:', rxErr.message); }
    }

    res.json({ ...log, weeklyRx });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Generate prescription from an existing monitoring log (for entries saved before the feature)
app.post('/api/patients/:id/generate-weekly-rx', authenticateToken, async (req, res) => {
  const { monitoringLogId, weekNumber } = req.body;
  if (!monitoringLogId) return res.status(400).json({ error: 'monitoringLogId required' });
  try {
    const patId = req.params.id;
    const logRow = await pool.query('SELECT * FROM monitoring_logs WHERE id=$1 AND patient_id=$2', [monitoringLogId, patId]);
    if (!logRow.rowCount) return res.status(404).json({ error: 'Monitoring log not found' });
    const data = logRow.rows[0].data || {};

    const patRow = await pool.query('SELECT full_data, height, sex FROM patients WHERE id=$1', [patId]);
    if (!patRow.rowCount) return res.status(404).json({ error: 'Patient not found' });
    const baseline = patRow.rows[0].full_data || {};
    // Dedicated columns override stale full_data blob (same merge as GET /api/patients/:id)
    if (patRow.rows[0].height != null) baseline.height = patRow.rows[0].height;
    if (patRow.rows[0].sex    != null) baseline.sex    = patRow.rows[0].sex;
    // Pull finalPlan from nutrition_plans (it's NOT in patients.full_data)
    const planRow2 = await pool.query(
      'SELECT final_plan, engine_output FROM nutrition_plans WHERE patient_id=$1 ORDER BY version DESC LIMIT 1',
      [patId]
    );
    if (planRow2.rowCount) {
      baseline.finalPlan    = planRow2.rows[0].final_plan    || baseline.finalPlan;
      baseline.engineOutput = planRow2.rows[0].engine_output || baseline.engineOutput;
    }
    const formulaConstants2 = await loadFormulaConstants(pool);
    const targets  = calcWeeklyRxTargets(baseline, data, formulaConstants2);
    if (!targets) return res.status(422).json({ error: 'Cannot calculate — patient weight missing from profile or monitoring entry' });

    const enr = await pool.query('SELECT study_id FROM trial_enrollments WHERE patient_id=$1', [patId]);
    const studyId = enr.rows[0] ? enr.rows[0].study_id : patId.slice(0,6).toUpperCase();
    const now = new Date();
    const yymm = String(now.getFullYear()).slice(2) + String(now.getMonth()+1).padStart(2,'0');
    const weekNo = weekNumber || data.week || 1;
    // Include last 4 digits of patient ID to prevent batch_code collisions across patients
    const patSuffix2 = String(patId).replace(/\D/g,'').slice(-4).padStart(4,'0');
    const batchCode = `${studyId}-W${weekNo}-${yymm}-${patSuffix2}`;

    const baselineSnap = {
      weight:     baseline.weight    || null,
      albumin:    baseline.albumin   || null,
      crp:        baseline.crp       || null,
      ecog:       baseline.ecogStatus || 0,
      oralIntake: baseline.reducedFoodIntake != null ? 100 - baseline.reducedFoodIntake : null
    };

    // Use explicit SELECT → UPDATE or INSERT to avoid ON CONFLICT issues.
    const existing = await pool.query(
      'SELECT * FROM weekly_prescriptions WHERE patient_id=$1 AND week_number=$2',
      [patId, weekNo]
    );

    let rxRes;
    if (existing.rowCount) {
      // Record already exists — UPDATE it in place
      if (existing.rows[0].status === 'APPROVED') {
        // Reset the manufacturing job so store cannot print until re-approved
        await pool.query(
          `UPDATE manufacturing_jobs SET status='APPROVED', batch_no=NULL,
            mfg_date=NULL, exp_date=NULL, updated_at=NOW()
           WHERE id=$1`,
          ['wxjob_' + patId + '_w' + weekNo]
        ).catch(() => {});
      }
      rxRes = await pool.query(
        `UPDATE weekly_prescriptions
           SET monitoring_log_id=$1, batch_code=$2, clinical_params=$3,
               targets=$4, baseline_snapshot=$5, status='PENDING_REVIEW', updated_at=NOW()
         WHERE patient_id=$6 AND week_number=$7
         RETURNING *`,
        [monitoringLogId, batchCode, JSON.stringify(data), JSON.stringify(targets),
         JSON.stringify(baselineSnap), patId, weekNo]
      );
    } else {
      // No record yet — INSERT fresh
      rxRes = await pool.query(
        `INSERT INTO weekly_prescriptions
           (patient_id, week_number, monitoring_log_id, batch_code,
            clinical_params, targets, baseline_snapshot, status, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'PENDING_REVIEW',$8)
         RETURNING *`,
        [patId, weekNo, monitoringLogId, batchCode,
         JSON.stringify(data), JSON.stringify(targets),
         JSON.stringify(baselineSnap), req.user.id]
      );
    }
    res.json(rxRes.rows[0]);
  } catch(e) { console.error('[generate-weekly-rx] Error:', e); res.status(500).json({ error: e.message }); }
});

// Weekly prescriptions — list for a patient
app.get('/api/patients/:id/weekly-prescriptions', authenticateToken, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT * FROM weekly_prescriptions WHERE patient_id=$1 ORDER BY week_number ASC`,
      [req.params.id]
    );
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Doctor adjusts targets (still PENDING_REVIEW)
app.put('/api/weekly-prescriptions/:id', authenticateToken, async (req, res) => {
  const { targets, notes } = req.body;
  // Recompute ingredient recipe from updated targets so store always gets fresh breakdown
  const updatedTargets = Object.assign({}, targets);
  if (updatedTargets.suppKcal && updatedTargets.suppProtein) {
    updatedTargets.recipe = calcWeeklyRecipe(
      updatedTargets.suppKcal, updatedTargets.suppProtein, updatedTargets.formulation || 'Standard'
    );
  }
  try {
    const r = await pool.query(
      `UPDATE weekly_prescriptions SET targets=$1, notes=$2, updated_at=NOW()
       WHERE id=$3 RETURNING *`,
      [JSON.stringify(updatedTargets), notes || null, req.params.id]
    );
    if (!r.rowCount) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Doctor approves → status APPROVED → creates manufacturing job
app.post('/api/weekly-prescriptions/:id/approve', authenticateToken, async (req, res) => {
  try {
    const rxRes = await pool.query('SELECT * FROM weekly_prescriptions WHERE id=$1', [req.params.id]);
    if (!rxRes.rowCount) return res.status(404).json({ error: 'Not found' });
    const rx = rxRes.rows[0];

    // Mark approved
    await pool.query(
      `UPDATE weekly_prescriptions SET status='APPROVED', approved_at=NOW(), approved_by=$1, updated_at=NOW() WHERE id=$2`,
      [req.user.id, rx.id]
    );

    // Get store_id for this patient from their original manufacturing job
    const jobRow = await pool.query(
      `SELECT store_id, doctor_id FROM manufacturing_jobs WHERE patient_id=$1 ORDER BY created_at ASC LIMIT 1`,
      [rx.patient_id]
    );
    const storeId  = jobRow.rows[0] ? jobRow.rows[0].store_id  : null;
    const doctorId = jobRow.rows[0] ? jobRow.rows[0].doctor_id : req.user.id;

    // Insert as manufacturing job with weekly batch code
    const jobId = 'wxjob_' + rx.patient_id + '_w' + rx.week_number;
    await pool.query(
      `INSERT INTO manufacturing_jobs (id, patient_id, store_id, doctor_id, status, batch_no, history)
       VALUES ($1,$2,$3,$4,'APPROVED',$5,$6)
       ON CONFLICT (id) DO UPDATE SET status='APPROVED', batch_no=$5, updated_at=NOW()`,
      [jobId, rx.patient_id, storeId, doctorId, rx.batch_code,
       JSON.stringify([{ status:'APPROVED', at: new Date().toISOString(), note: `Week ${rx.week_number} prescription` }])]
    );

    res.json({ success: true, batchCode: rx.batch_code, jobId });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Admin: all weekly prescriptions across all patients
app.get('/api/weekly-prescriptions', authenticateToken, async (req, res) => {
  const role = req.user && req.user.role;
  if (!['ADMIN','SUPER_ADMIN'].includes(role)) return res.status(403).json({ error: 'Admin only' });
  try {
    const r = await pool.query(
      `SELECT wp.*, p.name AS patient_name,
              te.study_id
       FROM weekly_prescriptions wp
       LEFT JOIN patients p ON p.id = wp.patient_id
       LEFT JOIN trial_enrollments te ON te.patient_id = wp.patient_id
       ORDER BY wp.patient_id, wp.week_number ASC`
    );
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Doctor's weekly work queue ────────────────────────────────────────────
// Answers "what needs me this week?" in ONE request. Previously the dashboard
// had no weekly signal at all and the only way to find out was to open each
// patient profile in turn; doing that from the client would mean two requests
// per patient, so the aggregation lives here: three queries total regardless
// of how many patients the doctor has.
//
// Shape is deliberately flat and pre-computed — the dashboard renders it
// directly without re-deriving weeks, due dates or warnings client-side.
app.get('/api/doctor/weekly-queue', authenticateToken, async (req, res) => {
  try {
    const role = req.user && req.user.role;
    const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(role);
    // Assistants act on behalf of their doctor; the client passes ?doctorId=.
    const docId = req.query.doctorId || req.user.id;

    const patRes = isAdmin && !req.query.doctorId
      ? await pool.query(
          `SELECT id, name, uhic, cancer, weight, full_data, created_date FROM patients`)
      : await pool.query(
          `SELECT id, name, uhic, cancer, weight, full_data, created_date
             FROM patients
            WHERE assigned_doctor_id = $1 OR full_data->>'assignedDoctorId' = $1`, [docId]);

    const patients = patRes.rows;
    if (!patients.length) return res.json({ patients: [], generatedAt: new Date().toISOString() });

    const ids = patients.map(p => p.id);
    const [logRes, rxRes] = await Promise.all([
      pool.query(
        `SELECT patient_id, type, recorded_at, data FROM monitoring_logs
          WHERE patient_id = ANY($1) ORDER BY recorded_at ASC`, [ids]),
      pool.query(
        `SELECT id, patient_id, week_number, status, batch_code, targets, notes,
                monitoring_log_id, created_at, approved_at
           FROM weekly_prescriptions
          WHERE patient_id = ANY($1) ORDER BY week_number ASC`, [ids])
    ]);

    // `data` is JSONB but older rows were written as a JSON string — the profile
    // page carries the same guard. Parse defensively rather than trusting the type.
    const asObj = d => {
      if (!d) return {};
      if (typeof d === 'string') { try { return JSON.parse(d); } catch (e) { return {}; } }
      return d;
    };
    const num = v => {
      if (v === null || v === undefined || v === '') return null;
      const n = parseFloat(v);
      return isNaN(n) ? null : n;
    };

    const weeklyBy = {}, dailyBy = {}, rxBy = {};
    logRes.rows.forEach(l => {
      const bucket = (l.type === 'daily') ? dailyBy : weeklyBy;
      (bucket[l.patient_id] = bucket[l.patient_id] || []).push({ at: l.recorded_at, d: asObj(l.data) });
    });
    rxRes.rows.forEach(r => { (rxBy[r.patient_id] = rxBy[r.patient_id] || []).push(r); });

    const DAY = 86400000;
    const now = Date.now();
    const SUPPLY_DAYS = 7;   // one weekly batch = 7 days of cover

    const out = patients.map(p => {
      const fd      = p.full_data || {};
      const weeks   = weeklyBy[p.id] || [];
      const dailies = dailyBy[p.id]  || [];
      const rxs     = rxBy[p.id]     || [];

      // ── Week history, one entry per weekly log ──
      // week_number is doctor-typed and carries no uniqueness or contiguity
      // guarantee, so fall back to the log's ordinal position when it's absent.
      const history = weeks.map((w, i) => ({
        wk:      num(w.d.week) != null ? num(w.d.week) : (i + 1),
        at:      w.at,
        weight:  num(w.d.weight),
        bmi:     num(w.d.bmi),
        muac:    num(w.d.muac),
        ecog:    num(w.d.ecog),
        albumin: num(w.d.albumin),
        crp:     num(w.d.crp),
        creatinine: num(w.d.creatinine),
        urea:    num(w.d.urea),
        oral:    num(w.d.oralIntake),
        adh:     num(w.d.compliance),
        kcalkg:  num(w.d.kcalPerKg),
        protkg:  num(w.d.proteinPerKg)
      }));

      const lastWeekly = weeks.length ? weeks[weeks.length - 1] : null;
      const lastWeeklyAt = lastWeekly ? lastWeekly.at : null;
      const daysSinceWeekly = lastWeeklyAt
        ? Math.floor((now - new Date(lastWeeklyAt).getTime()) / DAY) : null;
      const currentWeek = history.length
        ? history.reduce((m, h) => Math.max(m, h.wk || 0), 0) : 0;

      const lastDaily = dailies.length ? dailies[dailies.length - 1] : null;
      const daysSinceDaily = lastDaily
        ? Math.floor((now - new Date(lastDaily.at).getTime()) / DAY) : null;

      // ── Prescription state ──
      const pendingRow  = rxs.filter(r => r.status === 'PENDING_REVIEW')
                             .sort((a, b) => b.week_number - a.week_number)[0] || null;
      const approvedRows = rxs.filter(r => r.status === 'APPROVED');
      const lastApproved = approvedRows.length
        ? approvedRows[approvedRows.length - 1] : null;

      // ── Warnings shown inline on the queue row ──
      // The doctor approves from the row, so anything that should give them
      // pause has to be visible there. Thresholds follow the same ESPEN/GLIM
      // logic the risk panel uses.
      const warnings = [];
      const h1 = history[history.length - 1], h0 = history[history.length - 2];
      if (h1 && h0 && h1.weight != null && h0.weight != null) {
        const drop = h0.weight - h1.weight;
        const pct  = h0.weight ? (drop / h0.weight) * 100 : 0;
        if (drop >= 2 || pct >= 5) {
          warnings.push({ level: 'high', label: 'WEIGHT',
            detail: `down ${drop.toFixed(1)} kg (${pct.toFixed(1)}%) since week ${h0.wk}` });
        }
      }
      if (h1 && h1.adh != null && h1.adh < 70) {
        warnings.push({ level: 'high', label: 'ADHERENCE', detail: `${h1.adh}%` });
      } else if (h1 && h0 && h1.adh != null && h0.adh != null && (h0.adh - h1.adh) >= 15) {
        warnings.push({ level: 'watch', label: 'ADHERENCE',
          detail: `${h1.adh}%, down from ${h0.adh}%` });
      }
      if (h1 && h0 && h1.ecog != null && h0.ecog != null && h1.ecog > h0.ecog) {
        warnings.push({ level: 'watch', label: 'ECOG', detail: `${h0.ecog} → ${h1.ecog}` });
      }
      // Same renal thresholds the client-side fallback in the profile applies.
      if (h1 && ((h1.creatinine != null && h1.creatinine >= 1.3) || (h1.urea != null && h1.urea >= 50))) {
        warnings.push({ level: 'high', label: 'RENAL',
          detail: [h1.creatinine != null ? `creatinine ${h1.creatinine}` : null,
                   h1.urea != null ? `urea ${h1.urea}` : null].filter(Boolean).join(', ') });
      }
      if (h1 && h1.oral != null && h1.oral <= 30) {
        warnings.push({ level: 'high', label: 'INTAKE', detail: `oral ${h1.oral}%` });
      }
      const t = pendingRow && pendingRow.targets;
      if (t && t.manuallyAdjusted) {
        warnings.push({ level: 'watch', label: 'ADJUSTED', detail: 'targets manually changed' });
      }

      // ── Supply cover, for the "no product going out" case ──
      const lastApprovedAt = lastApproved
        ? (lastApproved.approved_at || lastApproved.created_at) : null;
      const supplyDaysLeft = lastApprovedAt
        ? SUPPLY_DAYS - Math.floor((now - new Date(lastApprovedAt).getTime()) / DAY)
        : null;

      return {
        id: p.id,
        name: p.name,
        uhic: p.uhic || fd.uhic || null,
        cancer: p.cancer || fd.cancer || null,
        currentWeek,
        history,
        lastWeeklyAt,
        daysSinceWeekly,
        // No due-date column exists; a week of cover from the last log is the
        // same rule the profile page's overdue banner already uses.
        dueAt: lastWeeklyAt
          ? new Date(new Date(lastWeeklyAt).getTime() + 7 * DAY).toISOString() : null,
        weeklyOverdue: daysSinceWeekly == null ? false : daysSinceWeekly >= 7,
        neverMonitored: weeks.length === 0,
        daysSinceDaily,
        dailyGap: daysSinceDaily == null ? null : daysSinceDaily,
        pendingRx: pendingRow ? {
          id: pendingRow.id,
          weekNumber: pendingRow.week_number,
          status: pendingRow.status,
          batchCode: pendingRow.batch_code,
          targets: pendingRow.targets || {},
          notes: pendingRow.notes,
          createdAt: pendingRow.created_at
        } : null,
        lastApproved: lastApproved ? {
          weekNumber: lastApproved.week_number,
          batchCode: lastApproved.batch_code,
          approvedAt: lastApproved.approved_at
        } : null,
        supplyDaysLeft,
        warnings
      };
    });

    res.json({ patients: out, generatedAt: new Date().toISOString() });
  } catch (e) {
    console.error('[weekly-queue]', e);
    res.status(500).json({ error: e.message });
  }
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

// Edit an existing monitoring log entry (doctor correction)
app.put('/api/monitoring/:logId', authenticateToken, async (req, res) => {
  const { data } = req.body;
  if (!data) return res.status(400).json({ error: 'data required' });
  try {
    const result = await pool.query(
      `UPDATE monitoring_logs SET data=$1, recorded_by=$2 WHERE id=$3 RETURNING *`,
      [JSON.stringify(data), req.user.id, req.params.logId]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Log not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/monitoring/:logId', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM monitoring_logs WHERE id=$1 RETURNING id`,
      [req.params.logId]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Log not found' });
    res.json({ deleted: req.params.logId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ───────────────────── Early-warning risk panel ───────────────────────────
// Surfaces the patients who are deteriorating RIGHT NOW, so a clinician doesn't
// have to open 40 charts to find the 3 that matter. Thresholds follow ESPEN /
// GLIM malnutrition criteria rather than arbitrary cut-offs:
//   • unintentional loss >2%/week or >5%/month  → malnutrition red flag
//   • albumin falling while CRP rises           → inflammatory catabolism,
//     which nutrition alone will not reverse (needs clinical review)
//   • intake/adherence collapse                 → the plan isn't reaching them
// Every flag returns its own reason string; nothing is a black box.
app.get('/api/risk-panel', authenticateToken, async (req, res) => {
  try {
    const role = req.user && req.user.role;
    const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(role);

    // Doctors see their own list; admins see everyone.
    let patRes;
    if (isAdmin) {
      patRes = await pool.query(
        `SELECT id, name, uhic, cancer, weight, albumin, crp, ecog_status, full_data,
                assigned_doctor_id, created_date
           FROM patients`);
    } else {
      const docId = req.user.id;
      patRes = await pool.query(
        `SELECT id, name, uhic, cancer, weight, albumin, crp, ecog_status, full_data,
                assigned_doctor_id, created_date
           FROM patients
          WHERE assigned_doctor_id = $1 OR full_data->>'assignedDoctorId' = $1`, [docId]);
    }
    const patients = patRes.rows;
    if (!patients.length) return res.json({ patients: [] });

    const ids = patients.map(p => p.id);
    const logRes = await pool.query(
      `SELECT patient_id, type, recorded_at, data FROM monitoring_logs
        WHERE patient_id = ANY($1) ORDER BY recorded_at ASC`, [ids]);

    const weeklyBy = {}, dailyBy = {};
    logRes.rows.forEach(l => {
      const bucket = (l.type === 'daily') ? dailyBy : weeklyBy;
      (bucket[l.patient_id] = bucket[l.patient_id] || []).push({
        at: l.recorded_at, ...(l.data || {})
      });
    });

    // A stored 0 for a lab or anthropometric measure means "not recorded" —
    // CRP is never truly 0 and a MUAC/weight of 0 is impossible. Without this
    // the panel raised "Low albumin 0 g/dL" style flags on missing data.
    const num = (v, key) => {
      if (v === null || v === undefined || v === '') return null;
      const n = parseFloat(v);
      if (isNaN(n)) return null;
      if (n === 0 && key && ['crp','muac','albumin','weight','bmi','handGrip'].includes(key)) return null;
      return n;
    };
    const DAY = 86400000;

    const out = patients.map(p => {
      const fd = p.full_data || {};
      const weeks = weeklyBy[p.id] || [];
      const days  = dailyBy[p.id]  || [];
      const flags = [];
      let score = 0;

      const baseWeight  = num(p.weight,'weight')   != null ? num(p.weight,'weight')   : num(fd.weight,'weight');
      const baseAlbumin = num(p.albumin,'albumin') != null ? num(p.albumin,'albumin') : num(fd.albumin,'albumin');
      const baseCrp     = num(p.crp,'crp')         != null ? num(p.crp,'crp')         : num(fd.crp,'crp');

      const last  = weeks.length ? weeks[weeks.length - 1] : null;
      const prev  = weeks.length > 1 ? weeks[weeks.length - 2] : null;

      // ── Weight trajectory (ESPEN/GLIM) ──
      // Scored by RATE, not cumulative total. Losing 4% over 7 weeks (0.6%/wk)
      // is unremarkable in oncology; losing 4% over 2 weeks (2%/wk) is an
      // emergency. Ranking on the total alone made those look identical and
      // flooded the panel with slow, stable drifters.
      const lastW = last ? num(last.weight,'weight') : null;
      if (lastW != null && baseWeight) {
        // Measure from the earliest known observation, not blindly from
        // created_date: a patient enrolled and weighed the same day yields a
        // 1-day window, which turns a 6% loss into a nonsense "43%/week".
        const firstWeekAt = weeks.length ? weeks[0].at : null;
        const candidates = [p.created_date, firstWeekAt]
          .filter(Boolean)
          .map(d => new Date(d).getTime())
          .filter(t => !isNaN(t));
        const startMs = candidates.length ? Math.min.apply(null, candidates) : null;
        const endMs = last.at ? new Date(last.at).getTime() : null;
        const elapsedDays = (startMs && endMs && endMs > startMs) ? (endMs - startMs) / DAY : null;
        const lossPct = (baseWeight - lastW) / baseWeight * 100;

        if (lossPct > 0) {
          const since = lossPct.toFixed(1) + '% since baseline';
          // Below ~7 days there aren't enough days to extrapolate a weekly rate
          // without wild error, so judge on the absolute loss instead.
          if (elapsedDays == null || elapsedDays < 7) {
            if (lossPct >= 5) {
              score += 30;
              flags.push({ level:'high', label:'Significant weight loss',
                detail: since + (elapsedDays ? ' over ' + Math.round(elapsedDays) + ' days' : '') });
            } else if (lossPct >= 2) {
              score += 12;
              flags.push({ level:'watch', label:'Weight declining', detail: since });
            }
          } else {
            const perWeek = lossPct / (elapsedDays / 7);
            const detail = perWeek.toFixed(1) + '%/week (' + since + ', over '
                         + Math.round(elapsedDays) + ' days)';
            if (perWeek >= 2) {
              score += 45;
              flags.push({ level:'critical', label:'Rapid weight loss',
                detail: detail + ' — exceeds the 2%/week malnutrition threshold' });
            } else if (perWeek >= 1.25) {
              score += 30;
              flags.push({ level:'high', label:'Accelerated weight loss',
                detail: detail + ' — above 5%/month' });
            }
            // Anything slower than 1.25%/week is background drift in an
            // advanced-cancer cohort. A 0.8%/week "watch" tier existed here but
            // produced rows no clinician would act on, so it was removed —
            // the panel should only carry things worth interrupting for.
          }
        }
      }

      // ── Albumin falling while CRP rises = inflammatory catabolism ──
      const lastAlb = last ? num(last.albumin,'albumin') : null;
      const prevAlb = prev ? num(prev.albumin,'albumin') : baseAlbumin;
      const lastCrp = last ? num(last.crp,'crp') : null;
      const prevCrp = prev ? num(prev.crp,'crp') : baseCrp;
      if (lastAlb != null && prevAlb != null && lastCrp != null && prevCrp != null
          && lastAlb < prevAlb && lastCrp > prevCrp) {
        score += 30;
        flags.push({ level:'critical', label:'Inflammatory catabolism',
          detail: 'Albumin ' + prevAlb + '→' + lastAlb + ' g/dL while CRP ' + prevCrp + '→' + lastCrp + ' mg/L — nutrition support alone may not reverse this' });
      } else if (lastAlb != null && lastAlb < 3.0) {
        score += 20;
        flags.push({ level:'high', label:'Low albumin',
          detail: lastAlb + ' g/dL — below 3.0 threshold' });
      }

      if (lastCrp != null && lastCrp > 50) {
        score += 10;
        flags.push({ level:'watch', label:'High inflammation', detail:'CRP ' + lastCrp + ' mg/L' });
      }

      // ── Intake / adherence collapse ──
      const lastOral = last ? num(last.oralIntake,'oralIntake') : null;
      const lastComp = last ? num(last.compliance,'compliance') : null;
      // Only SEVERE intake failure is flagged. In a head & neck / GI cohort,
      // eating 35-40% of requirement is the norm — it's why the patient is on
      // supplements at all — so alerting on it told the doctor nothing they
      // hadn't already assumed, and drowned the genuinely deteriorating cases.
      if (lastOral != null && lastOral < 30) {
        score += 30;
        flags.push({ level:'critical', label:'Severe intake failure',
          detail: lastOral + '% of requirement met orally' });
      }
      if (lastComp != null) {
        if (lastComp < 40)      { score += 20; flags.push({ level:'high',  label:'Supplement not being taken', detail: 'only ' + lastComp + '% consumed' }); }
        else if (lastComp < 60) { score += 10; flags.push({ level:'watch', label:'Low supplement compliance',  detail: lastComp + '% consumed' }); }
      }

      // ── ECOG deterioration ──
      const lastEcog = last ? num(last.ecog,'ecog') : null;
      const prevEcog = prev ? num(prev.ecog,'ecog') : num(p.ecog_status);
      if (lastEcog != null && prevEcog != null && lastEcog > prevEcog) {
        score += 15;
        flags.push({ level:'high', label:'Performance status worsening',
          detail: 'ECOG ' + prevEcog + ' → ' + lastEcog });
      }

      // ── Monitoring lapse ──
      // Kept OUT of the clinical score. Silence is a follow-up failure, not
      // deterioration — mixing them ranked out-of-contact patients above
      // actively deteriorating ones and muddied the clinical signal.
      const lastAnyAt = [last ? last.at : null, days.length ? days[days.length-1].at : null]
        .filter(Boolean).sort().pop();
      const daysSince = lastAnyAt ? Math.floor((Date.now() - new Date(lastAnyAt)) / DAY) : null;
      const lapsed = (daysSince != null && daysSince > 14) || lastAnyAt === null;

      const level = score >= 45 ? 'critical' : score >= 20 ? 'high' : score > 0 ? 'watch' : 'ok';
      return {
        patientId: p.id, name: p.name, uhic: p.uhic, cancer: p.cancer,
        doctorId: p.assigned_doctor_id || fd.assignedDoctorId || null,
        weeksMonitored: weeks.length,
        lastEntryAt: lastAnyAt || null,
        daysSinceLastEntry: daysSince,
        lapsed,
        score, level, flags
      };
    })
    .filter(r => r.flags.length || r.lapsed)
    .sort((a,b) => b.score - a.score);

    res.json({ patients: out, generatedAt: new Date().toISOString() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ───────────────────────── Clinical Trials module ─────────────────────────
// Pilot settings (target size, definition of "completed", lost-to-follow-up window)
app.get('/api/pilot-settings', authenticateToken, async (req, res) => {
  try { const r = await pool.query('SELECT * FROM pilot_settings WHERE id=1'); res.json(r.rows[0] || {}); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/pilot-settings', authenticateToken, requireAdminOnly, async (req, res) => {
  const { target_patients, pilot_weeks, lost_threshold_days } = req.body || {};
  try {
    await pool.query(
      `UPDATE pilot_settings SET target_patients=COALESCE($1,target_patients),
         pilot_weeks=COALESCE($2,pilot_weeks), lost_threshold_days=COALESCE($3,lost_threshold_days) WHERE id=1`,
      [target_patients, pilot_weeks, lost_threshold_days]);
    const r = await pool.query('SELECT * FROM pilot_settings WHERE id=1');
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Clinical Trials READ access covers doctors as well as admins — clinicians
// review the whole cohort, not just their own patients. Store roles are still
// excluded: they handle manufacturing and have no need for outcome data.
// Client-side auth.requireRole() only hides the UI; this is the real guard.
function requireAdmin(req, res, next) {
  const role = req.user && req.user.role;
  if (!['ADMIN', 'SUPER_ADMIN', 'DOCTOR'].includes(role)) {
    return res.status(403).json({ error: 'Not permitted' });
  }
  next();
}

// Changes that alter study-wide state stay restricted to admins.
function requireAdminOnly(req, res, next) {
  const role = req.user && req.user.role;
  if (!['ADMIN', 'SUPER_ADMIN'].includes(role)) {
    return res.status(403).json({ error: 'Admin only' });
  }
  next();
}

// Manually flag a patient as Withdrawn (the one trial status that can't be auto-derived)
app.post('/api/trials/:patientId/withdraw', authenticateToken, requireAdmin, async (req, res) => {
  const { reason } = req.body || {};
  try {
    await pool.query(
      'UPDATE trial_enrollments SET withdrawn_at=NOW(), withdrawn_reason=$2 WHERE patient_id=$1',
      [req.params.patientId, reason || null]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// Un-withdraw (correction)
app.post('/api/trials/:patientId/reinstate', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await pool.query('UPDATE trial_enrollments SET withdrawn_at=NULL, withdrawn_reason=NULL WHERE patient_id=$1', [req.params.patientId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Enrollment Log — auto-enrols pilot patients (those approved into production), assigns
// Study IDs, and returns each with a fully-derived trial status + key dates.
app.get('/api/trials', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const settings = (await pool.query('SELECT * FROM pilot_settings WHERE id=1')).rows[0]
      || { pilot_weeks: 6, lost_threshold_days: 14, target_patients: 30 };

    // Pilot cohort = patients who have a manufacturing job (i.e. approved into production).
    const jobsRes = await pool.query('SELECT patient_id, status, history, mfg_date, batch_no, created_at FROM manufacturing_jobs');
    const jobByPatient = {};
    jobsRes.rows.forEach(j => {
      const prev = jobByPatient[j.patient_id];
      if (!prev || new Date(j.created_at) > new Date(prev.created_at)) jobByPatient[j.patient_id] = j;
    });
    const ids = Object.keys(jobByPatient);
    if (!ids.length) return res.json({ settings, patients: [] });

    const patRes = await pool.query('SELECT id, uhic, name, cancer, created_date FROM patients WHERE id = ANY($1)', [ids]);
    const patById = {}; patRes.rows.forEach(p => { patById[p.id] = p; });

    const monRes = await pool.query(
      `SELECT patient_id, COUNT(*)::int AS wk_count, MAX(recorded_at) AS last_at
         FROM monitoring_logs WHERE type='weekly' AND patient_id = ANY($1) GROUP BY patient_id`, [ids]);
    const monByPatient = {}; monRes.rows.forEach(m => { monByPatient[m.patient_id] = m; });

    const trialRes = await pool.query('SELECT * FROM trial_enrollments WHERE patient_id = ANY($1)', [ids]);
    const trialByPatient = {}; trialRes.rows.forEach(t => { trialByPatient[t.patient_id] = t; });

    // created_date is a free-form VARCHAR (could be "6/15/2026", ISO, or junk), so parse
    // it safely — an unparseable date must not crash the endpoint.
    const _ts = (v) => { const d = v ? new Date(v) : null; return d && !isNaN(d.getTime()) ? d.getTime() : 0; };
    const _isoDay = (v) => { const d = v ? new Date(v) : null; return (d && !isNaN(d.getTime()) ? d : new Date()).toISOString().slice(0, 10); };

    // Auto-enrol any pilot patient without a trial record, in created-date order for stable IDs.
    const maxRes = await pool.query(`SELECT COALESCE(MAX((regexp_replace(study_id,'\\D','','g'))::int),0) AS maxn FROM trial_enrollments`);
    let nextN = (maxRes.rows[0].maxn || 0) + 1;
    const missing = ids.filter(id => !trialByPatient[id] && patById[id])
      .map(id => patById[id])
      .sort((a, b) => _ts(a.created_date) - _ts(b.created_date));
    for (const p of missing) {
      const studyId = 'GQ-' + String(nextN).padStart(3, '0');
      const enrollDate = _isoDay(p.created_date);
      try {
        const ins = await pool.query(
          `INSERT INTO trial_enrollments (patient_id, study_id, enrollment_date) VALUES ($1,$2,$3)
             ON CONFLICT (patient_id) DO NOTHING RETURNING *`, [p.id, studyId, enrollDate]);
        if (ins.rows[0]) { trialByPatient[p.id] = ins.rows[0]; nextN++; }
        else {
          const r = await pool.query('SELECT * FROM trial_enrollments WHERE patient_id=$1', [p.id]);
          if (r.rows[0]) trialByPatient[p.id] = r.rows[0];
        }
      } catch (e) { /* skip collisions */ }
    }

    const now = Date.now();
    const histDispatch = (job) => {
      const h = Array.isArray(job.history) ? job.history : [];
      const d = h.find(e => (e.status || '').toUpperCase() === 'DISPATCHED');
      return d ? d.at : (job.mfg_date || null);
    };
    const isDispatched = (job) => {
      if ((job.status || '').toUpperCase() === 'DISPATCHED') return true;
      const h = Array.isArray(job.history) ? job.history : [];
      return h.some(e => (e.status || '').toUpperCase() === 'DISPATCHED');
    };

    const patients = ids.map(id => {
      const p = patById[id], job = jobByPatient[id], t = trialByPatient[id];
      if (!p || !t) return null;
      const mon = monByPatient[id] || { wk_count: 0, last_at: null };
      const wk = mon.wk_count || 0;
      let status;
      if (t.withdrawn_at) status = 'Withdrawn';
      else if (wk >= settings.pilot_weeks) status = 'Completed';
      else if (isDispatched(job) || wk > 0) {
        const lastAt = mon.last_at ? new Date(mon.last_at).getTime() : null;
        status = (wk > 0 && lastAt && (now - lastAt) > settings.lost_threshold_days * 86400000)
          ? 'Lost to Follow-up' : 'Active';
      } else status = 'Enrolled';
      return {
        studyId: t.study_id, patientId: id,
        uhic: p.uhic, name: p.name, diagnosis: p.cancer,
        enrollmentDate: t.enrollment_date,
        supplementStartDate: histDispatch(job),
        batchNo: job.batch_no || null,
        weeklyReviews: wk,
        withdrawnReason: t.withdrawn_reason || null,
        status
      };
    }).filter(Boolean).sort((a, b) => (a.studyId > b.studyId ? 1 : -1));

    res.json({ settings, patients });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Export Pilot Dataset — assembles the full pilot dataset (4 tables) for Excel export.
app.get('/api/trials/export', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const settings = (await pool.query('SELECT * FROM pilot_settings WHERE id=1')).rows[0]
      || { pilot_weeks: 6, lost_threshold_days: 14 };
    const jobsRes = await pool.query('SELECT patient_id, status, history, mfg_date, batch_no, created_at FROM manufacturing_jobs');
    const jobByPatient = {};
    jobsRes.rows.forEach(j => { const prev = jobByPatient[j.patient_id]; if (!prev || new Date(j.created_at) > new Date(prev.created_at)) jobByPatient[j.patient_id] = j; });
    const ids = Object.keys(jobByPatient);
    if (!ids.length) return res.json({ enrollment: [], baseline: [], weekly: [], final: [] });

    const pats = (await pool.query('SELECT id, uhic, name, cancer, sex, age, weight, height, albumin, crp, muac, hemoglobin, created_date FROM patients WHERE id = ANY($1)', [ids])).rows;
    const patById = {}; pats.forEach(p => { patById[p.id] = p; });
    const trials = (await pool.query('SELECT * FROM trial_enrollments WHERE patient_id = ANY($1)', [ids])).rows;
    const trialByPat = {}; trials.forEach(t => { trialByPat[t.patient_id] = t; });
    const plans = (await pool.query('SELECT patient_id, version FROM nutrition_plans WHERE patient_id = ANY($1) ORDER BY version DESC NULLS LAST', [ids])).rows;
    const verByPat = {}; plans.forEach(pl => { if (verByPat[pl.patient_id] === undefined) verByPat[pl.patient_id] = pl.version; });
    const logs = (await pool.query(`SELECT patient_id, recorded_at, data FROM monitoring_logs WHERE type='weekly' AND patient_id = ANY($1) ORDER BY recorded_at ASC`, [ids])).rows;
    const weeklyByPat = {};
    logs.forEach(l => { (weeklyByPat[l.patient_id] = weeklyByPat[l.patient_id] || []).push({ recordedAt: l.recorded_at, ...(l.data || {}) }); });

    const _d = (v) => { if (!v) return ''; const d = new Date(v); return isNaN(d.getTime()) ? String(v).slice(0, 10) : d.toISOString().slice(0, 10); };
    const _num = (v) => (v === null || v === undefined || v === '' || isNaN(parseFloat(v))) ? null : parseFloat(v);
    const bmi = (w, h) => { const W = _num(w), H = _num(h); return (W && H) ? Math.round(W / Math.pow(H / 100, 2) * 10) / 10 : null; };
    const histAt = (job, status) => { const h = Array.isArray(job.history) ? job.history : []; const e = h.find(x => (x.status || '').toUpperCase() === status); return e ? e.at : null; };
    const isDispatched = (job) => (job.status || '').toUpperCase() === 'DISPATCHED' || (Array.isArray(job.history) && job.history.some(e => (e.status || '').toUpperCase() === 'DISPATCHED'));
    const now = Date.now();
    const statusOf = (id) => {
      const t = trialByPat[id], job = jobByPatient[id];
      const wks = weeklyByPat[id] || [];
      if (t && t.withdrawn_at) return 'Withdrawn';
      if (wks.length >= settings.pilot_weeks) return 'Completed';
      if (isDispatched(job) || wks.length > 0) {
        const last = wks.length ? new Date(wks[wks.length - 1].recordedAt).getTime() : null;
        if (wks.length > 0 && last && (now - last) > settings.lost_threshold_days * 86400000) return 'Lost to Follow-up';
        return 'Active';
      }
      return 'Enrolled';
    };

    const enrollment = [], baseline = [], weekly = [], final = [];
    ids.forEach(id => {
      const p = patById[id]; if (!p) return;
      const t = trialByPat[id], job = jobByPatient[id];
      const studyId = t ? t.study_id : '';
      enrollment.push({
        'Study ID': studyId, 'UHID': p.uhic || '', 'Patient Name': p.name || '', 'Diagnosis': p.cancer || '',
        'Sex': p.sex || '', 'Age': p.age != null ? p.age : '',
        'Enrolled Date': _d(t ? t.enrollment_date : p.created_date),
        'Report/Approval Date': _d(histAt(job, 'APPROVED') || job.created_at),
        'Manufacturing Date': _d(job.mfg_date),
        'Dispatch / Start Date': _d(histAt(job, 'DISPATCHED') || job.mfg_date),
        'Status': statusOf(id), 'Formula Version': verByPat[id] != null ? verByPat[id] : 1, 'Batch No': job.batch_no || ''
      });
      baseline.push({
        'Study ID': studyId, 'Patient Name': p.name || '',
        'Weight (kg)': _num(p.weight), 'Height (cm)': _num(p.height), 'BMI': bmi(p.weight, p.height),
        'MUAC (cm)': _num(p.muac), 'Albumin (g/dL)': _num(p.albumin), 'CRP (mg/L)': _num(p.crp), 'Hemoglobin (g/dL)': _num(p.hemoglobin)
      });
      const wks = weeklyByPat[id] || [];
      wks.forEach((w, i) => {
        weekly.push({
          'Study ID': studyId, 'Week': w.week != null ? w.week : (i + 1), 'Date': _d(w.recordedAt),
          'Weight (kg)': _num(w.weight), 'BMI': _num(w.bmi), 'MUAC (cm)': _num(w.muac), 'Hand Grip': _num(w.handGrip),
          'ECOG': w.ecog != null ? w.ecog : '', 'Albumin (g/dL)': _num(w.albumin), 'CRP (mg/L)': _num(w.crp), 'Glucose': _num(w.glucose)
        });
      });
      const lastW = wks.length ? wks[wks.length - 1] : null;
      const bW = _num(p.weight), bAlb = _num(p.albumin), bCrp = _num(p.crp);
      const lW = lastW ? _num(lastW.weight) : null, lAlb = lastW ? _num(lastW.albumin) : null, lCrp = lastW ? _num(lastW.crp) : null;
      final.push({
        'Study ID': studyId, 'Patient Name': p.name || '', 'Status': statusOf(id), 'Weeks Completed': wks.length,
        'Baseline Weight': bW, 'Final Weight': lW, 'Weight Change': (bW != null && lW != null) ? Math.round((lW - bW) * 10) / 10 : null,
        'Baseline Albumin': bAlb, 'Final Albumin': lAlb, 'Albumin Change': (bAlb != null && lAlb != null) ? Math.round((lAlb - bAlb) * 10) / 10 : null,
        'Baseline CRP': bCrp, 'Final CRP': lCrp, 'CRP Change': (bCrp != null && lCrp != null) ? Math.round((lCrp - bCrp) * 10) / 10 : null
      });
    });

    enrollment.sort((a, b) => String(a['Study ID']).localeCompare(String(b['Study ID'])));
    baseline.sort((a, b) => String(a['Study ID']).localeCompare(String(b['Study ID'])));
    weekly.sort((a, b) => String(a['Study ID']).localeCompare(String(b['Study ID'])) || (a['Week'] - b['Week']));
    final.sort((a, b) => String(a['Study ID']).localeCompare(String(b['Study ID'])));

    res.json({ enrollment, baseline, weekly, final, generatedAt: new Date().toISOString() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Formula Tracking — which formula version + batch each pilot patient received.
app.get('/api/trials/formula', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const jobsRes = await pool.query('SELECT patient_id, status, history, mfg_date, batch_no, created_at FROM manufacturing_jobs');
    const jobByPatient = {};
    jobsRes.rows.forEach(j => {
      const prev = jobByPatient[j.patient_id];
      if (!prev || new Date(j.created_at) > new Date(prev.created_at)) jobByPatient[j.patient_id] = j;
    });
    const ids = Object.keys(jobByPatient);
    if (!ids.length) return res.json({ patients: [] });

    const pats = (await pool.query('SELECT id, name FROM patients WHERE id = ANY($1)', [ids])).rows;
    const nameById = {}; pats.forEach(p => { nameById[p.id] = p.name; });
    const trials = (await pool.query('SELECT patient_id, study_id FROM trial_enrollments WHERE patient_id = ANY($1)', [ids])).rows;
    const studyByPat = {}; trials.forEach(t => { studyByPat[t.patient_id] = t.study_id; });

    // Latest plan version + recipe per patient.
    const plans = (await pool.query('SELECT patient_id, version, full_data FROM nutrition_plans WHERE patient_id = ANY($1) ORDER BY version DESC NULLS LAST', [ids])).rows;
    const planByPat = {};
    plans.forEach(pl => { if (!planByPat[pl.patient_id]) planByPat[pl.patient_id] = pl; });

    const histDispatch = (job) => {
      const h = Array.isArray(job.history) ? job.history : [];
      const d = h.find(e => (e.status || '').toUpperCase() === 'DISPATCHED');
      return d ? d.at : (job.mfg_date || null);
    };

    const patients = ids.map(id => {
      const job = jobByPatient[id];
      const pl = planByPat[id];
      const fd = (pl && pl.full_data) || {};
      const fp = fd.finalPlan || fd;
      const proteinType = fp.proteinType
        || (fp.recipe && fp.recipe.protein && fp.recipe.protein.name)
        || null;
      return {
        patientId: id,
        studyId: studyByPat[id] || null,
        name: nameById[id] || '—',
        formulaVersion: pl && pl.version != null ? pl.version : null,
        proteinType,
        batchNo: job.batch_no || null,
        mfgDate: job.mfg_date || null,
        startDate: histDispatch(job)
      };
    }).sort((a, b) => String(a.studyId).localeCompare(String(b.studyId)));

    res.json({ patients });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


// ── Doctor ID migration — reassign patients from old localStorage doctor ID to DB doctor ID
app.post('/api/admin/migrate-doctor-id', authenticateToken, async (req, res) => {
  if (!['ADMIN','SUPER_ADMIN'].includes(req.user && req.user.role)) return res.status(403).json({ error: 'Admin only' });
  try {
    const { oldId, newId } = req.body;
    if (!oldId || !newId) return res.status(400).json({ error: 'oldId and newId required' });
    // Update assigned_doctor_id column
    const r1 = await pool.query(
      'UPDATE patients SET assigned_doctor_id=$1 WHERE assigned_doctor_id=$2',
      [newId, oldId]
    );
    // Update inside full_data JSONB
    const r2 = await pool.query(
      `UPDATE patients SET full_data = jsonb_set(full_data, '{assignedDoctorId}', to_jsonb($1::text))
       WHERE full_data->>'assignedDoctorId' = $2`,
      [newId, oldId]
    );
    res.json({ ok: true, columnUpdated: r1.rowCount, jsonbUpdated: r2.rowCount });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Weekly Outcomes — weekly monitoring metrics for every pilot patient.
app.get('/api/trials/outcomes', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const jobsRes = await pool.query('SELECT DISTINCT patient_id FROM manufacturing_jobs');
    const ids = jobsRes.rows.map(r => r.patient_id).filter(Boolean);
    if (!ids.length) return res.json({ patients: [] });
    const pats = (await pool.query(
      'SELECT id, name, weight, albumin, crp, muac, hand_grip, ecog_status, full_data FROM patients WHERE id = ANY($1)', [ids]
    )).rows;
    const nameById = {};
    const baselineById = {};
    pats.forEach(p => {
      nameById[p.id] = p.name;
      const fd = p.full_data || {};
      const reducedFI = fd.reducedFoodIntake != null ? fd.reducedFoodIntake : null;
      baselineById[p.id] = {
        weight:     p.weight      != null ? p.weight      : (fd.weight     || null),
        albumin:    p.albumin     != null ? p.albumin     : (fd.albumin    || null),
        crp:        p.crp         != null ? p.crp         : (fd.crp        || null),
        muac:       p.muac        != null ? p.muac        : (fd.muac       || null),
        handGrip:   p.hand_grip   != null ? p.hand_grip   : (fd.handGrip   || null),
        bmi:        fd.bmi        != null ? fd.bmi        : null,
        ecog:       p.ecog_status != null ? p.ecog_status : (fd.ecogStatus || null),
        oralIntake: reducedFI     != null ? (100 - reducedFI) : null,
        compliance: null
      };
    });
    const trials = (await pool.query('SELECT patient_id, study_id FROM trial_enrollments WHERE patient_id = ANY($1)', [ids])).rows;
    const studyByPat = {}; trials.forEach(t => { studyByPat[t.patient_id] = t.study_id; });
    const logs = (await pool.query(
      `SELECT patient_id, recorded_at, data FROM monitoring_logs
         WHERE type='weekly' AND patient_id = ANY($1) ORDER BY recorded_at ASC`, [ids])).rows;
    const byPat = {};
    logs.forEach(l => {
      const d = l.data || {};
      (byPat[l.patient_id] = byPat[l.patient_id] || []).push({
        recordedAt: l.recorded_at,
        week: d.week != null ? d.week : null,
        weight: d.weight != null ? d.weight : null,
        bmi: d.bmi != null ? d.bmi : null,
        muac: d.muac != null ? d.muac : null,
        handGrip: d.handGrip != null ? d.handGrip : null,
        ecog: d.ecog != null ? d.ecog : null,
        albumin: d.albumin != null ? d.albumin : null,
        crp: d.crp != null ? d.crp : null,
        glucose: d.glucose != null ? d.glucose : null,
        oralIntake: d.oralIntake != null ? d.oralIntake : null,
        compliance: d.compliance != null ? d.compliance : null
      });
    });
    // Daily logs
    const dailyLogs = (await pool.query(
      `SELECT patient_id, recorded_at, data FROM monitoring_logs
         WHERE type='daily' AND patient_id = ANY($1) ORDER BY recorded_at ASC`, [ids])).rows;
    const dayByPat = {};
    dailyLogs.forEach(l => {
      const d = l.data || {};
      (dayByPat[l.patient_id] = dayByPat[l.patient_id] || []).push({
        recordedAt: l.recorded_at,
        date: d.date || null,
        oralIntake: d.oralIntake != null ? d.oralIntake : null,
        suppPrescribed: d.suppPrescribed || null,
        suppConsumed: d.suppConsumed != null ? d.suppConsumed : null,
        nausea: d.nausea || null,
        vomiting: d.vomiting || null,
        mucositis: d.mucositis || null,
        bowel: d.bowel || null,
        hydration: d.hydration || null,
        notes: d.notes || null
      });
    });

    const patients = ids.map(id => ({
      patientId: id,
      studyId: studyByPat[id] || null,
      name: nameById[id] || '—',
      baseline: baselineById[id] || null,
      weeks: byPat[id] || [],
      days: dayByPat[id] || []
    })).sort((a, b) => String(a.studyId).localeCompare(String(b.studyId)));
    res.json({ patients });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ───────────────────── Supply run-out prediction ──────────────────────────
// The adherence tracker reports gaps AFTER they happen. This predicts them:
// each dispatched product covers a fixed window, so we can tell who runs out
// in the next few days and whether anything is in the pipeline to replace it.
//
// SUPPLY_DAYS is 7 because the whole model is weekly prescriptions — one
// approved weekly Rx produces one product covering one week. If products ever
// cover a different span this is the single place to change it.
const SUPPLY_DAYS = 7;
// Warn this many days before the current product is exhausted, so the store
// has time to manufacture and dispatch the next one.
const SUPPLY_WARN_DAYS = 3;

app.get('/api/supply-status', authenticateToken, async (req, res) => {
  try {
    const role = req.user && req.user.role;
    const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(role);
    const isStore = ['STORE', 'STORE_APPROVER'].includes(role);

    let patRes;
    if (isAdmin) {
      patRes = await pool.query('SELECT id, name, uhic, cancer, assigned_doctor_id, full_data FROM patients');
    } else if (isStore) {
      // Store users see patients whose products belong to their store.
      const u = (await pool.query('SELECT store_id FROM users WHERE id=$1', [req.user.id])).rows[0];
      const storeId = u && u.store_id;
      if (!storeId) return res.json({ patients: [], supplyDays: SUPPLY_DAYS });
      patRes = await pool.query(
        `SELECT DISTINCT p.id, p.name, p.uhic, p.cancer, p.assigned_doctor_id, p.full_data
           FROM patients p JOIN manufacturing_jobs j ON j.patient_id = p.id
          WHERE j.store_id = $1`, [storeId]);
    } else {
      patRes = await pool.query(
        `SELECT id, name, uhic, cancer, assigned_doctor_id, full_data FROM patients
          WHERE assigned_doctor_id = $1 OR full_data->>'assignedDoctorId' = $1`, [req.user.id]);
    }
    const patients = patRes.rows;
    if (!patients.length) return res.json({ patients: [], supplyDays: SUPPLY_DAYS });

    const ids = patients.map(p => p.id);
    const jobs = (await pool.query(
      `SELECT id, patient_id, status, history, batch_no, created_at
         FROM manufacturing_jobs WHERE patient_id = ANY($1)`, [ids])).rows;
    const trials = (await pool.query(
      'SELECT patient_id, withdrawn_at FROM trial_enrollments WHERE patient_id = ANY($1)', [ids])).rows;
    const withdrawnBy = {}; trials.forEach(t => { withdrawnBy[t.patient_id] = t.withdrawn_at; });

    const settings = (await pool.query('SELECT * FROM pilot_settings WHERE id=1')).rows[0]
      || { pilot_weeks: 6 };
    const weekCounts = (await pool.query(
      `SELECT patient_id, COUNT(*)::int AS n FROM monitoring_logs
        WHERE type='weekly' AND patient_id = ANY($1) GROUP BY patient_id`, [ids])).rows;
    const weeksBy = {}; weekCounts.forEach(r => { weeksBy[r.patient_id] = r.n; });

    const jobsBy = {};
    jobs.forEach(j => { (jobsBy[j.patient_id] = jobsBy[j.patient_id] || []).push(j); });

    const DAY = 86400000;
    const dispatchedAt = (j) => {
      const h = Array.isArray(j.history) ? j.history : [];
      const e = h.find(x => (x.status || '').toUpperCase() === 'DISPATCHED');
      return e ? e.at : ((j.status || '').toUpperCase() === 'DISPATCHED' ? j.created_at : null);
    };
    const weekNo = (j) => {
      const m = String(j.id).match(/_w(\d+)$/);
      return m ? parseInt(m[1], 10) : 0;
    };
    const label = (j) => weekNo(j) ? 'Week ' + weekNo(j) : 'Initial';

    const out = patients.map(p => {
      const list = (jobsBy[p.id] || []).sort((a, b) => weekNo(a) - weekNo(b));
      if (!list.length) return null;

      // Latest product that actually reached the patient.
      let lastDispatch = null, lastLabel = null;
      list.forEach(j => {
        const at = dispatchedAt(j);
        if (at && (!lastDispatch || new Date(at) > new Date(lastDispatch))) {
          lastDispatch = at; lastLabel = label(j);
        }
      });

      // Anything already moving through the store counts as cover.
      const pipeline = list.filter(j => {
        const s = (j.status || '').toUpperCase();
        return s !== 'DISPATCHED' && s !== 'DELIVERED';
      }).map(j => ({ label: label(j), status: j.status }));

      // Not a supply problem if the patient has finished or left the study.
      const finished = (weeksBy[p.id] || 0) >= (settings.pilot_weeks || 6);
      const withdrawn = !!withdrawnBy[p.id];

      let runsOutAt = null, daysLeft = null;
      if (lastDispatch) {
        const end = new Date(new Date(lastDispatch).getTime() + SUPPLY_DAYS * DAY);
        runsOutAt = end.toISOString();
        daysLeft = Math.floor((end.getTime() - Date.now()) / DAY);
      }

      let state = 'ok', reason = null;
      if (withdrawn)        { state = 'inactive'; reason = 'Withdrawn from study'; }
      else if (finished)    { state = 'inactive'; reason = 'Pilot complete'; }
      else if (!lastDispatch) {
        state = pipeline.length ? 'awaiting_first' : 'none';
        reason = pipeline.length
          ? 'First product not dispatched yet (' + pipeline[0].label + ' ' + (pipeline[0].status||'') + ')'
          : 'No product dispatched and nothing in production';
      } else if (daysLeft < 0) {
        state = pipeline.length ? 'out_pipeline' : 'out';
        reason = Math.abs(daysLeft) + ' day' + (Math.abs(daysLeft)===1?'':'s') + ' past supply end'
               + (pipeline.length ? ' — ' + pipeline[0].label + ' in production' : ' — nothing in production');
      } else if (daysLeft <= SUPPLY_WARN_DAYS && !pipeline.length) {
        state = 'running_out';
        reason = daysLeft === 0 ? 'Supply ends today — nothing in production'
               : daysLeft + ' day' + (daysLeft===1?'':'s') + ' of supply left — nothing in production';
      }

      return {
        patientId: p.id, name: p.name, uhic: p.uhic, cancer: p.cancer,
        doctorId: p.assigned_doctor_id || (p.full_data||{}).assignedDoctorId || null,
        lastProduct: lastLabel, lastDispatchAt: lastDispatch,
        runsOutAt, daysLeft, pipeline, state, reason
      };
    }).filter(Boolean);

    // Most urgent first: already out, then running out, then the rest.
    const rank = { out:0, running_out:1, out_pipeline:2, none:3, awaiting_first:4, ok:5, inactive:6 };
    out.sort((a,b) => (rank[a.state] - rank[b.state]) || ((a.daysLeft ?? 999) - (b.daysLeft ?? 999)));

    res.json({ patients: out, supplyDays: SUPPLY_DAYS, warnDays: SUPPLY_WARN_DAYS });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Impact summary: baseline vs latest across the cohort ──────────────────
// Answers the question a doctor evaluating the product actually asks: "is this
// working?" In advanced cancer the expected trajectory is continued loss, so
// stabilisation is itself a result — but this is a single-arm pilot with no
// control group, so the response deliberately ships the caveats alongside the
// numbers rather than letting the UI imply proof of causation.
app.get('/api/trials/impact', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const jobsRes = await pool.query('SELECT DISTINCT patient_id FROM manufacturing_jobs');
    const ids = jobsRes.rows.map(r => r.patient_id).filter(Boolean);
    if (!ids.length) return res.json({ metrics: [], patients: [], n: 0 });

    const pats = (await pool.query(
      `SELECT id, name, weight, height, albumin, crp, muac, hand_grip, full_data
         FROM patients WHERE id = ANY($1)`, [ids])).rows;
    const trials = (await pool.query(
      'SELECT patient_id, study_id FROM trial_enrollments WHERE patient_id = ANY($1)', [ids])).rows;
    const studyBy = {}; trials.forEach(t => { studyBy[t.patient_id] = t.study_id; });

    const logs = (await pool.query(
      `SELECT patient_id, recorded_at, data FROM monitoring_logs
        WHERE type='weekly' AND patient_id = ANY($1) ORDER BY recorded_at ASC`, [ids])).rows;
    const weeklyBy = {};
    logs.forEach(l => { (weeklyBy[l.patient_id] = weeklyBy[l.patient_id] || []).push(l.data || {}); });

    const num = v => (v === null || v === undefined || v === '' || isNaN(parseFloat(v)))
      ? null : parseFloat(v);

    // Per-patient baseline → latest pairs. A patient only counts for a metric
    // if BOTH ends exist; otherwise the mean would be computed over a shifting
    // denominator and quietly overstate the effect.
    const rows = pats.map(p => {
      const fd = p.full_data || {};
      const weeks = weeklyBy[p.id] || [];
      const lastOf = key => {
        for (let i = weeks.length - 1; i >= 0; i--) {
          const v = num(weeks[i][key]);
          if (v !== null) return v;
        }
        return null;
      };
      const base = {
        weight:  num(p.weight)    != null ? num(p.weight)    : num(fd.weight),
        albumin: num(p.albumin)   != null ? num(p.albumin)   : num(fd.albumin),
        crp:     num(p.crp)       != null ? num(p.crp)       : num(fd.crp),
        muac:    num(p.muac)      != null ? num(p.muac)      : num(fd.muac),
        grip:    num(p.hand_grip) != null ? num(p.hand_grip) : num(fd.handGrip)
      };
      const latest = {
        weight: lastOf('weight'), albumin: lastOf('albumin'),
        crp: lastOf('crp'), muac: lastOf('muac'), grip: lastOf('handGrip')
      };
      return {
        patientId: p.id, name: p.name, studyId: studyBy[p.id] || null,
        weeks: weeks.length, base, latest
      };
    }).filter(r => r.weeks > 0);

    // "Higher is better" for weight/albumin/MUAC/grip; CRP is inverted.
    const METRICS = [
      { key:'weight',  label:'Weight',      unit:'kg',   better:'up'   },
      { key:'albumin', label:'Albumin',     unit:'g/dL', better:'up'   },
      { key:'crp',     label:'CRP',         unit:'mg/L', better:'down' },
      { key:'muac',    label:'MUAC',        unit:'cm',   better:'up'   },
      { key:'grip',    label:'Hand grip',   unit:'kg',   better:'up'   }
    ];

    const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
    // Sample standard deviation of the paired differences.
    const sd = a => {
      if (a.length < 2) return null;
      const m = mean(a);
      return Math.sqrt(a.reduce((s, v) => s + Math.pow(v - m, 2), 0) / (a.length - 1));
    };

    const metrics = METRICS.map(m => {
      const paired = rows
        .map(r => ({ b: r.base[m.key], l: r.latest[m.key] }))
        .filter(x => x.b !== null && x.l !== null);
      if (!paired.length) {
        return { ...m, n:0, baselineMean:null, latestMean:null, meanChange:null,
                 improved:0, stable:0, worsened:0 };
      }
      const diffs = paired.map(x => x.l - x.b);
      // "Stable" band avoids counting measurement noise as change:
      // ±2% of baseline for weight, ±10% for the lab values.
      const band = m.key === 'weight' ? 0.02 : 0.10;
      let improved = 0, stable = 0, worsened = 0;
      paired.forEach((x, i) => {
        const tol = Math.abs(x.b) * band;
        const d = diffs[i];
        if (Math.abs(d) <= tol) stable++;
        else if (m.better === 'up' ? d > 0 : d < 0) improved++;
        else worsened++;
      });
      const md = mean(diffs), s = sd(diffs);
      return {
        ...m,
        n: paired.length,
        baselineMean: +mean(paired.map(x => x.b)).toFixed(2),
        latestMean:   +mean(paired.map(x => x.l)).toFixed(2),
        meanChange:   +md.toFixed(2),
        sdChange:     s != null ? +s.toFixed(2) : null,
        // Standard error of the mean difference — lets the UI show a range
        // rather than a single figure that looks more precise than it is.
        semChange:    (s != null && paired.length > 1) ? +(s / Math.sqrt(paired.length)).toFixed(2) : null,
        improved, stable, worsened
      };
    });

    res.json({
      n: rows.length,
      metrics,
      patients: rows.map(r => ({
        studyId: r.studyId, name: r.name, weeks: r.weeks,
        weightChange:  (r.base.weight  != null && r.latest.weight  != null) ? +(r.latest.weight  - r.base.weight ).toFixed(1) : null,
        albuminChange: (r.base.albumin != null && r.latest.albumin != null) ? +(r.latest.albumin - r.base.albumin).toFixed(2) : null,
        crpChange:     (r.base.crp     != null && r.latest.crp     != null) ? +(r.latest.crp     - r.base.crp    ).toFixed(1) : null
      })),
      caveats: [
        'Single-arm pilot: there is no control group, so these changes cannot be attributed to the supplement alone.',
        'Patients also received concurrent oncological treatment, which independently affects every metric shown.',
        'Only patients with both a baseline and a follow-up value are counted for each metric; n varies by row.',
        'Albumin and CRP are acute-phase reactants and move with infection and treatment cycles, not nutrition alone.'
      ],
      generatedAt: new Date().toISOString()
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Patient Journey — assembles every key date for one patient from existing data.
app.get('/api/trials/:patientId/journey', authenticateToken, requireAdmin, async (req, res) => {
  const pid = req.params.patientId;
  try {
    const pat = (await pool.query('SELECT id, uhic, name, cancer, created_date, created_at FROM patients WHERE id=$1', [pid])).rows[0];
    if (!pat) return res.status(404).json({ error: 'Patient not found' });
    const trial = (await pool.query('SELECT * FROM trial_enrollments WHERE patient_id=$1', [pid])).rows[0] || null;
    const allJobs = (await pool.query('SELECT id, status, history, mfg_date, exp_date, batch_no, created_at FROM manufacturing_jobs WHERE patient_id=$1 ORDER BY created_at ASC', [pid])).rows;
    // Initial product job = first non-weekly job (weekly jobs have id 'wxjob_...')
    const job = allJobs.find(j => !String(j.id).startsWith('wxjob_')) || allJobs[0] || null;
    let weeklyRx = [];
    try {
      weeklyRx = (await pool.query(
        `SELECT wp.week_number, wp.status, wp.approved_at, wp.batch_code, u.name AS approved_by_name
           FROM weekly_prescriptions wp LEFT JOIN users u ON u.id = wp.approved_by
          WHERE wp.patient_id=$1 ORDER BY wp.week_number ASC`, [pid])).rows;
    } catch(_) {}
    const planRes = await pool.query('SELECT generated_at FROM nutrition_plans WHERE patient_id=$1 ORDER BY generated_at ASC', [pid]);
    const weeklyRes = await pool.query(`SELECT recorded_at FROM monitoring_logs WHERE patient_id=$1 AND type='weekly' ORDER BY recorded_at ASC`, [pid]);
    const settings = (await pool.query('SELECT * FROM pilot_settings WHERE id=1')).rows[0] || { pilot_weeks: 6 };

    const histAt = (status) => {
      const h = job && Array.isArray(job.history) ? job.history : [];
      const e = h.find(x => (x.status || '').toUpperCase() === status);
      return e ? e.at : null;
    };
    const isDispatched = (j) => {
      if (!j) return false;
      if ((j.status || '').toUpperCase() === 'DISPATCHED') return true;
      const h = Array.isArray(j.history) ? j.history : [];
      return h.some(e => (e.status || '').toUpperCase() === 'DISPATCHED');
    };
    const weeklyDates = weeklyRes.rows.map(r => r.recorded_at);
    const baseline = pat.created_date || pat.created_at || null;
    const wk = weeklyDates.length;
    const lostThreshold = (settings.lost_threshold_days || 14) * 86400000;
    let trialStatus;
    if (trial && trial.withdrawn_at) trialStatus = 'Withdrawn';
    else if (wk >= (settings.pilot_weeks || 6)) trialStatus = 'Completed';
    else if (isDispatched(job) || wk > 0) {
      const lastAt = weeklyDates.length ? new Date(weeklyDates[weeklyDates.length - 1]).getTime() : null;
      trialStatus = (wk > 0 && lastAt && (Date.now() - lastAt) > lostThreshold) ? 'Lost to Follow-up' : 'Active';
    } else trialStatus = 'Enrolled';

    // Per-product dispatch timeline: initial job + each weekly job,
    // with approved / processing / dispatched timestamps from job history.
    const histEntry = (j, status) => {
      const h = j && Array.isArray(j.history) ? j.history : [];
      return h.find(x => (x.status || '').toUpperCase() === status) || null;
    };
    const products = allJobs.map(j => {
      const isWeekly = String(j.id).startsWith('wxjob_');
      const wkMatch  = isWeekly ? String(j.id).match(/_w(\d+)$/) : null;
      const weekNum  = wkMatch ? Number(wkMatch[1]) : null;
      const rx = isWeekly ? weeklyRx.find(r => Number(r.week_number) === weekNum) : null;
      const ap = histEntry(j, 'APPROVED'), pr = histEntry(j, 'PROCESSING'), dp = histEntry(j, 'DISPATCHED');
      return {
        type:         isWeekly ? 'weekly' : 'initial',
        week:         weekNum,
        label:        isWeekly ? ('Week ' + weekNum) : 'Initial',
        batchNo:      j.batch_no || (rx ? rx.batch_code : null),
        status:       j.status,
        approvedAt:   (ap ? ap.at : null) || (rx ? rx.approved_at : null) || j.created_at,
        approvedBy:   (ap && ap.by) || (rx ? rx.approved_by_name : null) || null,
        processingAt: pr ? pr.at : null,
        processingBy: (pr && pr.by) || null,
        dispatchedAt: dp ? dp.at : null,
        dispatchedBy: (dp && dp.by) || null,
        mfgDate:      j.mfg_date,
        expDate:      j.exp_date
      };
    }).sort((a, b) => (a.type === 'initial' ? -1 : b.type === 'initial' ? 1 : (a.week || 0) - (b.week || 0)));

    res.json({
      patient: { id: pat.id, uhic: pat.uhic, name: pat.name, diagnosis: pat.cancer },
      studyId: trial ? trial.study_id : null,
      trialStatus,
      withdrawnAt: trial ? trial.withdrawn_at : null,
      withdrawnReason: trial ? trial.withdrawn_reason : null,
      batchNo: job ? job.batch_no : null,
      milestones: {
        enrollment:       trial ? trial.enrollment_date : baseline,
        baseline:         baseline,
        reportGenerated:  planRes.rows.length ? planRes.rows[0].generated_at : null,
        hodApproval:      histAt('APPROVED') || (job ? job.created_at : null),
        manufacturing:    job ? job.mfg_date : null,
        dispatch:         histAt('DISPATCHED'),
        supplementStart:  histAt('DISPATCHED') || (job ? job.mfg_date : null),
        finalAssessment:  weeklyDates.length >= settings.pilot_weeks ? weeklyDates[weeklyDates.length - 1] : null
      },
      weeklyReviews: weeklyDates,
      products
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
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

// ── Hospitals (normalized entity) ─────────────────────────────────────────
// Find a hospital by name (case-insensitive) or create it; returns its id.
async function _resolveHospitalId(name){
  const nm = (name || '').trim();
  if (!nm) return null;
  const ex = await pool.query('SELECT id FROM hospitals WHERE LOWER(name)=LOWER($1) LIMIT 1', [nm]);
  if (ex.rows[0]) return ex.rows[0].id;
  const hid = 'hosp_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
  await pool.query('INSERT INTO hospitals (id, name) VALUES ($1,$2) ON CONFLICT (name) DO NOTHING', [hid, nm]);
  const r = await pool.query('SELECT id FROM hospitals WHERE LOWER(name)=LOWER($1) LIMIT 1', [nm]);
  return r.rows[0] ? r.rows[0].id : hid;
}
app.get('/api/hospitals', authenticateToken, async (req, res) => {
  try { const r = await pool.query('SELECT id, name, city FROM hospitals ORDER BY name'); res.json(r.rows); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/hospitals', authenticateToken, async (req, res) => {
  const { name, city } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'name required' });
  try {
    const id = await _resolveHospitalId(name);
    if (city) await pool.query('UPDATE hospitals SET city=$1 WHERE id=$2', [city, id]);
    const r = await pool.query('SELECT id, name, city FROM hospitals WHERE id=$1', [id]);
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Users: Create (admin)
app.post('/api/users', authenticateToken, async (req, res) => {
  const { id, name, email, password, role, hospital_name, store_id, phone } = req.body;
  try {
    const hash = await bcrypt.hash(password, 10);
    const hospitalId = await _resolveHospitalId(hospital_name);
    const result = await pool.query(
      'INSERT INTO users (id, name, email, password_hash, role, hospital_name, hospital_id, store_id, phone) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, name, email, role, hospital_name, hospital_id, store_id, phone',
      [id || `user_${Date.now()}`, name, email, hash, role, hospital_name, hospitalId, store_id || null, phone || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Users: Delete
app.delete('/api/users/:id', authenticateToken, async (req, res) => {
  const userId = req.params.id;
  try {
    // Patients reference a doctor via assigned_doctor_id / created_by_id (foreign keys
    // to users). Without clearing these first, Postgres blocks the delete. We null the
    // links — the PATIENTS are kept (just left unassigned) — then remove the user.
    const r = await pool.query('UPDATE patients SET assigned_doctor_id = NULL WHERE assigned_doctor_id = $1', [userId]);
    await pool.query('UPDATE patients SET created_by_id = NULL WHERE created_by_id = $1', [userId]);
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    res.json({ success: true, patientsUnassigned: r.rowCount || 0 });
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
  const targetId = req.params.id;
  try {
    // Safety: confirm exactly ONE user matches this id before changing anything.
    // If duplicate ids exist in the DB, a blind UPDATE would reset every matching
    // user's password at once - so we refuse and report it instead.
    const match = await pool.query('SELECT id, email FROM users WHERE id = $1', [targetId]);
    if (match.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (match.rowCount > 1) {
      console.error(`[reset-password] REFUSED: id "${targetId}" matches ${match.rowCount} users (duplicate IDs). No passwords changed.`);
      return res.status(409).json({
        error: `Reset blocked: ${match.rowCount} users share this ID. Fix duplicate IDs before resetting so other users are not affected.`
      });
    }

    const hash = await bcrypt.hash(password, 10);
    const upd = await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, targetId]);
    console.log(`[reset-password] OK: reset password for id "${targetId}" (${match.rows[0].email}) by admin ${req.user && req.user.id}. Rows changed: ${upd.rowCount}`);
    res.json({ success: true });
  } catch (err) {
    console.error('[reset-password] ERROR:', err.message);
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
  const fssai = req.body.fssai_number || req.body.fssai || null;
  const address = req.body.address || null;
  try {
    const hospitalId = await _resolveHospitalId(hospital);
    const result = await pool.query(
      'INSERT INTO stores (id, name, hospital, hospital_id, location, fssai_number, address) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [id || `store_${Date.now()}`, name, hospital || '', hospitalId, location || '', fssai, address]
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

// Create manufacturing jobs for any approved (or further) patient that lacks one.
// Derives status/store/doctor from dedicated columns, falling back to the
// full_data JSON blob and to the assigned doctor's store mapping.
async function reconcileJobs() {
  // The manufacturing_jobs table has FKs (store_id -> stores, doctor_id -> users),
  // so we resolve each candidate to ids that actually exist, then insert row by
  // row — one bad row can't abort the batch, and we report why any were skipped.
  const cand = await pool.query(`
    SELECT p.id AS patient_id,
           p.name,
           COALESCE(
             (SELECT s.id FROM stores s WHERE s.id = p.store_id),
             (SELECT s.id FROM stores s WHERE s.id = u.store_id),
             (SELECT s.id FROM stores s WHERE s.id = p.full_data->>'storeId')
           ) AS store_id,
           (SELECT us.id FROM users us WHERE us.id = COALESCE(p.assigned_doctor_id, p.full_data->>'assignedDoctorId')) AS doctor_id,
           COALESCE(p.status, p.full_data->>'status') AS status
    FROM patients p
    LEFT JOIN users u ON u.id = COALESCE(p.assigned_doctor_id, p.full_data->>'assignedDoctorId')
    WHERE COALESCE(p.status, p.full_data->>'status') IN ('APPROVED','PROCESSING','DISPATCHED','DELIVERED')
      AND NOT EXISTS (SELECT 1 FROM manufacturing_jobs mj WHERE mj.patient_id = p.id)
  `);

  let created = 0;
  const skipped = [];
  for (const r of cand.rows) {
    if (!r.store_id) {
      skipped.push({ patient: r.name || r.patient_id, reason: 'no valid store mapping (orphaned store id)' });
      continue;
    }
    try {
      const ins = await pool.query(
        `INSERT INTO manufacturing_jobs (id, patient_id, store_id, doctor_id, status, history)
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING`,
        ['job_' + r.patient_id, r.patient_id, r.store_id, r.doctor_id, r.status,
         JSON.stringify([{ status: r.status, at: new Date().toISOString() }])]
      );
      created += ins.rowCount;
    } catch (e) {
      skipped.push({ patient: r.name || r.patient_id, reason: e.message });
    }
  }
  return { created, skipped };
}

// Manufacturing Jobs: Get All
app.get('/api/manufacturing-jobs', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM manufacturing_jobs ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: reconcile / backfill jobs on demand + return a diagnostic snapshot.
app.post('/api/admin/reconcile-jobs', authenticateToken, async (req, res) => {
  const role = req.user && req.user.role;
  if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Admin only' });
  try {
    const bf = await reconcileJobs();
    const approved = await pool.query(`
      SELECT p.id, p.name,
             COALESCE(p.status, p.full_data->>'status') AS status,
             COALESCE(p.store_id, u.store_id, p.full_data->>'storeId') AS store_id,
             (SELECT 1 FROM manufacturing_jobs mj WHERE mj.patient_id = p.id LIMIT 1) AS has_job
      FROM patients p
      LEFT JOIN users u ON u.id = COALESCE(p.assigned_doctor_id, p.full_data->>'assignedDoctorId')
      WHERE COALESCE(p.status, p.full_data->>'status') IN ('APPROVED','PROCESSING','DISPATCHED','DELIVERED')
    `);
    const jobs = await pool.query('SELECT id, patient_id, store_id, status FROM manufacturing_jobs');
    const storeUsers = await pool.query("SELECT id, name, role, store_id FROM users WHERE role IN ('STORE','STORE_APPROVER','COORDINATOR','DOCTOR')");
    res.json({
      created: bf.created,
      skipped: bf.skipped,
      approvedPatients: approved.rows,
      jobs: jobs.rows,
      storeUsers: storeUsers.rows
    });
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

// Allowed job status transitions, keyed by current status.
// Value maps target status -> role required to perform it.
const JOB_TRANSITIONS = {
  APPROVED:           { PENDING_PROCESSING: 'STORE' },
  PROCESSING:         { PENDING_DISPATCH:   'STORE' },
  PENDING_PROCESSING: { PROCESSING: 'STORE_APPROVER', APPROVED:   'STORE_APPROVER' },
  PENDING_DISPATCH:   { DISPATCHED: 'STORE_APPROVER', PROCESSING: 'STORE_APPROVER' },
  DISPATCHED:         { DELIVERED:  'COORDINATOR' }
};

// Manufacturing Jobs: Update Status
app.put('/api/manufacturing-jobs/:id', authenticateToken, async (req, res) => {
  const { status, history } = req.body;
  try {
    const role = req.user && req.user.role;
    const isAdmin = role === 'ADMIN' || role === 'SUPER_ADMIN';
    const target = (status || '').toUpperCase();

    // Load the current job to validate the transition and ownership.
    const cur = await pool.query('SELECT status, store_id FROM manufacturing_jobs WHERE id=$1', [req.params.id]);
    if (!cur.rows.length) return res.status(404).json({ error: 'Job not found' });
    const currentStatus = (cur.rows[0].status || '').toUpperCase();
    const jobStore = cur.rows[0].store_id;

    if (!isAdmin) {
      // Store-scope: a manager/approver may only touch their own store's jobs.
      if (role === 'STORE' || role === 'STORE_APPROVER') {
        const ur = await pool.query('SELECT store_id FROM users WHERE id=$1', [req.user.id]);
        const userStore = ur.rows[0] && ur.rows[0].store_id;
        if (userStore && jobStore && userStore !== jobStore) {
          return res.status(403).json({ error: 'This job belongs to another store.' });
        }
      }
      // Transition legality + role requirement.
      const allowed = JOB_TRANSITIONS[currentStatus] || {};
      if (!(target in allowed)) {
        return res.status(409).json({ error: `Illegal status change: ${currentStatus} → ${target || '(empty)'}.` });
      }
      const requiredRole = allowed[target];
      if (requiredRole && role !== requiredRole) {
        return res.status(403).json({ error: `Only a ${requiredRole.replace('_', ' ').toLowerCase()} may perform this action.` });
      }
    }

    const result = await pool.query(
      'UPDATE manufacturing_jobs SET status=$1, history=$2, updated_at=NOW() WHERE id=$3 RETURNING *',
      [status, JSON.stringify(history || []), req.params.id]
    );
    const job = result.rows[0];
    res.json(job);

    // ── Approval-workflow notifications (sent after responding) ──────────────
    // The last history entry carries the action: request | approve | reject.
    try {
      const storeId = job && (job.store_id || job.storeId);
      const last = Array.isArray(history) && history.length ? history[history.length - 1] : null;
      const action = last && last.action;
      if (storeId && action) {
        let pName = 'A patient';
        try {
          const pr = await pool.query('SELECT name FROM patients WHERE id=$1', [job.patient_id]);
          if (pr.rows[0] && pr.rows[0].name) pName = pr.rows[0].name;
        } catch(e) { /* ignore */ }
        const s = (status || '').toUpperCase();
        const nice = s === 'PROCESSING' ? 'Processing'
                   : s === 'DISPATCHED' ? 'Dispatched'
                   : s.charAt(0) + s.slice(1).toLowerCase();
        if (action === 'request') {
          // Manager submitted a request → alert the store's approver(s).
          notifyStore(storeId,
            '🟠 Approval Needed',
            `${pName} is awaiting your sign-off (${s === 'PENDING_DISPATCH' ? 'Dispatch' : 'Processing'}).`,
            '/store', ['STORE_APPROVER']).catch(() => {});
        } else if (action === 'approve') {
          // Approver approved → tell the store's manager(s).
          notifyStore(storeId,
            '✅ Request Approved',
            `${pName} moved to ${nice}.`,
            '/store', ['STORE']).catch(() => {});
        } else if (action === 'reject') {
          // Approver rejected → tell the store's manager(s).
          notifyStore(storeId,
            '🔴 Request Rejected',
            `${pName} was reverted to ${nice}.`,
            '/store', ['STORE']).catch(() => {});
        }
      }
    } catch(e) { console.warn('job notify:', e.message); }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Manufacturing Jobs: Assign batch number + manufacturing/expiry dates (for labels).
// Batch no is a per-store running sequence, assigned once and reused on reprints.
// Exp date = mfg date + 18 months.
app.post('/api/manufacturing-jobs/:id/batch', authenticateToken, async (req, res) => {
  const role = req.user && req.user.role;
  if (!['STORE', 'STORE_APPROVER', 'ADMIN', 'SUPER_ADMIN'].includes(role)) {
    return res.status(403).json({ error: 'Not permitted' });
  }
  const { mfgDate } = req.body;
  if (!mfgDate || !/^\d{4}-\d{2}-\d{2}$/.test(mfgDate)) {
    return res.status(400).json({ error: 'A valid manufacturing date (YYYY-MM-DD) is required.' });
  }
  try {
    const cur = await pool.query('SELECT store_id, batch_no FROM manufacturing_jobs WHERE id=$1', [req.params.id]);
    if (!cur.rows.length) return res.status(404).json({ error: 'Job not found' });
    const storeId = cur.rows[0].store_id;
    let batchNo = cur.rows[0].batch_no;

    // Assign a per-store sequential batch number on first print.
    if (!batchNo) {
      const cnt = await pool.query(
        'SELECT COUNT(*)::int AS n FROM manufacturing_jobs WHERE store_id=$1 AND batch_no IS NOT NULL',
        [storeId]
      );
      const seq = (cnt.rows[0].n || 0) + 1;
      batchNo = 'B' + String(seq).padStart(5, '0');
    }

    // Exp date = mfg + 18 months
    const d = new Date(mfgDate + 'T00:00:00Z');
    const exp = new Date(d);
    exp.setUTCMonth(exp.getUTCMonth() + 18);
    const expDate = exp.toISOString().slice(0, 10);

    const upd = await pool.query(
      'UPDATE manufacturing_jobs SET batch_no=$1, mfg_date=$2, exp_date=$3, updated_at=NOW() WHERE id=$4 RETURNING *',
      [batchNo, mfgDate, expDate, req.params.id]
    );
    res.json(upd.rows[0]);
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
- The renal protein cap of 0.8 g/kg applies when creatinine > 1.3 mg/dL OR urea ≥ 50 mmol/L (KDIGO guideline + renal function indicator). If the engine has already applied this cap, DO NOT override it — respect it as a non-negotiable safety ceiling.
- If creatinine ≤ 1.3 AND urea < 50: no renal cap. For cachexia OR sarcopenia patients in this case: minimum protein is 1.6 g/kg.
- For patients with BOTH (cachexia OR sarcopenia) AND (immunotherapy checkpoint inhibitor — pembrolizumab, nivolumab, atezolizumab, durvalumab — OR platinum agents) AND creatinine ≤ 1.3 AND urea < 50: minimum protein is 1.6 g/kg due to combined immunometabolic and anti-catabolic demand.
- If totalDailyProtein is below plan.calcWeight × 1.4 g/kg AND creatinine ≤ 1.3 AND urea < 50 AND cachexia or sarcopenia present: generate HIGH alert "PROTEIN_CRITICAL_UNDERDOSE", set isOverpowered:true, correctedPrescription.dailyProtein = plan.calcWeight × 1.6.
- If totalDailyProtein is below plan.calcWeight × 1.5 g/kg AND patient has BOTH (cachexia or sarcopenia) AND (immunotherapy or platinum) AND creatinine ≤ 1.3 AND urea < 50: generate HIGH alert "PROTEIN_UNDERDOSE_IMMUNOTHERAPY", set isOverpowered:true, correctedPrescription.dailyProtein = plan.calcWeight × 1.6. State that 1.6 g/kg is the minimum for this immunometabolic profile and that underdosing accelerates muscle catabolism, worsens sarcopenia, and increases chemotherapy toxicity risk.
- CRITICAL: Never raise protein above 0.8 g/kg when creatinine > 1.3 OR urea ≥ 50 — doing so risks accelerating renal failure in an oncology patient.

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

// Push subscription table + load existing subs into memory
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        user_id TEXT PRIMARY KEY,
        subscription JSONB NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    const rows = await pool.query('SELECT user_id, subscription FROM push_subscriptions');
    rows.rows.forEach(r => { _pushSubs[r.user_id] = r.subscription; });
    console.log(`Push: loaded ${rows.rows.length} subscription(s)`);
  } catch(e) { console.warn('push_subscriptions init:', e.message); }
})();

// Create tables on startup if they don't exist
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS monitoring_logs (
        id SERIAL PRIMARY KEY,
        patient_id TEXT NOT NULL,
        type VARCHAR(10) NOT NULL,
        recorded_at TIMESTAMP DEFAULT NOW(),
        recorded_by TEXT,
        data JSONB NOT NULL
      )
    `);
    // Patient ids are strings (e.g. 'pat_…'); coerce any legacy INTEGER columns from
    // an earlier migration to TEXT so monitoring saves don't fail on string ids.
    await pool.query(`ALTER TABLE monitoring_logs ALTER COLUMN patient_id TYPE TEXT USING patient_id::text`).catch(() => {});
    await pool.query(`ALTER TABLE monitoring_logs ALTER COLUMN recorded_by TYPE TEXT USING recorded_by::text`).catch(() => {});
  } catch(e) { console.error('monitoring_logs migration:', e.message); }
})();

// Migration: add FSSAI licence number + address to stores
(async () => {
  try {
    await pool.query('ALTER TABLE stores ADD COLUMN IF NOT EXISTS fssai_number VARCHAR(20)');
    await pool.query('ALTER TABLE stores ADD COLUMN IF NOT EXISTS address TEXT');
  } catch(e) { console.error('stores fssai_number/address migration:', e.message); }
})();

// Migration: ensure manufacturing_jobs table exists (production queue / approvals)
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS manufacturing_jobs (
        id TEXT PRIMARY KEY,
        patient_id TEXT,
        store_id TEXT,
        doctor_id TEXT,
        status TEXT DEFAULT 'APPROVED',
        history JSONB DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    // Label fields
    await pool.query('ALTER TABLE manufacturing_jobs ADD COLUMN IF NOT EXISTS batch_no TEXT');
    await pool.query('ALTER TABLE manufacturing_jobs ADD COLUMN IF NOT EXISTS mfg_date DATE');
    await pool.query('ALTER TABLE manufacturing_jobs ADD COLUMN IF NOT EXISTS exp_date DATE');
    const bf = await reconcileJobs();
    if (bf.created) console.log('manufacturing_jobs backfill: created ' + bf.created + ' job(s) for approved patients.');
  } catch(e) { console.error('manufacturing_jobs migration:', e.message); }
})();

// Weekly prescriptions table
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS weekly_prescriptions (
        id                  SERIAL PRIMARY KEY,
        patient_id          TEXT NOT NULL,
        week_number         INT  NOT NULL,
        monitoring_log_id   INT,
        batch_code          TEXT UNIQUE,
        clinical_params     JSONB,
        targets             JSONB,
        baseline_snapshot   JSONB,
        notes               TEXT,
        status              TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
        created_by          TEXT,
        approved_by         TEXT,
        approved_at         TIMESTAMPTZ,
        created_at          TIMESTAMPTZ DEFAULT NOW(),
        updated_at          TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(patient_id, week_number)
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_weekly_rx_patient ON weekly_prescriptions(patient_id)');
    console.log('weekly_prescriptions table ready');
  } catch(e) { console.error('weekly_prescriptions migration:', e.message); }
})();

// Clinical Trials module — enrollment records + pilot settings
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS trial_enrollments (
        patient_id       TEXT PRIMARY KEY,
        study_id         TEXT UNIQUE NOT NULL,
        enrollment_date  DATE NOT NULL,
        cohort           TEXT DEFAULT 'PILOT-1',
        withdrawn_at     TIMESTAMPTZ,
        withdrawn_reason TEXT,
        created_at       TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_trial_enrollments_study ON trial_enrollments(study_id)');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pilot_settings (
        id                  INT PRIMARY KEY DEFAULT 1,
        target_patients     INT DEFAULT 30,
        pilot_weeks         INT DEFAULT 6,
        lost_threshold_days INT DEFAULT 14,
        CHECK (id = 1)
      )
    `);
    await pool.query(`INSERT INTO pilot_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING`);
  } catch(e) { console.error('clinical trials migration:', e.message); }
})();

// Hospitals as a real entity — normalizes the free-text hospital names on users/stores.
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hospitals (
        id         TEXT PRIMARY KEY,
        name       TEXT UNIQUE NOT NULL,
        city       TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query('ALTER TABLE users  ADD COLUMN IF NOT EXISTS hospital_id TEXT');
    await pool.query('ALTER TABLE stores ADD COLUMN IF NOT EXISTS hospital_id TEXT');

    // One-time backfill: create a hospital per distinct typed name and link users/stores.
    const names = await pool.query(`
      SELECT DISTINCT TRIM(hospital_name) AS nm FROM users  WHERE hospital_name IS NOT NULL AND TRIM(hospital_name) <> ''
      UNION
      SELECT DISTINCT TRIM(hospital)      AS nm FROM stores WHERE hospital      IS NOT NULL AND TRIM(hospital)      <> ''
    `);
    for (const row of names.rows) {
      const nm = row.nm;
      let hid;
      const ex = await pool.query('SELECT id FROM hospitals WHERE LOWER(name)=LOWER($1) LIMIT 1', [nm]);
      if (ex.rows[0]) hid = ex.rows[0].id;
      else {
        hid = 'hosp_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
        await pool.query('INSERT INTO hospitals (id, name) VALUES ($1,$2) ON CONFLICT (name) DO NOTHING', [hid, nm]);
        const r2 = await pool.query('SELECT id FROM hospitals WHERE LOWER(name)=LOWER($1) LIMIT 1', [nm]);
        hid = r2.rows[0] ? r2.rows[0].id : hid;
      }
      await pool.query('UPDATE users  SET hospital_id=$1 WHERE hospital_id IS NULL AND LOWER(TRIM(hospital_name))=LOWER($2)', [hid, nm]);
      await pool.query('UPDATE stores SET hospital_id=$1 WHERE hospital_id IS NULL AND LOWER(TRIM(hospital))=LOWER($2)', [hid, nm]);
    }
  } catch(e) { console.error('hospitals migration:', e.message); }
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
        { id:'urea_high',                 category:'safety_labs',  name:'urea_high',                 description:'Urea at or above this value contributes to renal issue flag (alongside creatinine)',             value:'45',   unit:'mg/dL',        source:'Clinical' },
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
      await pool.query(`UPDATE engine_formulas SET value = '45', unit = 'mg/dL' WHERE id = 'urea_high'`);

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
  '/admin/trials':     'admin-trials.html',
  '/admin/trials/journey':  'admin-trial-journey.html',
  '/admin/trials/patient':  'admin-trial-patient.html',
  '/admin/trials/cohort': 'admin-trial-cohort.html',
  '/admin/trials/outcomes': 'admin-trial-outcomes.html',
  '/admin/trials/formula': 'admin-trial-formula.html',
  '/admin/trials/impact':  'admin-trial-impact.html',
  '/admin/trials/export': 'admin-trial-export.html',
  '/admin/reports':    'admin-reports.html',
  '/admin/rules':      'admin-rules.html',
  '/coordinator':      'coordinator.html',
};
const _noCacheHtml = (res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
};
Object.entries(cleanRoutes).forEach(([route, file]) => {
  app.get(route, (req, res) => { _noCacheHtml(res); res.sendFile(path.join(__dirname, '..', file)); });
});
// Root → login page
app.get('/', (req, res) => { _noCacheHtml(res); res.sendFile(path.join(__dirname, '..', 'index.html')); });

// Seed SUPER_ADMIN into DB on startup if not present
async function seedSuperAdmin() {
  try {
    // Remove old admin@onvilox.com if it exists
    await pool.query("DELETE FROM users WHERE email = $1 AND role = 'SUPER_ADMIN'", ['admin@onvilox.com']);

    const hash = await bcrypt.hash('admin2026', 10);
    await pool.query(
      `INSERT INTO users (id, name, email, password_hash, role, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (id) DO UPDATE SET email=$3, password_hash=$4, role=$5`,
      ['superadmin_001', 'System Admin', 'admin@gquence.in', hash, 'SUPER_ADMIN']
    );
    console.log('SUPER_ADMIN ensured: admin@gquence.in');
  } catch(e) {
    console.warn('seedSuperAdmin error:', e.message);
  }
}

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  await seedSuperAdmin();
});
