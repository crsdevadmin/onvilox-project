(function(global){
  function getUsers(){ return db.getTable('users', []); }
  function saveUsers(users){ db.setTable('users', users); }
  function getUsersByRole(role){ return getUsers().filter(u => u.role === role); }

  function generatePassword(){
    // Simple but decent for MVP
    return Math.random().toString(36).slice(2, 8) + '26';
  }

  function createUser({role, name, email, phone, address, storeId, mappedDoctorId, hospitalName}){
    const users = getUsers();
    
    const mail = (email||'').trim();
    if(mail){
      const okEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail);
      if(!okEmail) return { ok:false, error:'Email is not valid' };
      if(users.some(u => (u.email||'').toLowerCase() === mail.toLowerCase() || (u.username||'').toLowerCase() === mail.toLowerCase())){
        return { ok:false, error:'Email already exists' };
      }
    }

    const ph = (phone||'').trim();
    if(ph){
      const digits = ph.replace(/\D/g,'');
      if(digits.length < 10 || digits.length > 15) return { ok:false, error:'Phone must be 10–15 digits' };
      if(users.some(u => (u.phone||'') === ph || (u.username||'') === ph)){
        return { ok:false, error:'Phone already exists' };
      }
    }

    if(!mail && !ph){
      return { ok:false, error:'Either Email or Phone is required to use as a login' };
    }

    const uname = mail || ph; // priority to email

    const fullName = (name||'').trim();
    if(!fullName) return { ok:false, error:'Full Name is required' };
    // Require at least one store created before creating doctors or store logins
    if(role === 'DOCTOR'){
      const stores = db.getTable('stores', []);
      if(!stores.length) return { ok:false, error:'Please create at least one Store before creating a Doctor.' };
    }
    if(role === 'DOCTOR' || role === 'STORE'){
      if(!storeId) return { ok:false, error:'Store mapping is required for this role' };
    }

    // Enforce ONE Store login per Store (MVP constraint)
    if(role === 'STORE'){
      const existingMgr = getUsersByRole('STORE').find(u => u.storeId === storeId);
      if(existingMgr){
        return { ok:false, error:'This store already has a Store login. Please choose another store.' };
      }
    }

    if(role === 'ASSISTANT'){
      if(!mappedDoctorId) return { ok:false, error:'Doctor mapping is required for Assistant' };
    }

    const password = generatePassword();
    const user = {
      id: db.uid('user'),
      role,
      name: fullName,
      username: uname,
      password,
      email: mail,
      phone: phone || '',
      address: address || '',
      storeId: storeId || null,
      hospitalName: (hospitalName||'').trim(),
      createdAt: new Date().toISOString()
    };
    users.push(user);
    saveUsers(users);

    // mapping write
    if(role === 'ASSISTANT'){
      const map = db.getTable('doctor_assistant_map', []);
      map.push({ assistantId: user.id, doctorId: mappedDoctorId });
      db.setTable('doctor_assistant_map', map);
    }

    return { ok:true, user, password };
  }


  function getUserById(id){
    return getUsers().find(u => u.id === id);
  }

  function resetUserPassword(userId){
    const users = getUsers();
    const idx = users.findIndex(u => u.id === userId);
    if(idx === -1) return { ok:false, error:'User not found' };
    const newPass = generatePassword();
    users[idx].password = newPass;
    users[idx].passwordUpdatedAt = new Date().toISOString();
    saveUsers(users);
    return { ok:true, password:newPass, user:users[idx] };
  }

  function deleteUser(userId){
    let users = getUsers();
    const idx = users.findIndex(u => u.id === userId);
    if(idx === -1) return { ok:false, error:'User not found' };

    const role = users[idx].role;
    
    // Safety check so we don't delete the only admin
    if(role === 'SUPER_ADMIN'){
      const admins = users.filter(u => u.role === 'SUPER_ADMIN');
      if(admins.length <= 1) return { ok:false, error:'Cannot delete the last Super Admin' };
    }

    users.splice(idx, 1);
    saveUsers(users);

    // Clean up mappings if it was an assistant or doctor
    let map = db.getTable('doctor_assistant_map', []);
    if(role === 'ASSISTANT'){
      map = map.filter(m => m.assistantId !== userId);
    } else if(role === 'DOCTOR'){
      map = map.filter(m => m.doctorId !== userId);
    }
    db.setTable('doctor_assistant_map', map);

    return { ok:true };
  }

  function getDoctorHospitalName(id){
    const u = getUserById(id);
    return u && u.hospitalName ? u.hospitalName : '';
  }

  global.userService = { getUsers, getUsersByRole, getUserById, getDoctorHospitalName, createUser, resetUserPassword, deleteUser };
})(window);
