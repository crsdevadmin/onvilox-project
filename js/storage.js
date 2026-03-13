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
    localStorage.setItem(key(name), JSON.stringify(value));
  }

  function uid(prefix='id'){
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  global.db = {
    getTable,
    setTable,
    uid,
    key
  };
})(window);
