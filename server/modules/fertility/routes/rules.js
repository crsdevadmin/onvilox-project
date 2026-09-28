// Rule admin + engine endpoints (under /api/fertility, module-guarded).
const express = require('express');

function rulesRoutes(svc) {
  const r = express.Router();
  const h = fn => async (req, res) => {
    try { await fn(req, res); }
    catch (e) {
      if (!e.status) console.error('fertility rules API:', e);
      res.status(e.status || 500).json({ error: e.status ? e.message : 'Server error: ' + e.message });
    }
  };
  const adminOnly = (req, res, next) =>
    (['ADMIN', 'SUPER_ADMIN'].includes(req.module.role) ? next() : res.status(403).json({ error: 'Admin only' }));

  r.get('/rules', adminOnly, h(async (req, res) => res.json(await svc.list())));
  r.get('/rules/facts', adminOnly, (req, res) => res.json(svc.facts()));
  r.get('/rules/export.csv', adminOnly, h(async (req, res) => {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="fertility-rules-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(await svc.csv());
  }));
  r.get('/rules/:id', adminOnly, h(async (req, res) => res.json(await svc.get(req.params.id))));
  r.post('/rules', adminOnly, h(async (req, res) => res.status(201).json({ id: await svc.create(req.user, req.module, req.body || {}) })));
  r.put('/rules/:id', adminOnly, h(async (req, res) => { await svc.update(req.user, req.module, req.params.id, req.body || {}); res.json({ ok: true }); }));

  r.post('/cases/:id/partners/:pid/checkins', h(async (req, res) =>
    res.status(201).json(await svc.checkin(req.user, req.module, req.params.id, req.params.pid, req.body || {}))));
  r.post('/cases/:id/engine', h(async (req, res) => res.json(await svc.run(req.user, req.module, req.params.id))));
  r.get('/cases/:id/engine', h(async (req, res) => res.json(await svc.latest(req.user, req.module, req.params.id))));
  return r;
}

module.exports = { rulesRoutes };
