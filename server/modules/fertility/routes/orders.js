const express = require('express');

function ordersRoutes(svc) {
  const r = express.Router();
  const h = fn => async (req, res) => {
    try { await fn(req, res); } catch (e) { if (!e.status) console.error('fertility orders API:', e); res.status(e.status || 500).json({ error: e.message }); }
  };
  const b = req => req.body || {};
  r.get('/orders', h(async (req, res) => res.json(await svc.list(req.user, req.module, req.access))));
  r.get('/orders/default-markup', h(async (req, res) => res.json({ pct: await svc.defaultMarkup() })));
  r.get('/cases/:id/orders', h(async (req, res) => res.json(await svc.forCase(req.user, req.module, req.params.id))));
  r.post('/orders/:oid/status', h(async (req, res) => { await svc.setStatus(req.user, req.module, req.access, req.params.oid, b(req).status); res.json({ ok: true }); }));
  r.post('/orders/:oid/store-price', h(async (req, res) => { await svc.storePrice(req.user, req.module, req.access, req.params.oid, b(req).price); res.json({ ok: true }); }));
  r.post('/orders/:oid/markup', h(async (req, res) => { await svc.markup(req.user, req.module, req.params.oid, b(req).markupPct); res.json({ ok: true }); }));
  r.post('/orders/:oid/doctor-price', h(async (req, res) => { await svc.doctorPrice(req.user, req.module, req.params.oid, b(req).finalPrice); res.json({ ok: true }); }));
  r.post('/orders/:oid/send-back', h(async (req, res) => { await svc.sendBack(req.user, req.module, req.params.oid, b(req).note); res.json({ ok: true }); }));
  r.post('/orders/:oid/batch', h(async (req, res) => res.json(await svc.batch(req.user, req.module, req.access, req.params.oid, b(req).mfgDate))));
  r.get('/orders/:oid/label', h(async (req, res) => res.json(await svc.label(req.user, req.module, req.access, req.params.oid))));
  return r;
}

module.exports = { ordersRoutes };
