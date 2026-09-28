// Module-access tables. Idempotent: safe to run on every server start.
//
//   modules              — the module catalogue (mirrors server/modules/registry.js)
//   user_module_access   — which user may use which module, and in what role.
//                          A revoke keeps the row with revoked_at set, so the
//                          startup backfill never silently re-grants it.
//   store_modules        — which modules a store serves (configurable per store)
//   access_audit         — every grant / revoke / store change, who and when
const { MODULES } = require('../../modules/registry');

async function ensureAccessSchema(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS modules (
      code       TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      active     BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS user_module_access (
      user_id     TEXT NOT NULL,
      module_code TEXT NOT NULL,
      role        TEXT NOT NULL,
      granted_by  TEXT,
      granted_at  TIMESTAMPTZ DEFAULT NOW(),
      revoked_by  TEXT,
      revoked_at  TIMESTAMPTZ,
      PRIMARY KEY (user_id, module_code))`);
  await pool.query(`CREATE TABLE IF NOT EXISTS store_modules (
      store_id    TEXT NOT NULL,
      module_code TEXT NOT NULL,
      enabled     BOOLEAN NOT NULL DEFAULT TRUE,
      updated_by  TEXT,
      updated_at  TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (store_id, module_code))`);
  await pool.query(`CREATE TABLE IF NOT EXISTS access_audit (
      id          BIGSERIAL PRIMARY KEY,
      actor_id    TEXT,
      action      TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id   TEXT NOT NULL,
      module_code TEXT,
      before      JSONB,
      after       JSONB,
      at          TIMESTAMPTZ DEFAULT NOW())`);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_uma_module ON user_module_access(module_code)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_access_audit_at ON access_audit(at DESC)');

  for (const m of MODULES) {
    await pool.query(
      `INSERT INTO modules (code, name) VALUES ($1,$2)
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name`, [m.code, m.name]);
  }

  // Backfill: make the Oncology default visible as real rows, so the admin grid
  // shows what everyone has today. ON CONFLICT DO NOTHING never overrides an
  // admin's revoke. (Users created later are still covered by defaultOn.)
  const ub = await pool.query(
    `INSERT INTO user_module_access (user_id, module_code, role, granted_by)
     SELECT id, 'onco', role, 'system-backfill' FROM users
      WHERE role NOT IN ('ADMIN','SUPER_ADMIN')
     ON CONFLICT (user_id, module_code) DO NOTHING`);
  let sb = { rowCount: 0 };
  try {
    sb = await pool.query(
      `INSERT INTO store_modules (store_id, module_code, enabled, updated_by)
       SELECT id, 'onco', TRUE, 'system-backfill' FROM stores
       ON CONFLICT (store_id, module_code) DO NOTHING`);
  } catch (e) { console.warn('store_modules backfill skipped:', e.message); }
  console.log(`module access ready (backfilled onco: ${ub.rowCount} user(s), ${sb.rowCount} store(s))`);
}

module.exports = { ensureAccessSchema };
