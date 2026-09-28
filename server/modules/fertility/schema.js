// Fertility module tables (fx_*). Idempotent — runs on every server start.
//
//   fx_cases          a couple (or single patient) under fertility care
//   fx_partners       the female and/or male partner of a case
//   fx_assessments    versioned assessment per partner (append-only)
//   fx_labs           lab results with unit, reference range and date (rule G-09)
//   fx_phase_events   treatment-phase timeline (F0 … F9, CLOSED)
//   fx_checkins       weekly check-ins (weight, adherence, symptoms, pregnancy test)
//   fx_alerts         urgent findings awaiting clinician acknowledgement
//   fx_ingredients    ingredient master with safety fields (+ fx_ingredient_history)
//   fx_formulas       weekly formula per partner (draft → approved)
//   fx_orders         store orders from approved formulas
//   fx_rules          clinical rules (seeded from rules/seed.json, then admin-edited)
//   fx_rule_history   every version of every rule
//   fx_engine_runs    every engine run with its full output (audit)
async function ensureFertilitySchema(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS fx_cases (
      id           TEXT PRIMARY KEY,
      doctor_id    TEXT NOT NULL,
      dietitian_id TEXT,
      phase        TEXT NOT NULL DEFAULT 'F0',
      phase_date   DATE,
      status       TEXT NOT NULL DEFAULT 'ACTIVE',
      created_by   TEXT,
      created_at   TIMESTAMPTZ DEFAULT NOW(),
      updated_at   TIMESTAMPTZ DEFAULT NOW())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS fx_partners (
      id         TEXT PRIMARY KEY,
      case_id    TEXT NOT NULL REFERENCES fx_cases(id) ON DELETE CASCADE,
      sex        CHAR(1) NOT NULL CHECK (sex IN ('F','M')),
      name       TEXT NOT NULL,
      age        INT,
      phone      TEXT,
      mrn        TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (case_id, sex))`);
  await pool.query(`CREATE TABLE IF NOT EXISTS fx_assessments (
      id          BIGSERIAL PRIMARY KEY,
      partner_id  TEXT NOT NULL REFERENCES fx_partners(id) ON DELETE CASCADE,
      version     INT NOT NULL,
      data        JSONB NOT NULL,
      missing     JSONB NOT NULL DEFAULT '[]',
      created_by  TEXT,
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (partner_id, version))`);
  await pool.query(`CREATE TABLE IF NOT EXISTS fx_labs (
      id           BIGSERIAL PRIMARY KEY,
      partner_id   TEXT NOT NULL REFERENCES fx_partners(id) ON DELETE CASCADE,
      analyte      TEXT NOT NULL,
      value        NUMERIC NOT NULL,
      unit         TEXT NOT NULL,
      ref_low      NUMERIC,
      ref_high     NUMERIC,
      collected_on DATE NOT NULL,
      source       TEXT,
      entered_by   TEXT,
      created_at   TIMESTAMPTZ DEFAULT NOW())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS fx_phase_events (
      id         BIGSERIAL PRIMARY KEY,
      case_id    TEXT NOT NULL REFERENCES fx_cases(id) ON DELETE CASCADE,
      phase      TEXT NOT NULL,
      event_date DATE NOT NULL,
      note       TEXT,
      created_by TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS fx_checkins (
      id           BIGSERIAL PRIMARY KEY,
      partner_id   TEXT NOT NULL REFERENCES fx_partners(id) ON DELETE CASCADE,
      checkin_date DATE NOT NULL,
      phase        TEXT,
      data         JSONB NOT NULL,
      created_by   TEXT,
      created_at   TIMESTAMPTZ DEFAULT NOW())`);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_fx_checkins_partner ON fx_checkins(partner_id, checkin_date DESC)');
  // Urgent findings raised by the engine, until a clinician acknowledges them.
  await pool.query(`CREATE TABLE IF NOT EXISTS fx_alerts (
      id          BIGSERIAL PRIMARY KEY,
      case_id     TEXT NOT NULL REFERENCES fx_cases(id) ON DELETE CASCADE,
      partner_id  TEXT NOT NULL,
      rule_id     TEXT NOT NULL,
      message     TEXT NOT NULL,
      run_id      BIGINT,
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      ack_by      TEXT,
      ack_at      TIMESTAMPTZ,
      ack_note    TEXT)`);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_fx_alerts_open ON fx_alerts(case_id) WHERE ack_at IS NULL');
  // Ingredient master (rule IS-01): an ingredient is usable only when every
  // safety field is filled in and it is ACTIVE.
  await pool.query(`CREATE TABLE IF NOT EXISTS fx_ingredients (
      id               TEXT PRIMARY KEY,
      name             TEXT NOT NULL,
      form             TEXT,
      category         TEXT NOT NULL DEFAULT 'OTHER',
      unit             TEXT NOT NULL,
      purpose          TEXT,
      evidence_level   TEXT,
      sources          TEXT,
      veg_ok           BOOLEAN,
      vegan_ok         BOOLEAN,
      jain_ok          BOOLEAN,
      allergens        TEXT,
      is_herbal        BOOLEAN NOT NULL DEFAULT FALSE,
      max_preconception NUMERIC,
      max_stimulation  NUMERIC,
      max_pregnancy    NUMERIC,
      upper_limit      NUMERIC,
      pregnancy_safety TEXT,
      interactions     TEXT,
      contraindications TEXT,
      renal_hepatic    TEXT,
      approval_required BOOLEAN NOT NULL DEFAULT TRUE,
      last_review      DATE,
      reviewed_by      TEXT,
      status           TEXT NOT NULL DEFAULT 'INACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
      version          INT NOT NULL DEFAULT 1,
      updated_by       TEXT,
      updated_at       TIMESTAMPTZ DEFAULT NOW())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS fx_ingredient_history (
      id BIGSERIAL PRIMARY KEY, ingredient_id TEXT NOT NULL, version INT NOT NULL, snapshot JSONB NOT NULL,
      change_note TEXT, changed_by TEXT, changed_at TIMESTAMPTZ DEFAULT NOW())`);
  // Weekly formula per partner: built by the clinician, safety-checked, approved by the doctor.
  await pool.query(`CREATE TABLE IF NOT EXISTS fx_formulas (
      id            BIGSERIAL PRIMARY KEY,
      case_id       TEXT NOT NULL REFERENCES fx_cases(id) ON DELETE CASCADE,
      partner_id    TEXT NOT NULL REFERENCES fx_partners(id) ON DELETE CASCADE,
      week_start    DATE NOT NULL,
      phase         TEXT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','APPROVED','REJECTED','SUPERSEDED')),
      items         JSONB NOT NULL DEFAULT '[]',
      notes         TEXT,
      checks        JSONB NOT NULL DEFAULT '[]',
      created_by    TEXT,
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_at    TIMESTAMPTZ DEFAULT NOW(),
      approved_by   TEXT,
      approved_at   TIMESTAMPTZ,
      decision_note TEXT)`);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_fx_formulas_partner ON fx_formulas(partner_id, week_start DESC)');
  // Store orders created from approved formulas.
  await pool.query(`CREATE TABLE IF NOT EXISTS fx_orders (
      id          BIGSERIAL PRIMARY KEY,
      formula_id  BIGINT NOT NULL REFERENCES fx_formulas(id) ON DELETE CASCADE,
      case_id     TEXT NOT NULL,
      partner_id  TEXT NOT NULL,
      store_id    TEXT,
      status      TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW','IN_PRODUCTION','READY','DISPATCHED','DELIVERED','CANCELLED')),
      label       JSONB NOT NULL,
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      updated_at  TIMESTAMPTZ DEFAULT NOW(),
      updated_by  TEXT)`);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_fx_orders_store ON fx_orders(store_id, status)');
  // Clinical rules — editable by admins at any time; every change is versioned.
  await pool.query(`CREATE TABLE IF NOT EXISTS fx_rules (
      id                TEXT PRIMARY KEY,
      area              TEXT NOT NULL,
      pathway           TEXT,
      applies_to        CHAR(1) NOT NULL DEFAULT 'B' CHECK (applies_to IN ('F','M','B')),
      rule_type         TEXT NOT NULL,
      kind              TEXT NOT NULL,
      trigger_text      TEXT NOT NULL,
      action_text       TEXT NOT NULL,
      behaviour         TEXT NOT NULL,
      evidence_level    TEXT,
      sources           TEXT,
      notes             TEXT,
      status            TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','APPROVED','RETIRED')),
      engine_mode       TEXT NOT NULL DEFAULT 'MANUAL' CHECK (engine_mode IN ('CONDITION','SYSTEM','MANUAL')),
      condition         JSONB,
      phases            JSONB NOT NULL DEFAULT '[]',
      ivf_decision      TEXT,
      diet_decision     TEXT,
      reviewer_comments TEXT,
      reviewed_by       TEXT,
      reviewed_on       DATE,
      version           INT NOT NULL DEFAULT 1,
      updated_by        TEXT,
      updated_at        TIMESTAMPTZ DEFAULT NOW())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS fx_rule_history (
      id          BIGSERIAL PRIMARY KEY,
      rule_id     TEXT NOT NULL,
      version     INT NOT NULL,
      snapshot    JSONB NOT NULL,
      change_note TEXT,
      changed_by  TEXT,
      changed_at  TIMESTAMPTZ DEFAULT NOW())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS fx_engine_runs (
      id          BIGSERIAL PRIMARY KEY,
      case_id     TEXT NOT NULL REFERENCES fx_cases(id) ON DELETE CASCADE,
      engine      TEXT NOT NULL,
      output      JSONB NOT NULL,
      run_by      TEXT,
      created_at  TIMESTAMPTZ DEFAULT NOW())`);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_fx_rule_history ON fx_rule_history(rule_id, version DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_fx_engine_runs_case ON fx_engine_runs(case_id, created_at DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_fx_cases_doctor ON fx_cases(doctor_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_fx_partners_case ON fx_partners(case_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_fx_labs_partner ON fx_labs(partner_id, collected_on DESC)');
  console.log('fertility tables ready');
}

module.exports = { ensureFertilitySchema };
