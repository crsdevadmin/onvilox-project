// Platform bootstrap — shared core + clinical modules.
//
// server/index.js (legacy Oncology) calls registerPlatform() once, right after
// authenticateToken is defined and BEFORE its own routes, so the Oncology
// guard sits in front of every legacy endpoint.
const path = require('path');
const express = require('express');
const { ensureAccessSchema } = require('./core/access/schema');
const { createAccessService } = require('./core/access/service');
const { oncoGuard } = require('./core/access/middleware');
const { accessRoutes } = require('./core/access/routes');

const MODULE_SERVERS = [require('./modules/fertility')];

function registerPlatform(app, { pool, authenticateToken }) {
  const access = createAccessService(pool);
  const ready = ensureAccessSchema(pool).catch(e => console.error('module access migration:', e.message));

  app.use('/api', oncoGuard(access));
  app.use('/api/access', accessRoutes({ access, authenticateToken }));
  for (const m of MODULE_SERVERS) m.mount(app, { pool, access, authenticateToken });

  // The modular web shell (web/ → built into app-dist/) lives under /app.
  // Any /app/* path returns its index.html so client-side routes deep-link.
  const dist = path.join(__dirname, '..', 'app-dist');
  const noCache = res => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  };
  app.use('/app', express.static(dist, {
    index: false,
    setHeaders: (res, f) => { if (/\.html$/i.test(f)) noCache(res);
      else res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=120, must-revalidate'); },
  }));
  app.get(['/app', '/app/*'], (req, res) => {
    noCache(res);
    res.sendFile(path.join(dist, 'index.html'), err => {
      if (err) res.status(503).send('The module shell has not been built yet (cd web && npm run build).');
    });
  });

  return { access, ready };
}

module.exports = { registerPlatform };
