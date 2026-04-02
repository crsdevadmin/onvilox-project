// mappings.js — API-backed mapping service with localStorage fallback

(function(global){

  const _cache = { map: null };

  function _apiBase() {
    return (typeof CONFIG !== 'undefined' && CONFIG.API_BASE_URL) ? CONFIG.API_BASE_URL : '';
  }

  function _headers() {
    const u = (typeof auth !== 'undefined') ? auth.getCurrentUser() : null;
    const h = { 'Content-Type': 'application/json' };
    if (u && u.token) h['Authorization'] = 'Bearer ' + u.token;
    return h;
  }

  async function initMappings() {
    try {
      const res = await fetch(_apiBase() + '/api/mappings', { headers: _headers() });
      if (res.ok) {
        const rows = await res.json();
        _cache.map = rows.map(r => ({
          assistantId: r.assistant_id || r.assistantId,
          doctorId: r.doctor_id || r.doctorId
        }));
        db.setTable('doctor_assistant_map', _cache.map);
      }
    } catch(e) {
      console.warn('initMappings: server unreachable, using localStorage');
      _cache.map = db.getTable('doctor_assistant_map', []);
    }
  }

  function getDoctorForAssistant(assistantId) {
    const map = _cache.map || db.getTable('doctor_assistant_map', []);
    const m = map.find(x => x.assistantId === assistantId);
    return m ? m.doctorId : null;
  }

  function getStoreForDoctor(doctorId) {
    const users = (typeof userService !== 'undefined') ? userService.getUsers() : db.getTable('users', []);
    const d = users.find(u => u.id === doctorId);
    return d ? (d.storeId || d.store_id || null) : null;
  }

  global.mappingService = { initMappings, getDoctorForAssistant, getStoreForDoctor };
})(window);
