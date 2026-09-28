const express = require('express');

function formulasRoutes(svc) {
  const r = express.Router();
  const h = fn => async (req, res) => {
    try { await fn(req, res); }
    catch (e) { if (!e.status) console.error('fertility formulas API:', e); res.status(e.status || 500).json({ error: e.message, checks: e.checks }); }
  };
  r.get('/cases/:id/formulas', h(async (req, res) => res.json(await svc.list(req.user, req.module, req.params.id))));
  r.post('/cases/:id/formulas', h(async (req, res) => res.json(await svc.save(req.user, req.module, req.params.id, req.body || {}))));
  r.post('/cases/:id/formulas/:fid/approve', h(async (req, res) => res.json(await svc.approve(req.user, req.module, req.params.id, req.params.fid, req.body || {}))));
  r.post('/cases/:id/formulas/:fid/reject', h(async (req, res) => { await svc.reject(req.user, req.module, req.params.id, req.params.fid, req.body || {}); res.json({ ok: true }); }));
  r.get('/orders', h(async (req, res) => res.json(await svc.orders(req.user, req.module, req.access))));
  r.post('/orders/:oid/status', h(async (req, res) => {
    await svc.setOrderStatus(req.user, req.module, req.access, req.params.oid, (req.body || {}).status); res.json({ ok: true });
  }));
  return r;
}

module.exports = { formulasRoutes };
