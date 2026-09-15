// Ember & Brew Official Mobile App & PWA Engine
// Supports both Direct Android APK Download and Instant Web App (PWA) Install

let deferredPwaPrompt = null;

// Register Service Worker & Proactively Auto-Update Cache
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => {
        reg.update();
        console.log('[App] Service Worker registered and updated:', reg.scope);
      })
      .catch(err => {
        console.warn('[App] Service Worker registration failed:', err);
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
    document.referrer.includes('android-app://') ||
    navigator.userAgent.includes('EmberAndBrewAndroidApp')
  );
}

// Update UI buttons based on installability
function syncPwaInstallButtons() {
  const isInstalled = isStandaloneMode();
  const installButtons = document.querySelectorAll('.pwa-install-btn, #navInstallAppBtn, #menuInstallBtn, .app-download-btn');

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
  closeAppModal();
  if (typeof showToast === 'function') {
    showToast('Ember & Brew App installed successfully!', 'success');
  }
});

// Trigger App Download / Install Modal
function triggerPwaInstall() {
  showAppModal();
}

function showAppModal() {
  let modal = document.getElementById('emberAppModal');
  if (!modal) {
    createAppModal();
    modal = document.getElementById('emberAppModal');
  }
  if (modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

function closeAppModal() {
  const modal = document.getElementById('emberAppModal');
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }
}

// Trigger Native PWA installation directly
async function triggerNativePwaInstall() {
  if (deferredPwaPrompt) {
    deferredPwaPrompt.prompt();
    const choice = await deferredPwaPrompt.userChoice;
    console.log('[PWA] User choice:', choice.outcome);
    if (choice.outcome === 'accepted') {
      deferredPwaPrompt = null;
      syncPwaInstallButtons();
      closeAppModal();
    }
  } else {
    // Show tab or message
    switchAppModalTab('pwa');
  }
}

function switchAppModalTab(tabName) {
  const apkTab = document.getElementById('tab-btn-apk');
  const pwaTab = document.getElementById('tab-btn-pwa');
  const apkContent = document.getElementById('tab-content-apk');
  const pwaContent = document.getElementById('tab-content-pwa');

  if (tabName === 'apk') {
    if (apkTab) apkTab.className = 'app-tab-btn active';
    if (pwaTab) pwaTab.className = 'app-tab-btn';
    if (apkContent) apkContent.style.display = 'block';
    if (pwaContent) pwaContent.style.display = 'none';
  } else {
    if (apkTab) apkTab.className = 'app-tab-btn';
    if (pwaTab) pwaTab.className = 'app-tab-btn active';
    if (apkContent) apkContent.style.display = 'none';
    if (pwaContent) pwaContent.style.display = 'block';
  }
}

function createAppModal() {
  const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent) && !window.MSStream;

  let pwaGuideHtml = '';
  if (isIos) {
    pwaGuideHtml = `
      <div class="guide-step">
        <span class="step-num">1</span>
        <span>Tap the <strong>Share</strong> button <i class="fa-solid fa-arrow-up-from-bracket text-brand-400"></i> in Safari toolbar.</span>
      </div>
      <div class="guide-step">
        <span class="step-num">2</span>
        <span>Scroll down and select <strong>Add to Home Screen</strong> <i class="fa-regular fa-square-plus text-brand-400"></i>.</span>
      </div>
      <div class="guide-step">
        <span class="step-num">3</span>
        <span>Tap <strong>Add</strong> in top-right to install the app icon.</span>
      </div>
    `;
  } else {
    pwaGuideHtml = `
      <div class="guide-step">
        <span class="step-num">1</span>
        <span>Tap the <strong>3 dots menu (<i class="fa-solid fa-ellipsis-vertical"></i>)</strong> in Chrome / Browser.</span>
      </div>
      <div class="guide-step">
        <span class="step-num">2</span>
        <span>Select <strong>Install App</strong> or <strong>Add to Home Screen</strong>.</span>
      </div>
      <div class="guide-step">
        <span class="step-num">3</span>
        <span>Confirm to place Ember & Brew on your phone screen.</span>
      </div>
    `;
  }

  const modalHtml = `
    <div id="emberAppModal" class="app-modal-overlay" onclick="if(event.target===this) closeAppModal()">
      <div class="app-modal-card">
        <button class="app-modal-close" onclick="closeAppModal()" aria-label="Close modal">
          <i class="fa-solid fa-xmark"></i>
        </button>

        <!-- Brand Header -->
        <div class="app-modal-brand">
          <img src="/images/app-logo.png" alt="Ember & Brew" class="app-modal-logo">
          <div>
            <h3>Ember & Brew</h3>
            <p>Official Mobile Application</p>
          </div>
        </div>

        <!-- Tab Selector -->
        <div class="app-modal-tabs">
          <button id="tab-btn-apk" class="app-tab-btn active" onclick="switchAppModalTab('apk')">
            <i class="fa-brands fa-android"></i> Android App (APK)
          </button>
          <button id="tab-btn-pwa" class="app-tab-btn" onclick="switchAppModalTab('pwa')">
            <i class="fa-solid fa-globe"></i> Web App (PWA)
          </button>
        </div>

        <!-- Tab 1: Android APK Download -->
        <div id="tab-content-apk" class="app-tab-content">
          <p class="tab-desc">Get the dedicated Ember & Brew Android application for fast orders and notifications.</p>

          <a href="/downloads/ember-and-brew.apk" download="ember-and-brew.apk" class="app-primary-dl-btn" onclick="trackApkDownload()">
            <i class="fa-solid fa-download"></i> Download Android APK
          </a>

          <div class="app-quick-guide">
            <h5><i class="fa-solid fa-circle-info"></i> How to Install APK:</h5>
            <div class="guide-step">
              <span class="step-num">1</span>
              <span>Tap <strong>Download APK</strong> above.</span>
            </div>
            <div class="guide-step">
              <span class="step-num">2</span>
              <span>Open the downloaded file from your browser downloads.</span>
            </div>
            <div class="guide-step">
              <span class="step-num">3</span>
              <span>Tap <strong>Install</strong> (Allow <em>"Install from this source"</em> if prompted).</span>
            </div>
          </div>
        </div>

        <!-- Tab 2: PWA Home Screen Install -->
        <div id="tab-content-pwa" class="app-tab-content" style="display:none;">
          <p class="tab-desc">Install Ember & Brew directly onto your Home Screen without downloading APK files.</p>

          ${deferredPwaPrompt ? `
            <button class="app-primary-dl-btn" onclick="triggerNativePwaInstall()">
              <i class="fa-solid fa-mobile-screen-button"></i> Add to Home Screen Now
            </button>
          ` : ''}

          <div class="app-quick-guide">
            <h5><i class="fa-solid fa-mobile-screen-button"></i> Installation Steps:</h5>
            ${pwaGuideHtml}
          </div>
        </div>

        <button class="app-modal-done-btn" onclick="closeAppModal()">
          Close
        </button>
      </div>
    </div>
  `;

  const div = document.createElement('div');
  div.innerHTML = modalHtml;
  document.body.appendChild(div.firstElementChild);
}

function trackApkDownload() {
  if (typeof showToast === 'function') {
    showToast('Downloading Ember & Brew APK... Check notifications when finished.', 'success');
  }
}

// Inject Modal CSS
(function injectAppModalStyles() {
  const style = document.createElement('style');
  style.id = 'ember-app-modal-styles';
  style.textContent = `
    .app-modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(15, 14, 12, 0.94);
      backdrop-filter: blur(14px);
      z-index: 999999;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
    .app-modal-overlay.active {
      display: flex;
    }
    .app-modal-card {
      background: #1A1917;
      border: 1.5px solid #D4A853;
      border-radius: 24px;
      padding: 24px;
      max-width: 420px;
      width: 100%;
      box-shadow: 0 24px 60px rgba(0,0,0,0.85);
      position: relative;
      color: #F5F0E8;
      font-family: 'DM Sans', sans-serif;
      animation: appModalPop 0.25s ease-out;
    }
    @keyframes appModalPop {
      0% { transform: scale(0.92); opacity: 0; }
      100% { transform: scale(1); opacity: 1; }
    }
    .app-modal-close {
      position: absolute;
      top: 16px;
      right: 16px;
      background: none;
      border: none;
      color: #8A8478;
      font-size: 18px;
      cursor: pointer;
      padding: 4px;
      line-height: 1;
    }
    .app-modal-close:hover { color: #F5F0E8; }
    .app-modal-brand {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
      padding-bottom: 14px;
      border-bottom: 1px solid #2E2C28;
    }
    .app-modal-logo {
      width: 46px;
      height: 46px;
      border-radius: 14px;
      border: 1.5px solid #D4A853;
      object-fit: cover;
    }
    .app-modal-brand h3 {
      font-family: 'Playfair Display', serif;
      font-size: 20px;
      margin: 0;
      color: #F5F0E8;
    }
    .app-modal-brand p {
      font-size: 11px;
      color: #D4A853;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      margin: 2px 0 0;
      font-weight: 600;
    }
    .app-modal-tabs {
      display: flex;
      gap: 8px;
      background: #0F0E0C;
      padding: 4px;
      border-radius: 12px;
      margin-bottom: 16px;
      border: 1px solid #2E2C28;
    }
    .app-tab-btn {
      flex: 1;
      background: transparent;
      border: none;
      color: #8A8478;
      padding: 8px 12px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: all 0.2s;
    }
    .app-tab-btn.active {
      background: #D4A853;
      color: #0F0E0C;
    }
    .tab-desc {
      font-size: 13px;
      color: #D4C4A8;
      margin: 0 0 14px;
      line-height: 1.4;
    }
    .app-primary-dl-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      background: linear-gradient(135deg, #D4A853, #C4923A);
      color: #0F0E0C;
      font-weight: 800;
      font-size: 14px;
      text-decoration: none;
      padding: 13px;
      border-radius: 14px;
      box-shadow: 0 6px 20px rgba(212,168,83,0.3);
      transition: transform 0.2s, box-shadow 0.2s;
      margin-bottom: 16px;
      cursor: pointer;
      border: none;
    }
    .app-primary-dl-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 26px rgba(212,168,83,0.45);
    }
    .app-quick-guide {
      background: #0F0E0C;
      border: 1px solid #2E2C28;
      border-radius: 14px;
      padding: 14px;
      margin-bottom: 16px;
    }
    .app-quick-guide h5 {
      font-size: 12px;
      font-weight: 700;
      color: #D4A853;
      margin: 0 0 10px;
      display: flex;
      align-items: center;
      gap: 6px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .guide-step {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      font-size: 12.5px;
      color: #D4C4A8;
      margin-bottom: 8px;
      line-height: 1.4;
    }
    .guide-step:last-child {
      margin-bottom: 0;
    }
    .step-num {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: #2E2C28;
      color: #D4A853;
      font-size: 11px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .app-modal-done-btn {
      width: 100%;
      background: transparent;
      border: 1px solid #3D3830;
      color: #8A8478;
      font-size: 13px;
      font-weight: 600;
      padding: 10px;
      border-radius: 12px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .app-modal-done-btn:hover {
      border-color: #8A8478;
      color: #F5F0E8;
    }
    @media (display-mode: standalone), (display-mode: fullscreen), (display-mode: minimal-ui) {
      .pwa-install-btn, #navInstallAppBtn, #menuInstallBtn, .app-download-btn {
        display: none !important;
      }
    }
  `;
  document.head.appendChild(style);
})();

document.addEventListener('DOMContentLoaded', syncPwaInstallButtons);
