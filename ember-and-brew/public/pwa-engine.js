// Ember & Brew Official Direct App Download & PWA Engine

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

function syncPwaInstallButtons() {
  const isInstalled = isStandaloneMode();
  const navBtn = document.getElementById('navInstallAppBtn');
  if (navBtn) {
    if (isInstalled) {
      navBtn.style.display = 'none';
      navBtn.setAttribute('aria-hidden', 'true');
    } else {
      navBtn.style.display = '';
      navBtn.removeAttribute('aria-hidden');
    }
  }
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
      z-index: 9999999;
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

// Official Ember & Brew Luxury App Installation Engine
async function triggerPwaInstall() {
  // If Android/Chrome native install prompt is captured, trigger it immediately
  if (deferredPwaPrompt) {
    deferredPwaPrompt.prompt();
    const choice = await deferredPwaPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      showAppToast('Installing Ember & Brew App...');
    }
    deferredPwaPrompt = null;
    return;
  }

  // Otherwise, show luxury brand modal with the official logo and 1-tap instructions
  showAppBrandModal();
}

function showAppBrandModal() {
  let modal = document.getElementById('ebAppBrandModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'ebAppBrandModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(15,14,12,0.92);backdrop-filter:blur(12px);z-index:9999999;display:flex;align-items:center;justify-content:center;padding:16px;font-family:"DM Sans",sans-serif;animation:modalFadeIn 0.2s ease-out;';
    
    modal.innerHTML = '<div style="background:#1A1917;border:1.5px solid #D4A853;border-radius:24px;padding:26px;max-width:380px;width:100%;color:#F5F0E8;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.9);position:relative;">' +
      '<button onclick="document.getElementById(\'ebAppBrandModal\').style.display=\'none\'" style="position:absolute;top:14px;right:14px;background:none;border:none;color:#8A8478;font-size:18px;cursor:pointer;padding:4px;"><i class="fa-solid fa-xmark"></i></button>' +
      '<div style="width:76px;height:76px;margin:0 auto 14px;border-radius:22px;border:2px solid #D4A853;overflow:hidden;box-shadow:0 8px 24px rgba(212,168,83,0.3);background:#0F0E0C;">' +
        '<img src="/images/app-logo.png" alt="Ember & Brew Logo" style="width:100%;height:100%;object-fit:cover;">' +
      '</div>' +
      '<h3 style="font-family:\'Playfair Display\',serif;font-size:21px;font-weight:700;color:#F5F0E8;margin:0 0 4px;">Ember &amp; Brew</h3>' +
      '<p style="font-size:11px;color:#D4A853;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;margin:0 0 16px;">Official Mobile App</p>' +
      '<div style="background:#0F0E0C;border:1px solid #2E2C28;border-radius:16px;padding:14px;text-align:left;margin-bottom:18px;">' +
        '<p style="font-size:12.5px;color:#F5F0E8;font-weight:700;margin:0 0 8px;"><i class="fa-solid fa-mobile-screen-button" style="color:#D4A853;margin-right:6px;"></i>How to Install on Home Screen:</p>' +
        '<div style="font-size:12px;color:#D4C4A8;line-height:1.5;">' +
          '<div style="margin-bottom:8px;"><strong>Android (Chrome):</strong> Tap <strong>⋮</strong> (top right) &rarr; Select <strong style="color:#D4A853;">"Install app"</strong> or <strong style="color:#D4A853;">"Add to Home screen"</strong>.</div>' +
          '<div><strong>iPhone (Safari):</strong> Tap <strong>Share <i class="fa-solid fa-arrow-up-from-bracket"></i></strong> &rarr; Select <strong style="color:#D4A853;">"Add to Home Screen"</strong>.</div>' +
        '</div>' +
      '</div>' +
      '<p style="font-size:11.5px;color:#8A8478;margin:0 0 16px;">Installs with official luxury icon &bull; Instant order updates</p>' +
      '<button onclick="document.getElementById(\'ebAppBrandModal\').style.display=\'none\'" style="width:100%;background:linear-gradient(135deg,#D4A853,#C4923A);color:#0F0E0C;font-weight:800;font-size:13px;padding:11px;border-radius:12px;border:none;cursor:pointer;">Understood</button>' +
    '</div>';

    document.body.appendChild(modal);
  }
  modal.style.display = 'flex';
}

function showIosGuide() {
  let guide = document.getElementById('ebIosGuideModal');
  if (!guide) {
    guide = document.createElement('div');
    guide.id = 'ebIosGuideModal';
    guide.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(15, 14, 12, 0.85);
      backdrop-filter: blur(8px);
      z-index: 999999;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    `;
    guide.innerHTML = `
      <div style="background:#1A1917;border:1.5px solid #D4A853;border-radius:20px;padding:22px;max-width:340px;width:100%;color:#F5F0E8;font-family:sans-serif;text-align:center;">
        <div style="font-size:16px;font-weight:700;margin-bottom:12px;color:#D4A853;">Install on iPhone / iPad</div>
        <p style="font-size:13px;color:#D4C4A8;line-height:1.5;margin-bottom:16px;">
          1. Tap the <strong style="color:#FFF;">Share</strong> button <i class="fa-solid fa-arrow-up-from-bracket" style="color:#D4A853;"></i> in Safari.<br>
          2. Scroll down & select <strong style="color:#FFF;">Add to Home Screen</strong> <i class="fa-regular fa-square-plus" style="color:#D4A853;"></i>.<br>
          3. Tap <strong style="color:#FFF;">Add</strong> to install.
        </p>
        <button onclick="document.getElementById('ebIosGuideModal').remove()" style="background:#D4A853;color:#0F0E0C;font-weight:bold;border:none;padding:8px 20px;border-radius:12px;cursor:pointer;font-size:13px;">Got it</button>
      </div>
    `;
    document.body.appendChild(guide);
  }
}

document.addEventListener('DOMContentLoaded', syncPwaInstallButtons);
