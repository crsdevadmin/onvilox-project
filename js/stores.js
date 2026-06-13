// stores.js — API-backed store service with localStorage fallback cache

(function(global){

  const _cache = { stores: null };

  function _apiBase() {
    return (typeof CONFIG !== 'undefined' && CONFIG.API_BASE_URL) ? CONFIG.API_BASE_URL : '';
  }

  function _headers() {
    const u = (typeof auth !== 'undefined') ? auth.getCurrentUser() : null;
    const h = { 'Content-Type': 'application/json' };
    if (u && u.token) h['Authorization'] = 'Bearer ' + u.token;
    return h;
  }

  async function initStores() {
    try {
      const res = await fetch(_apiBase() + '/api/stores', { headers: _headers() });
      if (res.ok) {
        _cache.stores = await res.json();
        db.setTable('stores', _cache.stores);
      }
    } catch(e) {
      console.warn('initStores: server unreachable, using localStorage');
      _cache.stores = db.getTable('stores', []);
    }
  }

  function getStores() {
    return _cache.stores || db.getTable('stores', []);
  }

  function getStoreById(id) {
    return getStores().find(s => s.id === id) || null;
  }

  async function createStore({name, fssai, hospital, location, address}) {
    const n = (name || '').trim();
    if (!n) return { ok: false, error: 'Store name is required' };

    const f = (fssai || '').trim();
    if (!f) return { ok: false, error: 'FSSAI licence number is required' };
    if (!/^\d{14}$/.test(f)) return { ok: false, error: 'FSSAI number must be exactly 14 digits' };

    const stores = getStores();
    if (stores.some(s => (s.name || '').toLowerCase() === n.toLowerCase())) {
      return { ok: false, error: 'Store already exists' };
    }
    if (stores.some(s => (s.fssai_number || s.fssai) === f)) {
      return { ok: false, error: 'A store with this FSSAI number already exists' };
    }

    const id = db.uid('store');
    const store = {
      id, name: n,
      fssai: f,
      fssai_number: f,
      address: (address || '').trim(),
      hospital: (hospital || '').trim(),
      location: (location || '').trim(),
      createdAt: new Date().toISOString(),
      active: true
    };

    // Update cache immediately
    if (_cache.stores) _cache.stores.push(store);
    else _cache.stores = [store];
    db.setTable('stores', getStores());

    // Save to server
    try {
      const res = await fetch(_apiBase() + '/api/stores', {
        method: 'POST', headers: _headers(), body: JSON.stringify(store)
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { ok: false, error: err.error || 'Server error creating store' };
      }
    } catch(e) {
      console.warn('createStore: server unreachable, saved to localStorage only');
    }

    return { ok: true, store };
  }

  async function deleteStore(id) {
    const users = (typeof userService !== 'undefined') ? userService.getUsers() : db.getTable('users', []);
    const hasManager = users.some(u => u.role === 'STORE' && (u.storeId === id || u.store_id === id));
    if (hasManager) return { ok: false, error: 'Cannot delete this store because it has a Store login.' };

    if (_cache.stores) _cache.stores = _cache.stores.filter(s => s.id !== id);
    db.setTable('stores', getStores());

    try {
      await fetch(_apiBase() + '/api/stores/' + id, { method: 'DELETE', headers: _headers() });
    } catch(e) { console.warn('deleteStore: server unreachable'); }

    return { ok: true };
  }

  global.storeService = { initStores, getStores, getStoreById, createStore, deleteStore };
})(window);
