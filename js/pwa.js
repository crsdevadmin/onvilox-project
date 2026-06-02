// PWA: Service Worker registration + push subscription + install prompt
(function() {
  if (!('serviceWorker' in navigator)) return;

  const VAPID_KEY = 'BP2E-Ogveb92wrIjjciORv_jDJO82jut8m3QSJM_UrwJbVDJCFZdDzSuQZvahxpu_0gw7B-E_bJktm7VKd-qTEo';

  // Register service worker
  navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(reg => {
    window._swReg = reg;
    // Wait for SW to be active before subscribing
    if (reg.active) {
      _subscribePush(reg);
    } else {
      (reg.installing || reg.waiting).addEventListener('statechange', function() {
        if (this.state === 'activated') _subscribePush(reg);
      });
      reg.addEventListener('updatefound', () => {
        reg.installing.addEventListener('statechange', function() {
          if (this.state === 'activated') _subscribePush(reg);
        });
      });
      // Also try after short delay as fallback
      setTimeout(() => _subscribePush(reg), 2000);
    }
  }).catch(e => console.warn('SW registration failed:', e));

  // PWA install prompt
  let _deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    _deferredPrompt = e;
    _showInstallBanner();
  });

  function _showInstallBanner() {
    if (localStorage.getItem('pwa_install_dismissed')) return;
    const banner = document.createElement('div');
    banner.id = 'pwaInstallBanner';
    banner.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#0e2247;color:#fff;padding:12px 20px;display:flex;align-items:center;justify-content:space-between;z-index:9999;font-size:14px;box-shadow:0 -2px 12px rgba(0,0,0,0.3);';
    banner.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;">
        <span style="font-size:24px;">📲</span>
        <div>
          <div style="font-weight:700;">Install Gquence App</div>
          <div style="font-size:12px;opacity:0.8;">Add to your home screen for quick access</div>
        </div>
      </div>
      <div style="display:flex;gap:10px;">
        <button onclick="_installPWA()" style="background:#10b981;color:#fff;border:none;border-radius:6px;padding:8px 16px;font-weight:700;cursor:pointer;font-size:13px;">Install</button>
        <button onclick="_dismissInstall()" style="background:transparent;color:#fff;border:1px solid rgba(255,255,255,0.4);border-radius:6px;padding:8px 12px;cursor:pointer;font-size:13px;">Not now</button>
      </div>`;
    document.body.appendChild(banner);
  }

  window._installPWA = function() {
    if (!_deferredPrompt) return;
    _deferredPrompt.prompt();
    _deferredPrompt.userChoice.then(r => {
      if (r.outcome === 'accepted') localStorage.setItem('pwa_install_dismissed', '1');
      _deferredPrompt = null;
      const b = document.getElementById('pwaInstallBanner');
      if (b) b.remove();
    });
  };

  window._dismissInstall = function() {
    localStorage.setItem('pwa_install_dismissed', '1');
    const b = document.getElementById('pwaInstallBanner');
    if (b) b.remove();
  };

  // Subscribe to push notifications (store managers only)
  function _subscribePush(reg) {
    if (!('PushManager' in window)) return;
    const u = (typeof auth !== 'undefined') ? auth.getCurrentUser() : null;
    if (!u || u.role !== 'STORE') return; // only store managers need push
    Notification.requestPermission().then(permission => {
      if (permission !== 'granted') return;
      reg.pushManager.getSubscription().then(existing => {
        if (existing) return _saveSub(existing, u);
        return reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: _urlBase64ToUint8Array(VAPID_KEY)
        }).then(sub => _saveSub(sub, u));
      }).catch(e => console.warn('Push subscribe failed:', e));
    });
  }

  function _saveSub(sub, u) {
    const apiBase = (typeof CONFIG !== 'undefined' && CONFIG.API_BASE_URL) ? CONFIG.API_BASE_URL : '';
    fetch(apiBase + '/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': u.token ? 'Bearer ' + u.token : '' },
      body: JSON.stringify({ subscription: sub })
    }).catch(() => {});
  }

  function _urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = window.atob(base64);
    return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
  }
})();
