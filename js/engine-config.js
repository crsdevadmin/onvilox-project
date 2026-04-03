// Engine Configuration Loader — Part 3
// Fetches formula constants and active rules from the DB at page load.
// Cached in window.engineConfig for the session.
// generateNutritionPlan() reads window.engineConfig automatically.

window.engineConfig = { formulas: {}, rules: [] }; // safe fallback (uses all JS defaults)

async function loadEngineConfig() {
  try {
    const session = (typeof db !== 'undefined') ? db.getTable('session', null) : null;
    const token = session && session.token;
    if (!token) {
      console.warn('[EngineConfig] No auth token — using JS formula defaults.');
      return;
    }
    const apiBase = (typeof CONFIG !== 'undefined' && CONFIG.API_BASE_URL) ? CONFIG.API_BASE_URL : '';
    const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

    const [formulasRes, rulesRes] = await Promise.all([
      fetch(`${apiBase}/api/engine-formulas`, { headers }),
      fetch(`${apiBase}/api/engine-rules/active`, { headers })
    ]);

    if (!formulasRes.ok || !rulesRes.ok) {
      console.warn('[EngineConfig] API error — using JS formula defaults.');
      return;
    }

    const formulas = await formulasRes.json();
    const rules = await rulesRes.json();

    // Build name→value map (keyed by formula `name` field, not `id`)
    const formulaMap = {};
    (Array.isArray(formulas) ? formulas : []).forEach(f => {
      formulaMap[f.name] = f.value;
    });

    window.engineConfig = {
      formulas: formulaMap,
      rules: Array.isArray(rules) ? rules : []
    };

    console.log(`[EngineConfig] Loaded: ${Object.keys(formulaMap).length} formula constants, ${window.engineConfig.rules.length} active rules.`);
  } catch (e) {
    console.warn('[EngineConfig] Load failed — using JS formula defaults:', e.message);
    window.engineConfig = { formulas: {}, rules: [] };
  }
}
