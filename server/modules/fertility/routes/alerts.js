const express = require('express');

function alertsRoutes(svc) {
  const r = express.Router();
  const h = fn => async (req, res) => {
    try { await fn(req, res); } catch (e) { if (!e.status) console.error('fertility alerts API:', e); res.status(e.status || 500).json({ error: e.message }); }
  };
  r.get('/cases/:id/alerts', h(async (req, res) => res.json(await svc.list(req.user, req.module, req.params.id))));
  r.post('/cases/:id/alerts/:aid/ack', h(async (req, res) => {
    await svc.ack(req.user, req.module, req.params.id, req.params.aid, (req.body || {}).note); res.json({ ok: true });
  }));
  return r;
}

module.exports = { alertsRoutes };
