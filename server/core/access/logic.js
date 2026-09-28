// Pure access logic — no database, no Express. Everything here is unit-tested
// in server/core/access/logic.test.js. Keep it that way: the rules for who can
// see which module must be readable and testable in one place.

const { MODULES, STORE_ROLES, ADMIN_ROLES, getModule } = require('../../modules/registry');

const isAdminRole = role => ADMIN_ROLES.includes(role);

// user:         { id, role, storeId }
// grants:       rows from user_module_access  { module_code, role, revoked_at }
// storeModules: rows from store_modules        { module_code, enabled } for the user's store
// Returns the modules this user can actually use: [{ code, name, role }]
function effectiveModules(user, grants, storeModules) {
  if (!user) return [];
  if (isAdminRole(user.role)) {
    return MODULES.map(m => ({ code: m.code, name: m.name, role: user.role }));
  }
  const out = [];
  for (const m of MODULES) {
    const g = (grants || []).find(x => x.module_code === m.code);
    let granted;
    if (g) granted = !g.revoked_at;            // explicit grant or explicit revoke
    else granted = !!m.defaultOn;              // never touched → module default
    if (!granted) continue;

    const role = m.roleFromUser ? user.role : ((g && g.role) || user.role);
    if (!m.roles.includes(role)) continue;     // e.g. a COORDINATOR role not valid here

    if (STORE_ROLES.includes(role)) {
      if (!user.storeId) continue;             // store staff need a store
      const s = (storeModules || []).find(x => x.module_code === m.code);
      const storeOn = s ? !!s.enabled : !!m.defaultOn;
      if (!storeOn) continue;                  // their store does not serve this module
    }
    out.push({ code: m.code, name: m.name, role });
  }
  return out;
}

// Legacy Oncology landing page for a role (mirrors js/auth.js routeForRole).
function oncoHome(role) {
  if (isAdminRole(role)) return '/admin';
  if (role === 'DOCTOR' || role === 'ASSISTANT') return '/dashboard';
  if (STORE_ROLES.includes(role)) return '/store';
  if (role === 'COORDINATOR') return '/coordinator';
  return '/login';
}

function moduleHome(mod) {
  if (!mod) return '/app/no-access';
  if (mod.code === 'onco') return oncoHome(mod.role);
  const base = '/app/' + mod.code;
  return STORE_ROLES.includes(mod.role) ? base + '/store' : base;
}

// Where a user lands straight after login.
function landingRoute(user, modules) {
  if (user && isAdminRole(user.role)) return '/admin';
  if (!modules || !modules.length) return '/app/no-access';
  if (modules.length === 1) return moduleHome(modules[0]);
  return '/app/choose';
}

// Validation for an admin grant/revoke request. Returns an error string or null.
function validateGrant(code, role, targetUser, enabled) {
  const m = getModule(code);
  if (!m) return 'Unknown module: ' + code;
  if (!targetUser) return 'User not found';
  if (isAdminRole(targetUser.role)) return 'Admins already have every module';
  if (!enabled) return null;
  const r = m.roleFromUser ? targetUser.role : role;
  if (!r) return 'Pick a role for ' + m.name;
  if (!m.roles.includes(r)) return `Role ${r} is not valid in ${m.name}`;
  if (STORE_ROLES.includes(r) && !targetUser.store_id) return 'Assign this user to a store first';
  return null;
}

module.exports = { effectiveModules, landingRoute, moduleHome, oncoHome, validateGrant, isAdminRole };
