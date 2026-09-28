// Module-access service — the only code that reads or writes the access tables.
const { effectiveModules, landingRoute, validateGrant } = require('./logic');
const { MODULES, getModule } = require('../../modules/registry');

const CACHE_MS = 30000; // other server instances see a change within 30 s

function createAccessService(pool) {
  const cache = new Map(); // userId -> { at, value }

  async function load(userId) {
    const u = (await pool.query('SELECT id, name, role, store_id FROM users WHERE id=$1', [userId])).rows[0];
    if (!u) return null;
    const grants = (await pool.query(
      'SELECT module_code, role, revoked_at FROM user_module_access WHERE user_id=$1', [userId])).rows;
    const storeMods = u.store_id ? (await pool.query(
      'SELECT module_code, enabled FROM store_modules WHERE store_id=$1', [u.store_id])).rows : [];
    const user = { id: u.id, name: u.name, role: u.role, storeId: u.store_id || null };
    const modules = effectiveModules(user, grants, storeMods);
    return { user, modules, landing: landingRoute(user, modules) };
  }

  async function forUser(userId, { fresh = false } = {}) {
    const hit = cache.get(userId);
    if (!fresh && hit && Date.now() - hit.at < CACHE_MS) return hit.value;
    const value = await load(userId);
    cache.set(userId, { at: Date.now(), value });
    return value;
  }

  const invalidate = userId => (userId ? cache.delete(userId) : cache.clear());

  async function hasModule(userId, code) {
    const a = await forUser(userId);
    return !!(a && a.modules.find(m => m.code === code));
  }

  async function audit(actorId, action, targetType, targetId, moduleCode, before, after) {
    await pool.query(
      `INSERT INTO access_audit (actor_id, action, target_type, target_id, module_code, before, after)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [actorId, action, targetType, targetId, moduleCode,
       before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null]);
  }

  // Everything the admin grid needs in one call.
  async function matrix() {
    const users = (await pool.query(
      `SELECT id, name, email, role, store_id, hospital_name FROM users
        WHERE role NOT IN ('ADMIN','SUPER_ADMIN') ORDER BY name`)).rows;
    const grants = (await pool.query(
      'SELECT user_id, module_code, role, granted_at, revoked_at FROM user_module_access')).rows;
    let stores = [];
    try { stores = (await pool.query('SELECT id, name, hospital FROM stores ORDER BY name')).rows; } catch (e) {}
    const storeMods = (await pool.query('SELECT store_id, module_code, enabled FROM store_modules')).rows;
    return {
      modules: MODULES.map(m => ({ code: m.code, name: m.name, roles: m.roles, roleFromUser: m.roleFromUser, defaultOn: m.defaultOn })),
      users: users.map(u => {
        const g = grants.filter(x => x.user_id === u.id);
        const sm = u.store_id ? storeMods.filter(x => x.store_id === u.store_id) : [];
        const eff = effectiveModules({ id: u.id, role: u.role, storeId: u.store_id }, g, sm);
        return {
          id: u.id, name: u.name, email: u.email, role: u.role, storeId: u.store_id, hospital: u.hospital_name,
          grants: Object.fromEntries(MODULES.map(m => {
            const row = g.find(x => x.module_code === m.code);
            const on = row ? !row.revoked_at : m.defaultOn;
            return [m.code, { on, role: m.roleFromUser ? u.role : (row && row.role) || null,
                              effective: !!eff.find(e => e.code === m.code) }];
          })),
        };
      }),
      stores: stores.map(s => ({
        id: s.id, name: s.name, hospital: s.hospital,
        modules: Object.fromEntries(MODULES.map(m => {
          const row = storeMods.find(x => x.store_id === s.id && x.module_code === m.code);
          return [m.code, row ? !!row.enabled : m.defaultOn];
        })),
      })),
    };
  }

  async function setUserModule(actorId, userId, code, { enabled, role }) {
    const target = (await pool.query('SELECT id, role, store_id FROM users WHERE id=$1', [userId])).rows[0];
    const err = validateGrant(code, role, target, enabled);
    if (err) { const e = new Error(err); e.status = 400; throw e; }
    const m = getModule(code);
    const before = (await pool.query(
      'SELECT role, revoked_at FROM user_module_access WHERE user_id=$1 AND module_code=$2', [userId, code])).rows[0] || null;
    const newRole = m.roleFromUser ? target.role : (role || (before && before.role) || target.role);
    if (enabled) {
      await pool.query(
        `INSERT INTO user_module_access (user_id, module_code, role, granted_by, granted_at, revoked_at, revoked_by)
         VALUES ($1,$2,$3,$4,NOW(),NULL,NULL)
         ON CONFLICT (user_id, module_code) DO UPDATE
           SET role=$3, granted_by=$4, granted_at=NOW(), revoked_at=NULL, revoked_by=NULL`,
        [userId, code, newRole, actorId]);
    } else {
      await pool.query(
        `INSERT INTO user_module_access (user_id, module_code, role, granted_by, revoked_at, revoked_by)
         VALUES ($1,$2,$3,$4,NOW(),$4)
         ON CONFLICT (user_id, module_code) DO UPDATE SET revoked_at=NOW(), revoked_by=$4`,
        [userId, code, newRole, actorId]);
    }
    await audit(actorId, enabled ? 'GRANT' : 'REVOKE', 'user', userId, code, before, { enabled, role: newRole });
    invalidate(userId);
  }

  async function setStoreModule(actorId, storeId, code, enabled) {
    if (!getModule(code)) { const e = new Error('Unknown module: ' + code); e.status = 400; throw e; }
    const before = (await pool.query(
      'SELECT enabled FROM store_modules WHERE store_id=$1 AND module_code=$2', [storeId, code])).rows[0] || null;
    await pool.query(
      `INSERT INTO store_modules (store_id, module_code, enabled, updated_by, updated_at)
       VALUES ($1,$2,$3,$4,NOW())
       ON CONFLICT (store_id, module_code) DO UPDATE SET enabled=$3, updated_by=$4, updated_at=NOW()`,
      [storeId, code, !!enabled, actorId]);
    await audit(actorId, enabled ? 'STORE_ENABLE' : 'STORE_DISABLE', 'store', storeId, code, before, { enabled: !!enabled });
    invalidate(); // every user of that store is affected
  }

  async function auditLog(limit = 100) {
    return (await pool.query(
      `SELECT a.*, u.name AS actor_name,
              COALESCE(tu.name, ts.name, a.target_id) AS target_name
         FROM access_audit a
         LEFT JOIN users  u  ON u.id = a.actor_id
         LEFT JOIN users  tu ON a.target_type = 'user'  AND tu.id = a.target_id
         LEFT JOIN stores ts ON a.target_type = 'store' AND ts.id = a.target_id
        ORDER BY a.at DESC LIMIT $1`, [limit])).rows;
  }

  return { forUser, hasModule, invalidate, matrix, setUserModule, setStoreModule, auditLog };
}

module.exports = { createAccessService };
