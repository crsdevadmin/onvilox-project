(function(global){
  function getStores(){ return db.getTable('stores', []); }
  function saveStores(stores){ db.setTable('stores', stores); }

  function createStore({name, hospital, location}){
    const stores = getStores();
    const n = (name||'').trim();
    if(!n) return { ok:false, error:'Store name is required' };
    if(stores.some(s => (s.name||'').toLowerCase() === n.toLowerCase())){
      return { ok:false, error:'Store already exists' };
    }
    const store = {
      id: db.uid('store'),
      name: n,
      hospital: (hospital||'').trim(),
      location: (location||'').trim(),
      createdAt: new Date().toISOString(),
      active: true
    };
    stores.push(store);
    saveStores(stores);

    // Auto-create Store login (one per store) for MVP convenience
    // Username is derived from store name, guaranteed unique.
    try{
      const existing = db.getTable('users', []).some(u => u.role === 'STORE' && u.storeId === store.id);
      if(!existing && global.userService){
        const base = n.toLowerCase().replace(/[^a-z0-9]+/g,'').slice(0,10) || 'store';
        let uname = base + '_store';
        let i = 1;
        const users = db.getTable('users', []);
        while(users.some(u => (u.username||'').toLowerCase() === uname.toLowerCase())){
          uname = base + '_store' + i;
          i++;
        }
        const res = global.userService.createUser({ role:'STORE', name: n + ' Store', username: uname, storeId: store.id });
        if(res && res.ok){
          return { ok:true, store, storeLogin: { username: uname, password: res.password } };
        }
      }
    }catch(e){ /* ignore auto-login creation errors */ }

    return { ok:true, store };
  }

  function deleteStore(id){
    // MVP safety: don't allow deleting a store that has a Store login
    const users = db.getTable('users', []);
    const hasManager = users.some(u => u.role === 'STORE' && u.storeId === id);
    if(hasManager){
      return { ok:false, error:'Cannot delete this store because it already has a Store login.' };
    }
    let stores = getStores();
    stores = stores.filter(s => s.id !== id);
    saveStores(stores);
    return { ok:true };
  }

  function getStoreById(id){
    return getStores().find(s => s.id === id);
  }

  global.storeService = { getStores, createStore, deleteStore, getStoreById };
})(window);
