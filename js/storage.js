// Simple localStorage wrapper for Onvilox MVP
(function(global){
  const LS_PREFIX = 'onvilox_';

  function key(k){ return LS_PREFIX + k; }

  // Local copies of server data. They are only a cache — the server is the
  // source of truth — so they can be dropped to make room when storage is full.
  const CACHE_TABLES = ['patients', 'nutrition_plans', 'manufacturing_jobs', 'logic_logs',
                        'users', 'stores', 'doctor_assistant_map'];

  function readRaw(k){
    let raw = null;
    try { raw = localStorage.getItem(k); } catch (e) {}
    if (raw == null) { try { raw = sessionStorage.getItem(k); } catch (e) {} }
    return raw;
  }

  function getTable(name, fallback){
    const raw = readRaw(key(name));
    if(!raw) return fallback;
    try { return JSON.parse(raw); } catch { return fallback; }
  }

  function clearCache(except){
    CACHE_TABLES.forEach(t => {
      if (t === except) return;
      try { localStorage.removeItem(key(t)); } catch (e) {}
    });
  }

  function setTable(name, value){
    const k = key(name), v = JSON.stringify(value);
    try { localStorage.setItem(k, v); return true; } catch (e) {
      console.warn("localStorage write failed:", name, e.name);
    }
    // Safari (iPad/iPhone) gives each site only ~5 MB. When cached patient data
    // fills it, the LOGIN SESSION could not be saved and every login bounced
    // straight back to the login page. Drop the cache and try again.
    clearCache(name);
    try { localStorage.setItem(k, v); return true; } catch (e) {}
    // Still blocked (e.g. a restricted private window): keep it for this tab.
    try { sessionStorage.setItem(k, v); return true; } catch (e) {}
    console.warn("storage unavailable for", name);
    return false;
  }

  function removeTable(name){
    try { localStorage.removeItem(key(name)); } catch (e) {}
    try { sessionStorage.removeItem(key(name)); } catch (e) {}
  }
  function uid(prefix='id'){
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  // iOS / Safari Health Check: Verify storage is accessible on boot
  try {
    const testKey = key('health_test');
    localStorage.setItem(testKey, '1');
    localStorage.removeItem(testKey);
    console.log("Onvilox Storage: HEALTHY (iOS Compatibility Verified)");
  } catch (e) {
    console.warn("localStorage unavailable — running server-only mode:", e.name);
  }

  global.db = {
    getTable,
    setTable,
    removeTable,
    clearCache,
    uid,
    key
  };
})(window);
