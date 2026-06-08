// Seed only the single default SUPER_ADMIN
(function(){
  let users = db.getTable('users', []);
  // Remove any old admin entries with wrong email/username
  users = users.filter(u => !(u.role === 'SUPER_ADMIN' && u.email !== 'admin@gquence.in' && u.username !== 'admin@gquence.in'));
  const hasAdmin = users.some(u => u.role === 'SUPER_ADMIN' && (u.email === 'admin@gquence.in' || u.username === 'admin@gquence.in'));
  if(!hasAdmin){
    users.push({
      id: 'superadmin_001',
      role: 'SUPER_ADMIN',
      username: 'admin@gquence.in',
      email: 'admin@gquence.in',
      password: 'admin2026',
      name: 'System Admin',
      createdAt: new Date().toISOString()
    });
    db.setTable('users', users);
  }
})();
