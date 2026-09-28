// /api/fertility/* HTTP handlers — parse, call the service, send JSON.
const express = require('express');
const { FEMALE, MALE, PHASES, LABS } = require('../assessment/fields');
const { CHECKIN } = require('../assessment/checkin');

function casesRoutes(svc) {
  const r = express.Router();
  const h = fn => async (req, res) => {
    try { await fn(req, res); }
    catch (e) {
      if (!e.status) console.error('fertility API:', e);
      res.status(e.status || 500).json({ error: e.status ? e.message : 'Server error: ' + e.message });
    }
  };

  r.get('/schema', (req, res) => res.json({ female: FEMALE, male: MALE, phases: PHASES, labs: LABS, checkin: CHECKIN }));

  r.get('/cases', h(async (req, res) => res.json(await svc.list(req.user, req.module))));
  r.post('/cases', h(async (req, res) => res.status(201).json({ id: await svc.create(req.user, req.module, req.body || {}) })));
  r.get('/cases/:id', h(async (req, res) => res.json(await svc.get(req.user, req.module, req.params.id))));
  r.post('/cases/:id/partners', h(async (req, res) => {
    await svc.addPartner(req.user, req.module, req.params.id, req.body || {}); res.status(201).json({ ok: true });
  }));
  r.put('/cases/:id/partners/:pid/assessment', h(async (req, res) =>
    res.json(await svc.saveAssessment(req.user, req.module, req.params.id, req.params.pid, req.body || {}))));
  r.post('/cases/:id/partners/:pid/labs', h(async (req, res) => {
    await svc.addLab(req.user, req.module, req.params.id, req.params.pid, req.body || {}); res.status(201).json({ ok: true });
  }));
  r.post('/cases/:id/phase', h(async (req, res) => {
    await svc.setPhase(req.user, req.module, req.params.id, req.body || {}); res.json({ ok: true });
  }));
  r.put('/cases/:id/dietitian', h(async (req, res) => {
    await svc.setDietitian(req.user, req.module, req.params.id, req.body || {}); res.json({ ok: true });
  }));
  r.get('/dietitians', h(async (req, res) => res.json(await svc.dietitians())));

  return r;
}

module.exports = { casesRoutes };
