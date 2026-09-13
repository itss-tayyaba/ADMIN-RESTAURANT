// Ember & Brew Official PWA Engine — Real Native Installation & iOS/Desktop Fallback
let deferredPwaPrompt = null;

// Register Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => {
        console.log('[PWA] Service Worker registered successfully:', reg.scope);
      })
      .catch(err => {
        console.warn('[PWA] Service Worker registration failed:', err);
      });
  });
}

// Check Standalone Mode
function isStandaloneMode() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    window.navigator.standalone === true ||
    document.referrer.includes('android-app://')
  );
}

// Update UI buttons based on installability
function syncPwaInstallButtons() {
  const isInstalled = isStandaloneMode();
  const installButtons = document.querySelectorAll('.pwa-install-btn, #navInstallAppBtn, #menuInstallBtn');

  installButtons.forEach(btn => {
    if (isInstalled) {
      btn.style.display = 'none';
      btn.setAttribute('aria-hidden', 'true');
    } else {
      btn.style.display = '';
      btn.removeAttribute('aria-hidden');
    }
  });
}

// Listen for the native beforeinstallprompt event
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPwaPrompt = e;
  console.log('[PWA] Native beforeinstallprompt captured and ready');
  syncPwaInstallButtons();
});

// Listen for successful installation
window.addEventListener('appinstalled', () => {
  console.log('[PWA] Ember & Brew App installed successfully');
  deferredPwaPrompt = null;
  syncPwaInstallButtons();
  closePwaFallbackModal();
  if (typeof showToast === 'function') {
    showToast('Ember & Brew App installed successfully!', 'success');
  }
});

// Trigger Real PWA Installation
async function triggerPwaInstall() {
  if (isStandaloneMode()) {
    if (typeof showToast === 'function') {
      showToast('You are already using the installed Ember & Brew App!', 'info');
    }
    return;
  }

  // 1. Real Native Prompt available (Chrome Android, Chrome Desktop, Edge, Samsung Internet)
  if (deferredPwaPrompt) {
    deferredPwaPrompt.prompt();
    const choice = await deferredPwaPrompt.userChoice;
    console.log('[PWA] User choice:', choice.outcome);
    if (choice.outcome === 'accepted') {
      deferredPwaPrompt = null;
      syncPwaInstallButtons();
    }
    return;
  }

  // 2. Fallback instructions modal (iOS Safari, Firefox, or unsupported desktop)
  showPwaFallbackModal();
}

// Show platform-tailored installation guide modal
function showPwaFallbackModal() {
  let modal = document.getElementById('pwaFallbackModal');
  if (!modal) {
    createPwaFallbackModal();
    modal = document.getElementById('pwaFallbackModal');
  }
  if (modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

function closePwaFallbackModal() {
  const modal = document.getElementById('pwaFallbackModal');
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }
}

function createPwaFallbackModal() {
  const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isMac = /Macintosh|Mac OS X/.test(navigator.userAgent);

  let instructionsHtml = '';
  if (isIos) {
    instructionsHtml = '<h4><i class="fa-brands fa-apple" style="color:#D4A853;"></i> Install on iPhone / iPad:</h4>' +
      '<ol>' +
      '<li>Tap the <strong>Share</strong> button <i class="fa-solid fa-arrow-up-from-bracket" style="color:#D4A853;"></i> at the bottom of Safari.</li>' +
      '<li>Scroll down and tap <strong>Add to Home Screen</strong> <i class="fa-regular fa-square-plus" style="color:#D4A853;"></i>.</li>' +
      '<li>Tap <strong>Add</strong> in the top-right corner.</li>' +
      '</ol>';
  } else if (isMac) {
    instructionsHtml = '<h4><i class="fa-solid fa-laptop" style="color:#D4A853;"></i> Install on Mac / Chrome:</h4>' +
      '<ol>' +
      '<li>Click the <strong>Install icon <i class="fa-solid fa-download" style="color:#D4A853;"></i></strong> on the right side of the address bar.</li>' +
      '<li>Or click the <strong>3 dots menu (<i class="fa-solid fa-ellipsis-vertical"></i>)</strong> in Chrome &rarr; <strong>Install Ember & Brew</strong>.</li>' +
      '</ol>';
  } else {
    instructionsHtml = '<h4><i class="fa-solid fa-mobile-screen-button" style="color:#D4A853;"></i> Install on your device:</h4>' +
      '<ol>' +
      '<li>Tap your browser menu button <strong>(<i class="fa-solid fa-ellipsis-vertical"></i>)</strong> in the top-right corner.</li>' +
      '<li>Select <strong>Install App</strong> or <strong>Add to Home screen</strong>.</li>' +
      '<li>Confirm to add Ember & Brew directly to your apps.</li>' +
      '</ol>';
  }

  const modalHtml = '<div id="pwaFallbackModal" class="pwa-fallback-overlay" onclick="if(event.target===this) closePwaFallbackModal()">' +
    '<div class="pwa-fallback-card">' +
      '<button class="pwa-fallback-close" onclick="closePwaFallbackModal()" aria-label="Close modal">' +
        '<i class="fa-solid fa-xmark"></i>' +
      '</button>' +
      '<div class="pwa-fallback-brand">' +
        '<img src="/images/app-logo.png" alt="Ember & Brew" class="pwa-fallback-logo">' +
        '<div>' +
          '<h3>Ember & Brew</h3>' +
          '<p>Artisan Kitchen & Café</p>' +
        '</div>' +
      '</div>' +
      '<div class="pwa-fallback-content">' +
        instructionsHtml +
      '</div>' +
      '<button class="pwa-fallback-done-btn" onclick="closePwaFallbackModal()">' +
        'Got It' +
      '</button>' +
    '</div>' +
  '</div>';

  const div = document.createElement('div');
  div.innerHTML = modalHtml;
  document.body.appendChild(div.firstElementChild);
}

// Inject fallback modal CSS
(function injectPwaStyles() {
  const style = document.createElement('style');
  style.id = 'pwa-engine-styles';
  style.textContent = `
    .pwa-fallback-overlay {
      position: fixed;
      inset: 0;
      background: rgba(15, 14, 12, 0.92);
      backdrop-filter: blur(12px);
      z-index: 999999;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
    .pwa-fallback-overlay.active {
      display: flex;
    }
    .pwa-fallback-card {
      background: #1A1917;
      border: 1.5px solid #D4A853;
      border-radius: 24px;
      padding: 24px;
      max-width: 380px;
      width: 100%;
      box-shadow: 0 20px 50px rgba(0,0,0,0.85);
      position: relative;
      color: #F5F0E8;
      font-family: 'DM Sans', sans-serif;
      animation: pwaPop 0.25s ease-out;
    }
    @keyframes pwaPop {
      0% { transform: scale(0.92); opacity: 0; }
      100% { transform: scale(1); opacity: 1; }
    }
    .pwa-fallback-close {
      position: absolute;
      top: 16px;
      right: 16px;
      background: none;
      border: none;
      color: #8A8478;
      font-size: 18px;
      cursor: pointer;
      padding: 4px;
    }
    .pwa-fallback-close:hover { color: #F5F0E8; }
    .pwa-fallback-brand {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
      padding-bottom: 14px;
      border-bottom: 1px solid #2E2C28;
    }
    .pwa-fallback-logo {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      border: 1.5px solid #D4A853;
      object-fit: cover;
    }
    .pwa-fallback-brand h3 {
      font-family: 'Playfair Display', serif;
      font-size: 18px;
      margin: 0;
      color: #F5F0E8;
    }
    .pwa-fallback-brand p {
      font-size: 11px;
      color: #D4A853;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin: 2px 0 0;
    }
    .pwa-fallback-content h4 {
      font-size: 14px;
      font-weight: 700;
      margin: 0 0 12px;
      color: #F5F0E8;
    }
    .pwa-fallback-content ol {
      margin: 0 0 20px;
      padding-left: 20px;
      font-size: 13px;
      color: #D4C4A8;
      line-height: 1.6;
    }
    .pwa-fallback-content li {
      margin-bottom: 8px;
    }
    .pwa-fallback-done-btn {
      width: 100%;
      background: #D4A853;
      color: #0F0E0C;
      font-weight: 700;
      font-size: 14px;
      border: none;
      border-radius: 14px;
      padding: 12px;
      cursor: pointer;
      transition: background 0.2s ease;
    }
    .pwa-fallback-done-btn:hover { background: #e2b963; }
    @media (display-mode: standalone), (display-mode: fullscreen), (display-mode: minimal-ui) {
      .pwa-install-btn, #navInstallAppBtn, #menuInstallBtn {
        display: none !important;
      }
    }
  `;
  document.head.appendChild(style);
})();

document.addEventListener('DOMContentLoaded', syncPwaInstallButtons);
