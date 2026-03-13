// Seed only the single default SUPER_ADMIN
(function(){
  const users = db.getTable('users', []);
  const hasAdmin = users.some(u => u.role === 'SUPER_ADMIN' && u.username === 'admin');
  if(!hasAdmin){
    users.push({
      id: db.uid('user'),
      role: 'SUPER_ADMIN',
      username: 'admin',
      password: 'admin2026',
      name: 'System Admin',
      createdAt: new Date().toISOString()
    });
    db.setTable('users', users);
  }
})();
