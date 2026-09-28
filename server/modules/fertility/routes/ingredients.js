const express = require('express');

function ingredientsRoutes(svc) {
  const r = express.Router();
  const h = fn => async (req, res) => {
    try { await fn(req, res); } catch (e) { if (!e.status) console.error('fertility ingredients API:', e); res.status(e.status || 500).json({ error: e.message }); }
  };
  const clinical = ['DOCTOR', 'ASSISTANT', 'DIETITIAN', 'ADMIN', 'SUPER_ADMIN'];
  const need = roles => (req, res, next) => (roles.includes(req.module.role) ? next() : res.status(403).json({ error: 'Not permitted' }));

  r.get('/ingredients', need(clinical), h(async (req, res) => res.json(await svc.list())));
  r.get('/ingredients/fields', need(clinical), (req, res) => res.json(svc.sections()));
  r.get('/ingredients/:id', need(clinical), h(async (req, res) => res.json(await svc.get(req.params.id))));
  r.post('/ingredients', h(async (req, res) => res.status(201).json({ id: await svc.create(req.user, req.module, req.body || {}) })));
  r.put('/ingredients/:id', h(async (req, res) => { await svc.update(req.user, req.module, req.params.id, req.body || {}); res.json({ ok: true }); }));
  return r;
}

module.exports = { ingredientsRoutes };
