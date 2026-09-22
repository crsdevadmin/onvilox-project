// whoami.js — shows who is signed in (and, for an assistant, which doctor
// they work for) in the top bar of every page, so it is always clear whose
// workspace you are in.
(function () {
  const ROLE = { DOCTOR: 'Doctor', ASSISTANT: 'Assistant', ADMIN: 'Admin', SUPER_ADMIN: 'Super Admin',
                 STORE: 'Store Manager', STORE_APPROVER: 'Store Approver', COORDINATOR: 'Coordinator' };
  function esc(s) { return String(s == null ? '' : s).replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c])); }
  function dr(n) { n = String(n || '').trim(); return !n ? '' : (/^dr\.?\s/i.test(n) ? n : 'Dr. ' + n); }
  function paint(info) {
    const nav = document.querySelector('.topbar .nav') || document.querySelector('.topbar');
    if (!nav) return;
    let el = document.getElementById('whoamiBadge');
    if (!el) {
      el = document.createElement('div');
      el.id = 'whoamiBadge';
      el.style.cssText = 'display:inline-flex;flex-direction:column;align-items:flex-end;line-height:1.2;margin-right:14px;'
        + 'padding:4px 10px;border-radius:8px;border:1px solid rgba(148,163,184,.35);font-family:inherit;';
      nav.insertBefore(el, nav.firstChild);
      const old = document.getElementById('rolePill'); if (old) old.style.display = 'none';
    }
    const role = ROLE[info.role] || info.role || '';
    const name = info.role === 'DOCTOR' ? dr(info.name) : (info.name || '');
    let sub = role;
    if (info.role === 'ASSISTANT') sub = info.doctor ? 'Assistant to ' + dr(info.doctor.name) : 'Assistant · not linked to a doctor';
    else if (info.store && /STORE|COORDINATOR/.test(info.role || '')) sub = role + ' · ' + info.store.name;
    el.innerHTML = '<span style="font-size:12.5px;font-weight:800;">' + esc(name) + '</span>'
      + '<span style="font-size:10.5px;font-weight:600;opacity:.75;' + (info.role === 'ASSISTANT' && !info.doctor ? 'color:#dc2626;opacity:1;' : '') + '">' + esc(sub) + '</span>';
    el.title = (name ? name + ' — ' : '') + sub;
    window.__whoami = info;
    try { document.dispatchEvent(new CustomEvent('whoami', { detail: info })); } catch (e) {}
  }
  function run() {
    const me = (typeof auth !== 'undefined' && auth.getCurrentUser) ? auth.getCurrentUser() : null;
    if (!me) return;
    paint({ id: me.id, name: me.name, role: me.role });           // immediate, from the session
    const apiBase = (typeof CONFIG !== 'undefined' && CONFIG.API_BASE_URL) ? CONFIG.API_BASE_URL : '';
    fetch(apiBase + '/api/me', { headers: { Authorization: 'Bearer ' + (me.token || '') } })
      .then(r => r.ok ? r.json() : null).then(info => { if (info) paint(info); }).catch(() => {});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();
