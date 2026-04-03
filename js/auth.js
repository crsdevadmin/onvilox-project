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
    window.location.href = '/login';
  }

  // async: calls server API, returns { ok, route } or { ok:false, error }
  async function login(username, password){
    const apiBase = (typeof CONFIG !== 'undefined' && CONFIG.API_BASE_URL) ? CONFIG.API_BASE_URL : '';
    try {
      const res = await fetch(apiBase + '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: username, password })
      });

      if (res.ok) {
        const data = await res.json();
        // Store session with JWT token for subsequent API calls
        setCurrentUser({
          id: data.user.id,
          role: data.user.role,
          name: data.user.name,
          hospital_name: data.user.hospital_name,
          username: username,
          token: data.token
        });
        return { ok: true, route: routeForRole(data.user.role) };
      }

      const errData = await res.json().catch(() => ({}));
      return { ok: false, error: errData.error || 'Invalid credentials' };

    } catch (e) {
      // Network error — fall back to localStorage users for offline/dev mode
      console.warn('Server login failed, trying localStorage fallback:', e.message);
      const users = db.getTable('users', []);
      const user = users.find(u => (u.username || u.email || '').toLowerCase() === (username || '').toLowerCase() && u.password === password);
      if (!user) return { ok: false, error: 'Server unavailable and no local user found' };
      setCurrentUser({ id: user.id, role: user.role, username: user.username || user.email, name: user.name, storeId: user.storeId || null, token: null });
      return { ok: true, route: routeForRole(user.role) };
    }
  }

  function routeForRole(role){
    if(role === 'SUPER_ADMIN' || role === 'ADMIN') return '/admin';
    if(role === 'DOCTOR' || role === 'ASSISTANT') return '/dashboard';
    if(role === 'STORE') return '/store';
    return '/login';
  }

  function requireRole(allowedRoles){
    const u = getCurrentUser();
    if(!u){ window.location.href='/login'; return; }
    if(Array.isArray(allowedRoles) && allowedRoles.length){
      if(!allowedRoles.includes(u.role)){
        window.location.href = routeForRole(u.role);
        return;
      }
    }
  }

  global.auth = { getCurrentUser, login, logout, requireRole, routeForRole };
})(window);
