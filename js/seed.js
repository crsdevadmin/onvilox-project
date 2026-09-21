// No built-in accounts in the browser. The super admin lives on the server only
// (password from the SUPER_ADMIN_PASSWORD environment variable). This file used
// to seed a local admin with a known password for offline login; it now only
// removes that old local copy from browsers that still have it.
(function(){
  try {
    const users = db.getTable('users', []);
    const kept = users.filter(u => !(u.role === 'SUPER_ADMIN' && u.password));
    if (kept.length !== users.length) db.setTable('users', kept);
  } catch (e) {}
})();
