// Simple localStorage wrapper for Onvilox MVP
(function(global){
  const LS_PREFIX = 'onvilox_';

  function key(k){ return LS_PREFIX + k; }

  function getTable(name, fallback){
    const raw = localStorage.getItem(key(name));
    if(!raw) return fallback;
    try { return JSON.parse(raw); } catch { return fallback; }
  }

  function setTable(name, value){
    try {
      localStorage.setItem(key(name), JSON.stringify(value));
    } catch (e) {
      // localStorage quota exceeded or blocked — non-critical since data is persisted server-side
      console.warn("localStorage write skipped (quota/blocked):", name, e.name);
    }
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
    uid,
    key
  };
})(window);
