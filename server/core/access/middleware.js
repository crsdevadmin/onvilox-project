// Express guards for module access. Hiding a button in the browser is not
// security — every module endpoint must pass through requireModule().
const jwt = require('jsonwebtoken');
const { isAdminRole } = require('./logic');

// requireModule(access, 'fertility')                 → any role in the module
// requireModule(access, 'fertility', ['DOCTOR'])     → only these module roles
// Must run after authenticateToken (needs req.user). Fails CLOSED.
function requireModule(access, code, roles) {
  return async (req, res, next) => {
    try {
      const a = await access.forUser(req.user && req.user.id);
      const mod = a && a.modules.find(m => m.code === code);
      if (!mod) return res.status(403).json({ error: 'No access to this module', code: 'MODULE_FORBIDDEN', module: code });
      if (roles && roles.length && !roles.includes(mod.role) && !isAdminRole(mod.role)) {
        return res.status(403).json({ error: 'Your role in this module cannot do this', code: 'MODULE_ROLE_FORBIDDEN', module: code });
      }
      req.module = mod;           // { code, name, role } — the caller's role IN this module
      req.access = a;
      next();
    } catch (e) {
      console.error('requireModule:', e.message);
      res.status(503).json({ error: 'Access check failed — try again' });
    }
  };
}

function requireAdmin(req, res, next) {
  if (!req.user || !isAdminRole(req.user.role)) return res.status(403).json({ error: 'Admin only' });
  next();
}

// Oncology still lives in server/index.js as ~100 legacy routes. Rather than
// edit each one, this single guard sits in front of them: a signed-in,
// non-admin user whose Oncology access has been revoked gets 403 on every
// legacy /api route. Shared platform routes are let through.
//
// It fails OPEN on a database error (logs and continues) — the legacy app had
// no module check before, and an access-table hiccup must not take Oncology
// down for everyone. Module routes (requireModule) fail closed.
const SHARED_API = /^\/api\/(auth|me|access|push|modules|hospitals|speech-status)(\/|$)/;
const MODULE_API = /^\/api\/(fertility)(\/|$)/;

function oncoGuard(access) {
  return async (req, res, next) => {
    const p = req.originalUrl.split('?')[0];
    if (!p.startsWith('/api/') || SHARED_API.test(p) || MODULE_API.test(p)) return next();
    const h = req.headers['authorization'] || '';
    const tok = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!tok) return next();                       // legacy auth handles missing tokens
    let u;
    try { u = jwt.verify(tok, process.env.JWT_SECRET); } catch (e) { return next(); }
    if (!u || isAdminRole(u.role)) return next();
    try {
      if (await access.hasModule(u.id, 'onco')) return next();
      return res.status(403).json({ error: 'No access to Oncology', code: 'MODULE_FORBIDDEN', module: 'onco' });
    } catch (e) {
      console.warn('oncoGuard (failing open):', e.message);
      next();
    }
  };
}

module.exports = { requireModule, requireAdmin, oncoGuard };
