// Fertility module — server entry point.
//
// Structure this module will grow into (one concern per folder, small files):
//   routes/      thin HTTP handlers — parse input, call a service, send JSON
//   services/    business logic (cases, assessments, weekly formulations)
//   engine/      pathway → red flags → nutrition risk → phenotype → rules
//                → targets → ingredient safety → formulation (pure functions)
//   rules/       clinician-approved rule packs as versioned data (JSON)
//   repo/        SQL only
//   schema.js    this module's tables (fx_*)
//
// Every route is behind requireModule('fertility'): no module grant → 403.
const express = require('express');
const { requireModule } = require('../../core/access/middleware');

const code = 'fertility';

function mount(app, { access, authenticateToken }) {
  const r = express.Router();
  r.use(authenticateToken, requireModule(access, code));

  // Phase 0 placeholder: proves the guard and tells the shell who is asking.
  // Replaced by real case / assessment endpoints in Fertility V1-a.
  r.get('/home', (req, res) => {
    res.json({ module: req.module, cases: [], orders: [], phase: 'platform-foundation' });
  });

  app.use('/api/fertility', r);
}

module.exports = { code, mount };
