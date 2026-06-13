-- ============================================================
-- MIGRATION: Rule Engine Manager Tables + Engine Formula Seed
-- Run this once against your RDS PostgreSQL database.
-- Safe to re-run: all statements use IF NOT EXISTS / ON CONFLICT DO NOTHING.
-- ============================================================

-- 5. AI Corrections table
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
);

-- 6. Engine Rules table
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
);

-- 7. Engine Formulas table
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
);

-- ── Seed engine_formulas with all clinical constants from the JS engine ──────
-- ON CONFLICT DO NOTHING: safe to re-run; never overwrites admin edits.

-- Calorie Targets
INSERT INTO engine_formulas (id, category, name, description, value, unit, source) VALUES
('kcal_stable',              'calories', 'kcal_stable',              'Calorie target — Stable, no cachexia or significant risk',                                       '25',   'kcal/kg',       'ESPEN Oncology 2021'),
('kcal_moderate_risk',       'calories', 'kcal_moderate_risk',       'Calorie target — Moderate risk (WL ≥5%, ECOG ≥2, Age ≥70)',                                      '30',   'kcal/kg',       'ESPEN Oncology 2021'),
('kcal_cachexia',            'calories', 'kcal_cachexia',            'Calorie target — Cachexia/Severe (albumin <3.5, WL ≥10%, BMI <18.5, CRP >10, sarcopenia)',        '35',   'kcal/kg',       'ESPEN Oncology 2021'),
('kcal_active_chemo_min',    'calories', 'kcal_active_chemo_min',    'Minimum calorie floor for any active chemotherapy regimen (stable patients)',                      '28',   'kcal/kg',       'ESPEN Oncology 2021'),
('kcal_appetite_loss_floor', 'calories', 'kcal_appetite_loss_floor', 'Calorie floor when appetite loss side effect is present',                                          '32',   'kcal/kg',       'Clinical')
ON CONFLICT (id) DO NOTHING;

-- Protein Targets
INSERT INTO engine_formulas (id, category, name, description, value, unit, source) VALUES
('protein_baseline',        'protein', 'protein_baseline',        'Protein target — Baseline stable (no cachexia/moderate risk)',                                         '1.4',  'g/kg',  'ESPEN Oncology 2021'),
('protein_cachexia',        'protein', 'protein_cachexia',        'Protein target — Cachexia or moderate risk',                                                           '1.8',  'g/kg',  'ESPEN Oncology 2021'),
('protein_renal',           'protein', 'protein_renal',           'Protein cap — Renal disease/impairment (KDIGO strict limit, highest priority safety rule)',             '0.8',  'g/kg',  'KDIGO 2012'),
('protein_elderly_min',     'protein', 'protein_elderly_min',     'Protein floor — Elderly patients (Age ≥70)',                                                           '1.5',  'g/kg',  'ESPEN Geriatric 2018'),
('protein_high_catabolism', 'protein', 'protein_high_catabolism', 'Protein target — High catabolism (Platinum/FOLFIRINOX/immunotherapy + cachexia or sarcopenia)',        '2.0',  'g/kg',  'ESPEN Oncology 2021')
ON CONFLICT (id) DO NOTHING;

-- Ideal Body Weight — Devine Formula
INSERT INTO engine_formulas (id, category, name, description, value, unit, source) VALUES
('ibw_base_male',         'weight', 'ibw_base_male',         'IBW base weight for males at exactly 5 ft — Devine Formula',                               '50',   'kg',        'Devine 1974'),
('ibw_base_female',       'weight', 'ibw_base_female',       'IBW base weight for females at exactly 5 ft — Devine Formula',                             '45.5', 'kg',        'Devine 1974'),
('ibw_per_inch',          'weight', 'ibw_per_inch',          'IBW increment per inch of height above 5 ft (both sexes) — Devine Formula',                 '2.3',  'kg/inch',   'Devine 1974'),
('adjbw_factor',          'weight', 'adjbw_factor',          'AdjBW factor: fraction of (Actual − IBW) added to IBW when BMI ≥30',                       '0.25', 'fraction',  'ASPEN'),
('bmi_obesity_threshold', 'weight', 'bmi_obesity_threshold', 'BMI at or above this triggers AdjBW instead of Actual Body Weight for calorie calculation', '30',   'kg/m²',     'ESPEN/ASPEN')
ON CONFLICT (id) DO NOTHING;

-- Risk Scoring Thresholds
INSERT INTO engine_formulas (id, category, name, description, value, unit, source) VALUES
('albumin_low_threshold',      'risk_scoring', 'albumin_low_threshold',      'Albumin below this adds +2 to nutrition risk score',                            '3.5',  'g/dL',  'GLIM Criteria 2019'),
('albumin_critical_threshold', 'risk_scoring', 'albumin_critical_threshold', 'Albumin below this is a compound malnutrition factor',                          '3.0',  'g/dL',  'Clinical'),
('weight_loss_high',           'risk_scoring', 'weight_loss_high',           'Weight loss at or above this adds +2 to risk score (cachexia trigger)',          '10',   '%',     'GLIM/MUST'),
('weight_loss_moderate',       'risk_scoring', 'weight_loss_moderate',       'Weight loss at or above this adds +1 to risk score (moderate risk trigger)',     '5',    '%',     'GLIM/MUST'),
('bmi_low_threshold',          'risk_scoring', 'bmi_low_threshold',          'BMI below this adds +2 to risk score and triggers cachexia classification',      '18.5', 'kg/m²', 'MUST Score'),
('bmi_must_moderate',          'risk_scoring', 'bmi_must_moderate',          'BMI at or below this adds +1 to MUST score (moderate risk)',                     '20',   'kg/m²', 'MUST Score'),
('ecog_moderate_threshold',    'risk_scoring', 'ecog_moderate_threshold',    'ECOG at or above this triggers moderate risk classification (+1 risk score)',     '2',    'ECOG',  'ESPEN'),
('age_elderly_threshold',      'risk_scoring', 'age_elderly_threshold',      'Age at or above this triggers moderate risk classification',                     '70',   'years', 'ESPEN Geriatric 2018'),
('risk_score_moderate',        'risk_scoring', 'risk_score_moderate',        'Total risk score at or above this = Moderate nutrition risk',                    '2',    'score', 'Clinical'),
('risk_score_high',            'risk_scoring', 'risk_score_high',            'Total risk score at or above this = High nutrition risk',                        '4',    'score', 'Clinical')
ON CONFLICT (id) DO NOTHING;

-- Sarcopenia Thresholds
INSERT INTO engine_formulas (id, category, name, description, value, unit, source) VALUES
('smi_l3_male',    'sarcopenia', 'smi_l3_male',    'L3-SMI sarcopenia threshold for males (Janssen/Martin CT method)',                 '55',   'cm²/m²', 'Janssen 2004 / Martin 2013'),
('smi_l3_female',  'sarcopenia', 'smi_l3_female',  'L3-SMI sarcopenia threshold for females (Janssen/Martin CT method)',               '38.5', 'cm²/m²', 'Janssen 2004 / Martin 2013'),
('asmi_male',      'sarcopenia', 'asmi_male',       'Appendicular SMI sarcopenia threshold for males (EWGSOP2 DXA/BIA method)',         '7.0',  'kg/m²',  'EWGSOP2 2019'),
('asmi_female',    'sarcopenia', 'asmi_female',     'Appendicular SMI sarcopenia threshold for females (EWGSOP2 DXA/BIA method)',       '5.7',  'kg/m²',  'EWGSOP2 2019'),
('grip_male',      'sarcopenia', 'grip_male',       'Hand grip strength sarcopenia threshold for males',                                '26',   'kg',     'EWGSOP2 2019'),
('grip_female',    'sarcopenia', 'grip_female',     'Hand grip strength sarcopenia threshold for females',                              '18',   'kg',     'EWGSOP2 2019')
ON CONFLICT (id) DO NOTHING;

-- Safety Lab Thresholds
INSERT INTO engine_formulas (id, category, name, description, value, unit, source) VALUES
('creatinine_renal_danger',   'safety_labs', 'creatinine_renal_danger',   'Creatinine above this triggers KDIGO renal protocol — protein capped to 0.8 g/kg',      '1.3',  'mg/dL',  'KDIGO 2012'),
('creatinine_cisplatin_warn', 'safety_labs', 'creatinine_cisplatin_warn', 'Creatinine at this level on Cisplatin triggers nephrotoxicity warning',                  '1.2',  'mg/dL',  'Clinical'),
('creatinine_low',            'safety_labs', 'creatinine_low',            'Creatinine below this flags possible muscle wasting — verify SMI/Grip',                  '0.6',  'mg/dL',  'Clinical'),
('blood_sugar_danger',        'safety_labs', 'blood_sugar_danger',        'Blood glucose above this triggers hyperglycemia danger alert',                           '180',  'mg/dL',  'ADA'),
('blood_sugar_diabetic',      'safety_labs', 'blood_sugar_diabetic',      'Blood glucose above this in a known diabetic triggers metabolic alert',                  '140',  'mg/dL',  'ADA'),
('sodium_danger',             'safety_labs', 'sodium_danger',             'Sodium below this triggers HIGH hyponatremia alert',                                     '130',  'mmol/L', 'Clinical'),
('sodium_warning',            'safety_labs', 'sodium_warning',            'Sodium below this triggers mild hyponatremia warning',                                   '135',  'mmol/L', 'Clinical'),
('potassium_high',            'safety_labs', 'potassium_high',            'Potassium above this triggers hyperkalemia protocol (K-free formula)',                   '5.0',  'mmol/L', 'Clinical'),
('potassium_danger',          'safety_labs', 'potassium_danger',          'Potassium above this is danger-level hyperkalemia',                                      '5.5',  'mmol/L', 'Clinical'),
('hemoglobin_anemia',         'safety_labs', 'hemoglobin_anemia',         'Hemoglobin below this triggers anemia protocol (iron + B12 + hold pending panel)',       '10',   'g/dL',   'WHO'),
('hemoglobin_low',            'safety_labs', 'hemoglobin_low',            'Hemoglobin below this adds +1 to nutrition risk score',                                  '12',   'g/dL',   'WHO'),
('vitd_deficiency',           'safety_labs', 'vitd_deficiency',           '25-OH Vitamin D below this triggers deficiency correction dose (4000 IU/day)',           '20',   'ng/mL',  'Endocrine Society'),
('vitd_insufficient',         'safety_labs', 'vitd_insufficient',         '25-OH Vitamin D below this is classified as insufficient (2000–4000 IU/day)',            '30',   'ng/mL',  'Endocrine Society'),
('magnesium_low',             'safety_labs', 'magnesium_low',             'Magnesium below this triggers correction protocol (200–400 mg Mg Oxide/Citrate)',        '1.7',  'mg/dL',  'Clinical'),
('tsh_high',                  'safety_labs', 'tsh_high',                  'TSH above this triggers metabolic rate flag',                                             '5.0',  'mU/L',   'Clinical'),
('prealbumin_low',            'safety_labs', 'prealbumin_low',            'Prealbumin below this is a compound malnutrition escalation factor',                     '18',   'mg/dL',  'Clinical'),
('urea_high',                 'safety_labs', 'urea_high',                 'Urea at or above this contributes to renal issue flag (alongside creatinine)',            '50',   'mmol/L', 'Clinical'),
('wbc_neutropenia',           'safety_labs', 'wbc_neutropenia',           'WBC below this triggers neutropenia food safety protocol (no live cultures, sterile formula)', '3500', '/µL', 'ESMO'),
('wbc_severe_neutropenia',    'safety_labs', 'wbc_severe_neutropenia',    'WBC below this triggers severe neutropenia danger protocol (G-CSF assessment required)', '2000', '/µL',   'ESMO'),
('alt_liver_threshold',       'safety_labs', 'alt_liver_threshold',       'ALT above this signals liver compromise — adds +2 to risk score, activates BCAA',        '50',   'IU/L',   'Clinical'),
('ast_liver_threshold',       'safety_labs', 'ast_liver_threshold',       'AST above this signals liver compromise — adds +2 to risk score, activates BCAA',        '50',   'IU/L',   'Clinical'),
('bilirubin_liver_threshold', 'safety_labs', 'bilirubin_liver_threshold', 'Bilirubin above this signals liver compromise — adds +2 to risk score',                  '1.2',  'mg/dL',  'Clinical')
ON CONFLICT (id) DO NOTHING;

-- Refeeding Syndrome (NICE CG32)
INSERT INTO engine_formulas (id, category, name, description, value, unit, source) VALUES
('rf_high_bmi',             'refeeding', 'rf_high_bmi',             'BMI below this is a NICE CG32 high-risk refeeding criterion',                           '16',   'kg/m²',  'NICE CG32'),
('rf_high_weight_loss',     'refeeding', 'rf_high_weight_loss',     'Weight loss above this is a NICE CG32 high-risk refeeding criterion',                    '15',   '%',      'NICE CG32'),
('rf_high_potassium',       'refeeding', 'rf_high_potassium',       'Potassium below this is a NICE CG32 high-risk refeeding criterion',                      '3.5',  'mmol/L', 'NICE CG32'),
('rf_high_phosphate',       'refeeding', 'rf_high_phosphate',       'Phosphate below this is a NICE CG32 high-risk refeeding criterion',                      '0.8',  'mmol/L', 'NICE CG32'),
('rf_high_magnesium',       'refeeding', 'rf_high_magnesium',       'Magnesium below this is a NICE CG32 high-risk refeeding criterion',                      '0.75', 'mmol/L', 'NICE CG32'),
('rf_high_start_kcal',      'refeeding', 'rf_high_start_kcal',      'Starting calorie dose for HIGH refeeding risk (Days 1–3)',                               '5',    'kcal/kg','NICE CG32'),
('rf_at_risk_start_kcal',   'refeeding', 'rf_at_risk_start_kcal',   'Starting calorie dose for AT RISK refeeding patients (Days 1–2)',                         '10',   'kcal/kg','NICE CG32'),
('rf_at_risk_criteria_min', 'refeeding', 'rf_at_risk_criteria_min', 'Minimum number of at-risk criteria (of 4) required to classify as refeeding at-risk',    '2',    'criteria','NICE CG32')
ON CONFLICT (id) DO NOTHING;

-- Macro Distribution
INSERT INTO engine_formulas (id, category, name, description, value, unit, source) VALUES
('carb_ratio_standard',  'macros', 'carb_ratio_standard',  'Carbohydrate share of non-protein calories — standard patients',                          '0.45', 'fraction', 'Clinical'),
('carb_ratio_diabetic',  'macros', 'carb_ratio_diabetic',  'Carbohydrate share of non-protein calories — diabetic or inflamed (CRP >5)',               '0.35', 'fraction', 'Clinical')
ON CONFLICT (id) DO NOTHING;

-- Intake / Escalation Thresholds
INSERT INTO engine_formulas (id, category, name, description, value, unit, source) VALUES
('intake_critical',         'escalation', 'intake_critical',         'Oral intake at or below this triggers immediate enteral tube escalation (danger alert)',  '30', '% oral intake', 'ESPEN'),
('intake_mandatory_en',     'escalation', 'intake_mandatory_en',     'Oral intake at or below this mandates enteral nutrition',                                 '50', '% oral intake', 'ESPEN'),
('intake_full_replacement', 'escalation', 'intake_full_replacement', 'Oral intake at or below this triggers full calorie/protein replacement prescription',     '60', '% oral intake', 'ESPEN')
ON CONFLICT (id) DO NOTHING;

-- Fluid Targets
INSERT INTO engine_formulas (id, category, name, description, value, unit, source) VALUES
('fluid_min_per_kg', 'fluid', 'fluid_min_per_kg', 'Minimum daily fluid target per kg body weight',  '30', 'ml/kg', 'ESPEN'),
('fluid_max_per_kg', 'fluid', 'fluid_max_per_kg', 'Maximum daily fluid target per kg body weight',  '35', 'ml/kg', 'ESPEN')
ON CONFLICT (id) DO NOTHING;

-- Serving Frequency
INSERT INTO engine_formulas (id, category, name, description, value, unit, source) VALUES
('servings_base',                'servings', 'servings_base',                'Default servings per day for standard prescriptions',                              '3',    'servings', 'Clinical'),
('servings_high_threshold',      'servings', 'servings_high_threshold',      'Daily calorie level at or above which servings increase to 4',                     '1800', 'kcal',     'Clinical'),
('servings_high_count',          'servings', 'servings_high_count',          'Servings per day when calories ≥1800 or appetite loss/nausea present',             '4',    'servings', 'Clinical'),
('servings_very_high_threshold', 'servings', 'servings_very_high_threshold', 'Daily calorie level at or above which servings increase to 5',                     '2400', 'kcal',     'Clinical'),
('servings_very_high_count',     'servings', 'servings_very_high_count',     'Servings per day when calories ≥2400',                                             '5',    'servings', 'Clinical')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- END Rule Engine Migration
-- ============================================================

-- Migration: Add full_data JSONB column to patients for complete object storage
ALTER TABLE patients ADD COLUMN IF NOT EXISTS full_data JSONB;

-- Migration: Add missing clinical columns to patients
ALTER TABLE patients ADD COLUMN IF NOT EXISTS cancer VARCHAR(255);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS regimen VARCHAR(255);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS sodium DOUBLE PRECISION;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS potassium DOUBLE PRECISION;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS urea DOUBLE PRECISION;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS hba1c DOUBLE PRECISION;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS weight_loss_percent DOUBLE PRECISION;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS reduced_food_intake DOUBLE PRECISION;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS hand_grip DOUBLE PRECISION;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS smi DOUBLE PRECISION;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS allergies TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS side_effects TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS comorbidities TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS genomic_markers TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS created_date VARCHAR(50);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS created_by_user_id VARCHAR(50);

-- Migration: Add claude_insights to nutrition_plans
ALTER TABLE nutrition_plans ADD COLUMN IF NOT EXISTS claude_insights JSONB;
ALTER TABLE nutrition_plans ADD COLUMN IF NOT EXISTS full_data JSONB;

-- Migration: Add store_id and phone to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS store_id VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(50);

-- Migration: Monitoring Logs table (Daily & Weekly forms)
CREATE TABLE IF NOT EXISTS monitoring_logs (
    id SERIAL PRIMARY KEY,
    patient_id TEXT NOT NULL,
    type TEXT NOT NULL,           -- 'daily' | 'weekly'
    recorded_by TEXT,
    recorded_at TIMESTAMPTZ DEFAULT NOW(),
    data JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_monitoring_logs_patient ON monitoring_logs(patient_id);

-- Migration: Radiation Therapy Module fields
ALTER TABLE patients ADD COLUMN IF NOT EXISTS radiation_status VARCHAR(50);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS radiation_technique VARCHAR(100);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS sub_site VARCHAR(255);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS tnm_stage VARCHAR(50);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS total_dose_gy DOUBLE PRECISION;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS fraction_size_gy DOUBLE PRECISION;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS number_of_fractions INTEGER;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS fractions_completed INTEGER;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS radiation_week INTEGER;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS concurrent_therapy VARCHAR(100);

-- Migration: Clinical Scoring fields
ALTER TABLE patients ADD COLUMN IF NOT EXISTS must_score VARCHAR(10);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS pg_sga_score INTEGER;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS sarc_f_score INTEGER;

-- Migration: Radiation Toxicity Grades (CTCAE 0-4)
ALTER TABLE patients ADD COLUMN IF NOT EXISTS tox_mucositis INTEGER DEFAULT 0;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS tox_dysphagia INTEGER DEFAULT 0;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS tox_xerostomia INTEGER DEFAULT 0;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS tox_nausea INTEGER DEFAULT 0;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS tox_diarrhea INTEGER DEFAULT 0;

-- Migration: FSSAI licence number on stores
ALTER TABLE stores ADD COLUMN IF NOT EXISTS fssai_number VARCHAR(20);

-- Migration: manufacturing_jobs (store production queue / approval workflow)
CREATE TABLE IF NOT EXISTS manufacturing_jobs (
    id TEXT PRIMARY KEY,
    patient_id TEXT,
    store_id TEXT,
    doctor_id TEXT,
    status TEXT DEFAULT 'APPROVED',
    history JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
