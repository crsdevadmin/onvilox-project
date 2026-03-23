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
      console.error("Storage Error (iOS/Mobile):", e);
      alert("❌ STORAGE FAILURE: Could not save data. If you are on iOS, ensure you are NOT in Private Mode and are serving the site via HTTP/HTTPS, not 'file://'.");
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
    console.error("Storage Critical Failure:", e);
    alert("CRITICAL: Your iOS browser is blocking local storage. This usually happens in 'Private Browsing' mode or if your iPhone storage is nearly full. Patient data CANNOT be saved until you switch to a standard tab.");
  }

  global.db = {
    getTable,
    setTable,
    uid,
    key
  };
})(window);
