// /api/access — who can use which module.
const express = require('express');
const { requireAdmin } = require('./middleware');

function accessRoutes({ access, authenticateToken }) {
  const r = express.Router();
  r.use(authenticateToken);

  const wrap = fn => async (req, res) => {
    try { await fn(req, res); }
    catch (e) { res.status(e.status || 500).json({ error: e.message }); }
  };

  // The signed-in user's modules and landing page (used by every screen).
  r.get('/me', wrap(async (req, res) => {
    const a = await access.forUser(req.user.id, { fresh: true });
    if (!a) return res.status(404).json({ error: 'User not found' });
    res.json(a);
  }));

  r.get('/matrix', requireAdmin, wrap(async (req, res) => res.json(await access.matrix())));

  r.put('/users/:userId/modules/:code', requireAdmin, wrap(async (req, res) => {
    const { enabled, role } = req.body || {};
    await access.setUserModule(req.user.id, req.params.userId, req.params.code, { enabled: !!enabled, role });
    res.json({ ok: true });
  }));

  r.put('/stores/:storeId/modules/:code', requireAdmin, wrap(async (req, res) => {
    await access.setStoreModule(req.user.id, req.params.storeId, req.params.code, !!(req.body || {}).enabled);
    res.json({ ok: true });
  }));

  r.get('/audit', requireAdmin, wrap(async (req, res) => {
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 100));
    res.json(await access.auditLog(limit));
  }));

  return r;
}

module.exports = { accessRoutes };
