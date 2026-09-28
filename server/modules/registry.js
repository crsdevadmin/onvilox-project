// Module registry — the single list of clinical modules the platform knows.
//
// A "module" is a clinical product line (Oncology, Fertility, …) that shares the
// platform core (login, users, hospitals, stores, manufacturing, pricing) but
// owns its own screens, API routes and clinical rules. Adding a module means
// adding one entry here plus a folder under server/modules/<code>/ and
// web/src/modules/<code>/ — nothing else in the platform should need editing.
//
// defaultOn: true means every user/store has the module unless an admin has
// explicitly revoked it. Oncology is default-on so that existing users (and
// users created through the older admin screens) keep working unchanged.

const STORE_ROLES = ['STORE', 'STORE_APPROVER'];
const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN'];

const MODULES = [
  {
    code: 'onco',
    name: 'Oncology',
    defaultOn: true,
    // Onco still runs on the legacy pages, which read users.role. Its module
    // role is therefore fixed to users.role and cannot be edited in the grid.
    roleFromUser: true,
    roles: ['DOCTOR', 'ASSISTANT', 'STORE', 'STORE_APPROVER', 'COORDINATOR'],
  },
  {
    code: 'fertility',
    name: 'Fertility',
    defaultOn: false,
    roleFromUser: false,
    roles: ['DOCTOR', 'ASSISTANT', 'DIETITIAN', 'STORE', 'STORE_APPROVER', 'COORDINATOR'],
  },
];

function getModule(code) {
  return MODULES.find(m => m.code === code) || null;
}

module.exports = { MODULES, STORE_ROLES, ADMIN_ROLES, getModule };
