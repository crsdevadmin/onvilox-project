// Fertility module — server entry point.
//
//   assessment/  data dictionary (fields.js) + validation — drives the web forms
//   repo/        SQL only
//   services/    business logic and who-may-do-what
//   routes/      thin HTTP handlers
//   schema.js    this module's tables (fx_*)
//   engine/      facts + condition evaluator + runEngine (decision support; no formulas yet)
//   rules/       seed.json — the rule catalogue as data; admins edit rules in the app
//
// Every route is behind requireModule('fertility'): no module grant → 403.
const express = require('express');
const { requireModule } = require('../../core/access/middleware');
const { ensureFertilitySchema } = require('./schema');
const { casesRepo } = require('./repo/cases');
const { casesService } = require('./services/cases');
const { casesRoutes } = require('./routes/cases');
const { rulesRepo } = require('./repo/rules');
const { rulesService } = require('./services/rules');
const { rulesRoutes } = require('./routes/rules');

const code = 'fertility';

function mount(app, { pool, access, authenticateToken }) {
  const svc = casesService(casesRepo(pool));
  const rules = rulesService(rulesRepo(pool), svc);
  ensureFertilitySchema(pool).then(() => rules.seed())
    .catch(e => console.error('fertility migration:', e.message));

  const r = express.Router();
  r.use(authenticateToken, requireModule(access, code));

  // Store home. Orders arrive with weekly formulations (next release).
  r.get('/home', (req, res) => res.json({ module: req.module, orders: [] }));

  r.use(casesRoutes(svc));
  r.use(rulesRoutes(rules));
  app.use('/api/fertility', r);
}

module.exports = { code, mount };
