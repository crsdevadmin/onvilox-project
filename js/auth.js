(function(global){
  const SESSION_KEY = 'session';

  function getCurrentUser(){
    return db.getTable(SESSION_KEY, null);
  }

  function setCurrentUser(u){
    db.setTable(SESSION_KEY, u);
  }

  function logout(){
    localStorage.removeItem(db.key(SESSION_KEY));
    window.location.href = 'index.html';
  }

  function login(username, password){
    const users = db.getTable('users', []);
    const user = users.find(u => (u.username||'').toLowerCase() === (username||'').toLowerCase() && u.password === password);
    if(!user) return { ok:false, error:'Invalid username or password' };

    // Minimal session payload
    setCurrentUser({
      id: user.id,
      role: user.role,
      username: user.username,
      name: user.name,
      storeId: user.storeId || null
    });

    const route = routeForRole(user.role);
    return { ok:true, route };
  }

  function routeForRole(role){
    if(role === 'SUPER_ADMIN') return 'admin.html';
    if(role === 'DOCTOR' || role === 'ASSISTANT') return 'doctor.html';
    if(role === 'STORE') return 'store.html';
    return 'index.html';
  }

  function requireRole(allowedRoles){
    const u = getCurrentUser();
    if(!u){ window.location.href='index.html'; return; }
    if(Array.isArray(allowedRoles) && allowedRoles.length){
      if(!allowedRoles.includes(u.role)){
        // redirect to their home
        window.location.href = routeForRole(u.role);
        return;
      }
    }
  }

  global.auth = { getCurrentUser, login, logout, requireRole, routeForRole };
})(window);
