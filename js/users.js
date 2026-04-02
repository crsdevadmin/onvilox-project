// users.js — API-backed user service with localStorage fallback cache

(function(global){

  const _cache = { users: null };

  function _apiBase() {
    return (typeof CONFIG !== 'undefined' && CONFIG.API_BASE_URL) ? CONFIG.API_BASE_URL : '';
  }

  function _headers() {
    const u = (typeof auth !== 'undefined') ? auth.getCurrentUser() : null;
    const h = { 'Content-Type': 'application/json' };
    if (u && u.token) h['Authorization'] = 'Bearer ' + u.token;
    return h;
  }

  function _post(path, body) {
    return fetch(_apiBase() + path, { method: 'POST', headers: _headers(), body: JSON.stringify(body) });
  }

  function _put(path, body) {
    return fetch(_apiBase() + path, { method: 'PUT', headers: _headers(), body: JSON.stringify(body) });
  }

  function _del(path) {
    return fetch(_apiBase() + path, { method: 'DELETE', headers: _headers() });
  }

  async function initUsers() {
    try {
      const res = await fetch(_apiBase() + '/api/users', { headers: _headers() });
      if (res.ok) {
        _cache.users = await res.json();
        db.setTable('users', _cache.users);
      }
    } catch(e) {
      console.warn('initUsers: server unreachable, using localStorage');
      _cache.users = db.getTable('users', []);
    }
  }

  function getUsers() {
    return _cache.users || db.getTable('users', []);
  }

  function getUsersByRole(role) {
    return getUsers().filter(u => u.role === role);
  }

  function getUserById(id) {
    return getUsers().find(u => u.id === id) || null;
  }

  function getDoctorHospitalName(id) {
    const u = getUserById(id);
    return u && (u.hospital_name || u.hospitalName) ? (u.hospital_name || u.hospitalName) : '';
  }

  function generatePassword() {
    return Math.random().toString(36).slice(2, 8) + '26';
  }

  async function createUser({role, name, email, phone, address, storeId, mappedDoctorId, hospitalName}) {
    const users = getUsers();
    const mail = (email || '').trim();
    if (mail) {
      const okEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail);
      if (!okEmail) return { ok: false, error: 'Email is not valid' };
      if (users.some(u => (u.email || '').toLowerCase() === mail.toLowerCase())) {
        return { ok: false, error: 'Email already exists' };
      }
    }

    const ph = (phone || '').trim();
    if (ph) {
      const digits = ph.replace(/\D/g, '');
      if (digits.length < 10 || digits.length > 15) return { ok: false, error: 'Phone must be 10–15 digits' };
    }

    if (!mail && !ph) return { ok: false, error: 'Either Email or Phone is required' };

    const fullName = (name || '').trim();
    if (!fullName) return { ok: false, error: 'Full Name is required' };

    if (role === 'DOCTOR') {
      const stores = (typeof storeService !== 'undefined') ? storeService.getStores() : db.getTable('stores', []);
      if (!stores.length) return { ok: false, error: 'Please create at least one Store before creating a Doctor.' };
    }

    if ((role === 'DOCTOR' || role === 'STORE') && !storeId) {
      return { ok: false, error: 'Store mapping is required for this role' };
    }

    if (role === 'STORE') {
      const existingMgr = getUsersByRole('STORE').find(u => (u.storeId || u.store_id) === storeId);
      if (existingMgr) return { ok: false, error: 'This store already has a Store login.' };
    }

    if (role === 'ASSISTANT' && !mappedDoctorId) {
      return { ok: false, error: 'Doctor mapping is required for Assistant' };
    }

    const password = generatePassword();
    const id = db.uid('user');
    const user = {
      id, role, name: fullName,
      email: mail, phone: ph,
      address: address || '',
      storeId: storeId || null,
      store_id: storeId || null,
      hospital_name: (hospitalName || '').trim(),
      hospitalName: (hospitalName || '').trim(),
      createdAt: new Date().toISOString()
    };

    // Update cache immediately
    if (_cache.users) _cache.users.push(user);
    db.setTable('users', getUsers());

    // Save to server
    try {
      const res = await _post('/api/users', {
        id, name: fullName, email: mail || (ph + '@phone.local'),
        password, role,
        hospital_name: (hospitalName || '').trim(),
        store_id: storeId || null,
        phone: ph
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { ok: false, error: err.error || 'Server error creating user' };
      }
    } catch(e) {
      console.warn('createUser: server unreachable, saved to localStorage only');
    }

    // Save assistant mapping
    if (role === 'ASSISTANT' && mappedDoctorId) {
      const map = db.getTable('doctor_assistant_map', []);
      map.push({ assistantId: id, doctorId: mappedDoctorId });
      db.setTable('doctor_assistant_map', map);
      try {
        await _post('/api/mappings', { assistantId: id, doctorId: mappedDoctorId });
      } catch(e) { /* ignore */ }
    }

    return { ok: true, user, password };
  }

  async function resetUserPassword(userId) {
    const users = getUsers();
    const idx = users.findIndex(u => u.id === userId);
    if (idx === -1) return { ok: false, error: 'User not found' };
    const newPass = generatePassword();
    users[idx].password = newPass;
    if (_cache.users) _cache.users = users;
    db.setTable('users', users);
    try {
      await _put('/api/users/' + userId + '/password', { password: newPass });
    } catch(e) { console.warn('resetUserPassword: server unreachable'); }
    return { ok: true, password: newPass, user: users[idx] };
  }

  async function deleteUser(userId) {
    const users = getUsers();
    const idx = users.findIndex(u => u.id === userId);
    if (idx === -1) return { ok: false, error: 'User not found' };

    const role = users[idx].role;
    if (role === 'SUPER_ADMIN') {
      const admins = users.filter(u => u.role === 'SUPER_ADMIN');
      if (admins.length <= 1) return { ok: false, error: 'Cannot delete the last Super Admin' };
    }

    users.splice(idx, 1);
    if (_cache.users) _cache.users = users;
    db.setTable('users', users);

    let map = db.getTable('doctor_assistant_map', []);
    if (role === 'ASSISTANT') map = map.filter(m => m.assistantId !== userId);
    else if (role === 'DOCTOR') map = map.filter(m => m.doctorId !== userId);
    db.setTable('doctor_assistant_map', map);

    try {
      await _del('/api/users/' + userId);
    } catch(e) { console.warn('deleteUser: server unreachable'); }

    return { ok: true };
  }

  global.userService = { initUsers, getUsers, getUsersByRole, getUserById, getDoctorHospitalName, createUser, resetUserPassword, deleteUser };
})(window);
