// Ember & Brew Official Direct App Download & PWA Engine
// Comprehensive Mobile App Mode & Native App Experience

let deferredPwaPrompt = null;

// Register Service Worker & Proactively Auto-Update Cache
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => {
        reg.update();
        console.log('[App] Service Worker active:', reg.scope);
      })
      .catch(err => {
        console.warn('[App] Service Worker registration failed:', err);
      });
  });
}

// Check Standalone Mode (if user is already running the installed app)
function isStandaloneMode() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    window.navigator.standalone === true ||
    document.referrer.includes('android-app://') ||
    navigator.userAgent.includes('EmberAndBrewAndroidApp')
  );
}

// Check if user is in App Mode (either installed or toggled via Install button)
function isAppMode() {
  return (
    isStandaloneMode() ||
    localStorage.getItem('eb_app_mode') === 'true' ||
    new URLSearchParams(window.location.search).get('view') === 'app' ||
    new URLSearchParams(window.location.search).get('app') === '1'
  );
}

// In-Memory & DOM Styles for App Mode
function injectAppModeStyles() {
  if (document.getElementById('ebAppModeInjectedStyles')) return;
  const style = document.createElement('style');
  style.id = 'ebAppModeInjectedStyles';
  style.textContent = `
    /* App Mode: Hide web footer and web install triggers */
    html.app-mode #main-footer,
    html.app-mode .page-footer,
    html.app-mode footer,
    html.app-mode #navInstallAppBtn,
    html.app-mode .pwa-install-btn,
    body.app-mode #main-footer,
    body.app-mode .page-footer,
    body.app-mode footer,
    body.app-mode #navInstallAppBtn,
    body.app-mode .pwa-install-btn,
    @media (display-mode: standalone), (display-mode: fullscreen), (display-mode: minimal-ui) {
      #main-footer,
      .page-footer,
      footer,
      #navInstallAppBtn,
      .pwa-install-btn {
        display: none !important;
        visibility: hidden !important;
      }
    }

    /* Content bottom padding to prevent bottom nav collision */
    html.app-mode body,
    body.app-mode {
      padding-bottom: calc(68px + env(safe-area-inset-bottom, 0px)) !important;
    }
    @media (display-mode: standalone), (display-mode: fullscreen), (display-mode: minimal-ui) {
      body {
        padding-bottom: calc(68px + env(safe-area-inset-bottom, 0px)) !important;
      }
    }

    /* Prevent Cart Drawer / Panel from sliding under App Bottom Nav */
    html.app-mode #cart-panel,
    body.app-mode #cart-panel,
    html.app-mode aside[role="dialog"]#cart-panel,
    body.app-mode aside[role="dialog"]#cart-panel {
      bottom: calc(60px + env(safe-area-inset-bottom, 0px)) !important;
      height: calc(100% - 60px - env(safe-area-inset-bottom, 0px)) !important;
      max-height: calc(100% - 60px - env(safe-area-inset-bottom, 0px)) !important;
    }
    @media (display-mode: standalone), (display-mode: fullscreen), (display-mode: minimal-ui) {
      #cart-panel {
        bottom: calc(60px + env(safe-area-inset-bottom, 0px)) !important;
        height: calc(100% - 60px - env(safe-area-inset-bottom, 0px)) !important;
        max-height: calc(100% - 60px - env(safe-area-inset-bottom, 0px)) !important;
      }
    }

    html.app-mode #cart-footer,
    body.app-mode #cart-footer {
      padding-bottom: 24px !important;
    }

    /* Floating sticky cart bars sit comfortably above bottom nav bar */
    html.app-mode #mobile-cart-bar,
    body.app-mode #mobile-cart-bar,
    html.app-mode .mobile-menu-cart-bar,
    body.app-mode .mobile-menu-cart-bar {
      bottom: calc(70px + env(safe-area-inset-bottom, 0px)) !important;
    }
    @media (display-mode: standalone), (display-mode: fullscreen), (display-mode: minimal-ui) {
      #mobile-cart-bar,
      .mobile-menu-cart-bar {
        bottom: calc(70px + env(safe-area-inset-bottom, 0px)) !important;
      }
    }

    /* Modals & Dialogs (Dish Customization Sheet, Upsell, Auth) above Bottom Nav */
    #dish3d-modal,
    #upsell-modal,
    #customer-auth-modal,
    .modal-backdrop-wrap,
    #ebAppBrandModal {
      z-index: 10000005 !important;
    }
    /* Toast notifications elevated above Bottom Nav */
    html.app-mode #toast-container,
    body.app-mode #toast-container,
    html.app-mode #toast,
    body.app-mode #toast {
      bottom: calc(72px + env(safe-area-inset-bottom, 0px)) !important;
      z-index: 10000010 !important;
    }

    /* Native App Bottom Tab Bar */
    #ebAppBottomNav {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      height: calc(60px + env(safe-area-inset-bottom, 0px));
      padding-bottom: env(safe-area-inset-bottom, 0px);
      background: rgba(18, 17, 15, 0.98);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border-top: 1px solid rgba(212, 168, 83, 0.35);
      display: flex;
      align-items: center;
      justify-content: space-around;
      z-index: 9999999;
      box-shadow: 0 -8px 30px rgba(0, 0, 0, 0.7);
      font-family: -apple-system, BlinkMacSystemFont, "DM Sans", "Segoe UI", Roboto, sans-serif;
    }

    .eb-app-tab {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 3px;
      height: 100%;
      text-decoration: none;
      color: #9C9588;
      font-size: 10.5px;
      font-weight: 600;
      letter-spacing: 0.2px;
      transition: all 0.2s ease;
      position: relative;
      background: transparent;
      border: none;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
      padding: 0;
      outline: none;
    }

    .eb-app-tab i {
      font-size: 17px;
      transition: transform 0.2s ease, color 0.2s ease;
      color: inherit;
    }

    .eb-app-tab:hover {
      color: #E8DFD1;
    }

    .eb-app-tab:active i {
      transform: scale(0.9);
    }

    .eb-app-tab.active {
      color: #D4A853 !important;
      font-weight: 700;
    }

    .eb-app-tab.active i {
      color: #D4A853 !important;
      transform: translateY(-1px);
    }

    .eb-app-tab.active::after {
      content: '';
      position: absolute;
      bottom: calc(4px + env(safe-area-inset-bottom, 0px));
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background: #D4A853;
      box-shadow: 0 0 6px rgba(212, 168, 83, 0.9);
    }

    .eb-app-cart-badge {
      position: absolute;
      top: 6px;
      right: calc(50% - 18px);
      background: #D4A853;
      color: #0F0E0C;
      font-size: 10px;
      font-weight: 800;
      min-width: 17px;
      height: 17px;
      line-height: 17px;
      border-radius: 9999px;
      text-align: center;
      padding: 0 4px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.4);
      display: none;
    }

    .eb-app-mode-switch-btn {
      background: rgba(212, 168, 83, 0.12);
      border: 1px solid rgba(212, 168, 83, 0.35);
      color: #D4A853;
      font-size: 11px;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 9999px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      transition: all 0.2s;
    }
    .eb-app-mode-switch-btn:hover {
      background: rgba(212, 168, 83, 0.24);
    }
  `;
  if (document.head) {
    document.head.appendChild(style);
  }
}

// Early application of App Mode to avoid visual flicker
if (isAppMode()) {
  document.documentElement.classList.add('app-mode');
  if (document.body) {
    document.body.classList.add('app-mode');
  }
  injectAppModeStyles();
}

function syncPwaInstallButtons() {
  const isInstalledOrApp = isAppMode();
  const navBtns = document.querySelectorAll('#navInstallAppBtn, .pwa-install-btn');
  navBtns.forEach(btn => {
    if (isInstalledOrApp) {
      btn.style.setProperty('display', 'none', 'important');
      btn.setAttribute('aria-hidden', 'true');
    } else {
      btn.style.display = '';
      btn.removeAttribute('aria-hidden');
    }
  });

  const exitBtns = document.querySelectorAll('.eb-exit-app-btn');
  exitBtns.forEach(btn => {
    if (isInstalledOrApp) {
      btn.style.display = '';
      btn.removeAttribute('aria-hidden');
    } else {
      btn.style.setProperty('display', 'none', 'important');
      btn.setAttribute('aria-hidden', 'true');
    }
  });
}

// Capture native beforeinstallprompt event if browser supports it
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPwaPrompt = e;
  syncPwaInstallButtons();
});

// Toast notification helper
function showAppToast(message, duration = 3500) {
  let toast = document.getElementById('ebAppDirectToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'ebAppDirectToast';
    toast.style.cssText = `
      position: fixed;
      top: 24px;
      left: 50%;
      transform: translateX(-50%) translateY(-20px);
      background: rgba(26, 25, 23, 0.96);
      color: #F5F0E8;
      border: 1.5px solid #D4A853;
      padding: 12px 20px;
      border-radius: 9999px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      font-weight: 600;
      box-shadow: 0 10px 30px rgba(0,0,0,0.6);
      z-index: 99999999;
      opacity: 0;
      transition: all 0.25s ease-out;
      display: flex;
      align-items: center;
      gap: 8px;
      pointer-events: none;
    `;
    document.body.appendChild(toast);
  }
  
  toast.innerHTML = '<i class="fa-solid fa-circle-arrow-down" style="color:#D4A853;"></i> <span>' + message + '</span>';
  toast.style.opacity = '1';
  toast.style.transform = 'translateX(-50%) translateY(0)';

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(-20px)';
  }, duration);
}

// Detect active tab based on path and view
function getActiveTab() {
  const path = window.location.pathname;
  const search = window.location.search;
  if (path.includes('menu.html')) return 'menu';
  if (path.includes('customer.html')) {
    if (search.includes('orders') || search.includes('tracking')) return 'track';
    return 'profile';
  }
  if (typeof state !== 'undefined' && state && state.currentView === 'tracking') return 'track';
  if (document.body && document.body.classList.contains('view-tracking-active')) return 'track';
  return 'home';
}

// Get Cart Item Count for badge
function getAppCartCount() {
  const b1 = document.getElementById('cart-badge');
  if (b1 && b1.textContent && b1.style.display !== 'none' && !b1.classList.contains('hidden')) {
    const n = parseInt(b1.textContent.trim(), 10);
    if (!isNaN(n) && n > 0) return n;
  }
  const b2 = document.getElementById('cartBadge');
  if (b2 && b2.textContent && b2.style.display !== 'none' && !b2.classList.contains('hidden')) {
    const n = parseInt(b2.textContent.trim(), 10);
    if (!isNaN(n) && n > 0) return n;
  }
  try {
    const c1 = JSON.parse(localStorage.getItem('eb_cart') || '[]');
    if (Array.isArray(c1) && c1.length > 0) return c1.reduce((sum, item) => sum + (item.qty || item.quantity || 1), 0);
  } catch(e) {}
  try {
    const c2 = JSON.parse(localStorage.getItem('cart') || '[]');
    if (Array.isArray(c2) && c2.length > 0) return c2.reduce((sum, item) => sum + (item.qty || item.quantity || 1), 0);
  } catch(e) {}
  return 0;
}

function updateAppCartBadge() {
  const badge = document.getElementById('ebAppCartBadge');
  if (!badge) return;
  const count = getAppCartCount();
  if (count > 0) {
    badge.textContent = count;
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }
}

// App Tab navigation clicks
function onAppTabClick(tab) {
  if (tab === 'home') {
    if (window.location.pathname === '/' || window.location.pathname.endsWith('/index.html')) {
      if (typeof navigate === 'function') navigate('menu');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      renderAppBottomNav();
    } else {
      window.location.href = '/?view=app';
    }
  } else if (tab === 'menu') {
    if (window.location.pathname.includes('menu.html')) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      renderAppBottomNav();
    } else {
      window.location.href = '/menu.html?view=app';
    }
  } else if (tab === 'track') {
    if (window.location.pathname === '/' || window.location.pathname.endsWith('/index.html')) {
      if (typeof navigate === 'function') {
        navigate('tracking');
        renderAppBottomNav();
      } else {
        window.location.href = '/?view=tracking&app=1';
      }
    } else {
      window.location.href = '/customer.html?view=orders&app=1';
    }
  } else if (tab === 'cart') {
    if (typeof toggleCart === 'function') {
      toggleCart();
    } else if (typeof goToCheckout === 'function') {
      goToCheckout();
    } else {
      window.location.href = '/menu.html?view=app';
    }
  } else if (tab === 'profile') {
    if (window.location.pathname.includes('customer.html')) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      renderAppBottomNav();
    } else {
      window.location.href = '/customer.html?view=app';
    }
  }
}

// Render Native App Bottom Navigation Bar
function renderAppBottomNav() {
  if (!isAppMode()) return;
  injectAppModeStyles();

  let nav = document.getElementById('ebAppBottomNav');
  if (!nav) {
    nav = document.createElement('nav');
    nav.id = 'ebAppBottomNav';
    nav.setAttribute('aria-label', 'Mobile App Bottom Navigation');
    document.body.appendChild(nav);
  }
  nav.style.display = 'flex';

  const currentTab = getActiveTab();
  const cartCount = getAppCartCount();

  nav.innerHTML = `
    <button type="button" class="eb-app-tab ${currentTab === 'home' ? 'active' : ''}" onclick="onAppTabClick('home')" title="Home">
      <i class="fa-solid fa-house"></i>
      <span>Home</span>
    </button>
    <button type="button" class="eb-app-tab ${currentTab === 'menu' ? 'active' : ''}" onclick="onAppTabClick('menu')" title="Menu">
      <i class="fa-solid fa-utensils"></i>
      <span>Menu</span>
    </button>
    <button type="button" class="eb-app-tab ${currentTab === 'track' ? 'active' : ''}" onclick="onAppTabClick('track')" title="Track Orders">
      <i class="fa-solid fa-clock-rotate-left"></i>
      <span>Orders</span>
    </button>
    <button type="button" class="eb-app-tab ${currentTab === 'cart' ? 'active' : ''}" onclick="onAppTabClick('cart')" title="Cart" style="position:relative;">
      <i class="fa-solid fa-bag-shopping"></i>
      <span>Cart</span>
      <span id="ebAppCartBadge" class="eb-app-cart-badge" style="display:${cartCount > 0 ? 'inline-block' : 'none'};">${cartCount}</span>
    </button>
    <button type="button" class="eb-app-tab ${currentTab === 'profile' ? 'active' : ''}" onclick="onAppTabClick('profile')" title="Profile">
      <i class="fa-solid fa-user"></i>
      <span>Profile</span>
    </button>
  `;
}

// Enable App Mode (Hide web footer, display bottom navigation bar)
function enableAppMode(options = {}) {
  const { announce = false } = options;
  localStorage.setItem('eb_app_mode', 'true');
  document.documentElement.classList.add('app-mode');
  if (document.body) {
    document.body.classList.add('app-mode');
  }

  injectAppModeStyles();

  // Explicitly hide all web footers
  const footers = document.querySelectorAll('#main-footer, .page-footer, footer');
  footers.forEach(f => {
    f.style.setProperty('display', 'none', 'important');
  });

  renderAppBottomNav();
  syncPwaInstallButtons();

  if (announce) {
    showAppToast('📱 Ember & Brew App View active — Web footer removed', 3500);
  }
}

// Switch back to standard Web View (Restore web footer)
function disableAppMode() {
  localStorage.removeItem('eb_app_mode');
  document.documentElement.classList.remove('app-mode');
  if (document.body) {
    document.body.classList.remove('app-mode');
  }

  // Restore web footers
  const mainFooter = document.getElementById('main-footer');
  if (mainFooter) mainFooter.style.display = '';
  document.querySelectorAll('.page-footer, footer').forEach(f => {
    f.style.display = '';
  });

  // Hide App Bottom Nav
  const nav = document.getElementById('ebAppBottomNav');
  if (nav) nav.style.display = 'none';

  syncPwaInstallButtons();

  const brandModal = document.getElementById('ebAppBrandModal');
  if (brandModal) brandModal.style.display = 'none';

  showAppToast('Switched to Web View (Web footer restored)', 3000);
}

// Official Ember & Brew Luxury App Installation Engine
async function triggerPwaInstall() {
  // 1. Immediately switch into App Mode (Removes web footer & activates native app tab bar!)
  enableAppMode({ announce: true });

  // 2. If Android/Chrome native install prompt is captured, trigger it immediately
  if (deferredPwaPrompt) {
    deferredPwaPrompt.prompt();
    const choice = await deferredPwaPrompt.userChoice;
    if (choice && choice.outcome === 'accepted') {
      showAppToast('Installing Ember & Brew App to Home Screen...');
    }
    deferredPwaPrompt = null;
    return;
  }

  // 3. Otherwise, show luxury brand modal with App View confirmed and 1-tap installation guide
  showAppBrandModal();
}

function showAppBrandModal() {
  let modal = document.getElementById('ebAppBrandModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'ebAppBrandModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(15,14,12,0.92);backdrop-filter:blur(12px);z-index:99999999;display:flex;align-items:center;justify-content:center;padding:16px;font-family:"DM Sans",sans-serif;animation:modalFadeIn 0.2s ease-out;';
    
    modal.innerHTML = '<div style="background:#1A1917;border:1.5px solid #D4A853;border-radius:24px;padding:26px;max-width:380px;width:100%;color:#F5F0E8;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.9);position:relative;">' +
      '<button onclick="document.getElementById(\'ebAppBrandModal\').style.display=\'none\'" style="position:absolute;top:14px;right:14px;background:none;border:none;color:#8A8478;font-size:18px;cursor:pointer;padding:4px;"><i class="fa-solid fa-xmark"></i></button>' +
      '<div style="width:76px;height:76px;margin:0 auto 14px;border-radius:22px;border:2px solid #D4A853;overflow:hidden;box-shadow:0 8px 24px rgba(212,168,83,0.3);background:#0F0E0C;">' +
        '<img src="/images/app-logo.png" alt="Ember & Brew Logo" style="width:100%;height:100%;object-fit:cover;">' +
      '</div>' +
      '<h3 style="font-family:\'Playfair Display\',serif;font-size:21px;font-weight:700;color:#F5F0E8;margin:0 0 4px;">Ember &amp; Brew</h3>' +
      '<p style="font-size:11px;color:#D4A853;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;margin:0 0 14px;">Official Mobile App</p>' +
      '<div style="background:rgba(212,168,83,0.1);border:1px solid rgba(212,168,83,0.3);border-radius:12px;padding:10px 14px;margin-bottom:14px;display:flex;align-items:center;gap:10px;text-align:left;">' +
        '<i class="fa-solid fa-circle-check" style="color:#D4A853;font-size:18px;"></i>' +
        '<div style="font-size:12px;line-height:1.4;color:#F5F0E8;"><strong style="color:#D4A853;">App View Activated!</strong><br><span style="color:#D4C4A8;font-size:11.5px;">Web footer removed · Bottom app tabs ready</span></div>' +
      '</div>' +
      '<div style="background:#0F0E0C;border:1px solid #2E2C28;border-radius:16px;padding:14px;text-align:left;margin-bottom:18px;">' +
        '<p style="font-size:12.5px;color:#F5F0E8;font-weight:700;margin:0 0 8px;"><i class="fa-solid fa-mobile-screen-button" style="color:#D4A853;margin-right:6px;"></i>Add Icon to Home Screen:</p>' +
        '<div style="font-size:12px;color:#D4C4A8;line-height:1.5;">' +
          '<div style="margin-bottom:8px;"><strong>Android (Chrome):</strong> Tap <strong>⋮</strong> (top right) &rarr; Select <strong style="color:#D4A853;">"Install app"</strong> or <strong style="color:#D4A853;">"Add to Home screen"</strong>.</div>' +
          '<div><strong>iPhone (Safari):</strong> Tap <strong>Share <i class="fa-solid fa-arrow-up-from-bracket"></i></strong> &rarr; Select <strong style="color:#D4A853;">"Add to Home Screen"</strong>.</div>' +
        '</div>' +
      '</div>' +
      '<button onclick="document.getElementById(\'ebAppBrandModal\').style.display=\'none\'" style="width:100%;background:linear-gradient(135deg,#D4A853,#C4923A);color:#0F0E0C;font-weight:800;font-size:13px;padding:11px;border-radius:12px;border:none;cursor:pointer;margin-bottom:10px;">Continue in App View</button>' +
      '<button onclick="disableAppMode()" style="background:none;border:none;color:#8A8478;font-size:11.5px;cursor:pointer;text-decoration:underline;">Switch back to Web View (with footer)</button>' +
    '</div>';

    document.body.appendChild(modal);
  }
  modal.style.display = 'flex';
}

function showIosGuide() {
  showAppBrandModal();
}

// Bind to global window scope for inline onclick triggers
window.isAppMode = isAppMode;
window.enableAppMode = enableAppMode;
window.disableAppMode = disableAppMode;
window.triggerPwaInstall = triggerPwaInstall;
window.onAppTabClick = onAppTabClick;
window.renderAppBottomNav = renderAppBottomNav;

// Initialize on DOM Ready or Immediate if already parsed
function initPwaEngine() {
  if (isAppMode()) {
    enableAppMode({ announce: false });
  } else {
    syncPwaInstallButtons();
  }
  setInterval(updateAppCartBadge, 800);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPwaEngine);
} else {
  initPwaEngine();
}
