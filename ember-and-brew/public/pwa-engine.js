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

// Direct Download Action — No intermediate dialogs
function triggerPwaInstall() {
  const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent) && !window.MSStream;
  
  if (isIos) {
    showIosGuide();
    return;
  }

  // Direct download valid APK file
  showAppToast('Downloading Ember & Brew App... Tap Install when finished.');

  const link = document.createElement('a');
  link.href = 'https://files.catbox.moe/i9490k.apk';
  link.setAttribute('download', 'EmberAndBrew.apk');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
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
