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
const { alertsRepo } = require('./repo/alerts');
const { alertsService } = require('./services/alerts');
const { alertsRoutes } = require('./routes/alerts');
const { ingredientsRepo } = require('./repo/ingredients');
const { ingredientsService } = require('./services/ingredients');
const { ingredientsRoutes } = require('./routes/ingredients');
const { formulasRepo } = require('./repo/formulas');
const { formulasService } = require('./services/formulas');
const { formulasRoutes } = require('./routes/formulas');
const { ordersRepo } = require('./repo/orders');
const { ordersService } = require('./services/orders');
const { ordersRoutes } = require('./routes/orders');

const code = 'fertility';

function mount(app, { pool, access, authenticateToken, notify }) {
  const svc = casesService(casesRepo(pool));
  const aRepo = alertsRepo(pool);
  const alerts = alertsService(aRepo, svc, notify);
  const ingredients = ingredientsService(ingredientsRepo(pool));
  const formulas = formulasService(formulasRepo(pool), svc, ingredients, aRepo, notify);
  const orders = ordersService(ordersRepo(pool), svc, notify);
  const rules = rulesService(rulesRepo(pool), svc, alerts);
  ensureFertilitySchema(pool).then(() => rules.seed()).then(() => ingredients.seed())
    .catch(e => console.error('fertility migration:', e.message));

  const r = express.Router();
  r.use(authenticateToken, requireModule(access, code));

  // Minimal module home (store orders are at /orders).
  r.get('/home', (req, res) => res.json({ module: req.module, orders: [] }));

  r.use(casesRoutes(svc));
  r.use(rulesRoutes(rules));
  r.use(alertsRoutes(alerts));
  r.use(ingredientsRoutes(ingredients));
  r.use(formulasRoutes(formulas));
  r.use(ordersRoutes(orders));
  app.use('/api/fertility', r);
}

module.exports = { code, mount };
