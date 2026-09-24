// Ember & Brew Official Mobile Order Notification Engine
// Real-Time System Notifications, Device Vibration, Audio Chimes & In-App Floating Banners

(function() {
  'use strict';

  // ============================================
  // STATUS DEFINITIONS & TEMPLATES
  // ============================================
  const STATUS_DETAILS = {
    pending_admin: {
      title: 'Order Received',
      label: 'Order Received',
      body: order => `Order #${order.orderNumber} has been received and confirmed.`,
      icon: 'fa-receipt',
      color: '#D4A853'
    },
    pending_kitchen: {
      title: 'Kitchen Confirmed',
      label: 'Order Confirmed',
      body: order => `Order #${order.orderNumber} is sent to the kitchen.`,
      icon: 'fa-utensils',
      color: '#E5A93C'
    },
    received: {
      title: 'Order Confirmed',
      label: 'Order Confirmed',
      body: order => `Order #${order.orderNumber} has been confirmed.`,
      icon: 'fa-utensils',
      color: '#E5A93C'
    },
    preparing: {
      title: 'Chef Cooking 👨‍🍳',
      label: 'Cooking Started',
      body: order => `Our kitchen has started preparing your fresh meal for order #${order.orderNumber}.`,
      icon: 'fa-fire-burner',
      color: '#F97316'
    },
    ready: {
      title: 'Order Ready! 📦',
      label: 'Ready for Handover',
      body: order => order.orderType === 'delivery'
        ? `Order #${order.orderNumber} is freshly packed and waiting for rider pickup.`
        : `Order #${order.orderNumber} is ready! Please collect it at the counter.`,
      icon: 'fa-box-open',
      color: '#10B981'
    },
    'out-for-delivery': {
      title: 'Out for Delivery 🛵',
      label: 'Rider on the Way',
      body: order => {
        const rider = order.deliveryBoyName ? ` with rider ${order.deliveryBoyName}` : '';
        const otp = order.otp ? ` • Your delivery OTP is ${order.otp}` : '';
        return `Order #${order.orderNumber} is on the way${rider}!${otp}`;
      },
      icon: 'fa-motorcycle',
      color: '#38BDF8'
    },
    delivered: {
      title: 'Order Delivered ✅',
      label: 'Delivered',
      body: order => `Order #${order.orderNumber} has arrived! Enjoy your delicious meal.`,
      icon: 'fa-circle-check',
      color: '#10B981'
    },
    completed: {
      title: 'Order Completed 🎉',
      label: 'Order Complete',
      body: order => `Order #${order.orderNumber} is completed. Thank you for dining with Ember & Brew!`,
      icon: 'fa-circle-check',
      color: '#10B981'
    },
    cancelled: {
      title: 'Order Cancelled ❌',
      label: 'Order Cancelled',
      body: order => `Order #${order.orderNumber} was cancelled. Please contact restaurant support.`,
      icon: 'fa-circle-xmark',
      color: '#EF4444'
    }
  };

  // ============================================
  // AUDIO & HAPTIC ENGINE
  // ============================================
  let audioContext = null;

  function getAudioContext() {
    if (!audioContext) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        audioContext = new AudioCtx();
      }
    }
    if (audioContext && audioContext.state === 'suspended') {
      audioContext.resume().catch(() => {});
    }
    return audioContext;
  }

  // Pre-unlock AudioContext on first tap or touch
  ['click', 'touchstart', 'touchend', 'keydown'].forEach(evt => {
    window.addEventListener(evt, () => {
      try { getAudioContext(); } catch (_) {}
    }, { once: true, passive: true });
  });

  // Synthesize a pleasant luxury chime (No external MP3 file dependency)
  function playNotificationChime() {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;

      // Note 1: E5 (659.25 Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(659.25, now);
      osc1.frequency.exponentialRampToValueAtTime(880, now + 0.15);
      gain1.gain.setValueAtTime(0.28, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.45);

      // Note 2: B5 (987.77 Hz) harmonic chime
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(987.77, now + 0.1);
      gain2.gain.setValueAtTime(0.22, now + 0.1);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.1);
      osc2.stop(now + 0.6);
    } catch (_) {}
  }

  // Physical mobile device vibration
  function vibrateDevice(pattern = [200, 100, 200, 100, 200]) {
    try {
      if ('vibrate' in navigator && typeof navigator.vibrate === 'function') {
        navigator.vibrate(pattern);
      }
    } catch (_) {}
  }

  // ============================================
  // NOTIFICATION PERMISSION REQUESTER
  // ============================================
  async function requestNotificationPermission() {
    if (!('Notification' in window)) return 'unsupported';
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission === 'denied') return 'denied';

    try {
      const res = await Notification.requestPermission();
      if (res === 'granted') {
        showAppNotificationBanner({
          title: 'Notifications Enabled! 🔔',
          body: 'You will receive real-time updates as your food is prepared and delivered.',
          icon: 'fa-bell',
          color: '#10B981',
          autoDismissMs: 4000
        });
      }
      return res;
    } catch (_) {
      return Notification.permission;
    }
  }

  // ============================================
  // SYSTEM TRAY NOTIFICATION (SERVICE WORKER)
  // ============================================
  function showSystemNotification(title, options = {}) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    const notifOptions = {
      body: options.body || 'Your order status has been updated.',
      icon: options.icon || '/images/icon-192.png',
      badge: options.badge || '/images/icon-192.png',
      vibrate: options.vibrate || [200, 100, 200, 100, 200],
      tag: options.tag || 'eb-order-status',
      renotify: true,
      data: options.data || { url: '/?view=tracking' }
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(reg => {
        if (reg && reg.showNotification) {
          reg.showNotification(title, notifOptions);
        } else if (navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({
            type: 'SHOW_NOTIFICATION',
            title,
            options: notifOptions
          });
        } else {
          new Notification(title, notifOptions);
        }
      }).catch(() => {
        try { new Notification(title, notifOptions); } catch (_) {}
      });
    } else {
      try { new Notification(title, notifOptions); } catch (_) {}
    }
  }

  // ============================================
  // FLOATING IN-APP MOBILE NOTIFICATION BANNER
  // ============================================
  function showAppNotificationBanner(data = {}) {
    const {
      title = 'Order Update',
      body = '',
      icon = 'fa-bell',
      color = '#D4A853',
      orderNumber = '',
      otp = '',
      autoDismissMs = 7000
    } = data;

    let banner = document.getElementById('ebMobileStatusFloatingBanner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'ebMobileStatusFloatingBanner';
      banner.style.cssText = `
        position: fixed;
        top: 14px;
        left: 50%;
        transform: translateX(-50%) translateY(-120%);
        width: calc(100% - 28px);
        max-width: 440px;
        background: rgba(18, 17, 15, 0.97);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1.5px solid ${color};
        border-radius: 18px;
        padding: 14px 16px;
        color: #F5F0E8;
        box-shadow: 0 12px 40px rgba(0, 0, 0, 0.8), 0 0 20px ${color}33;
        z-index: 10000020;
        font-family: -apple-system, BlinkMacSystemFont, "DM Sans", "Segoe UI", Roboto, sans-serif;
        display: flex;
        flex-direction: column;
        gap: 10px;
        transition: transform 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.3s ease;
        opacity: 0;
        box-sizing: border-box;
      `;
      document.body.appendChild(banner);
    } else {
      banner.style.borderColor = color;
      banner.style.boxShadow = `0 12px 40px rgba(0, 0, 0, 0.8), 0 0 20px ${color}33`;
    }

    const orderNumParam = orderNumber ? encodeURIComponent(orderNumber) : '';
    const trackClickCode = `window.onMobileNotificationTrackClick('${orderNumParam}')`;

    banner.innerHTML = `
      <div style="display:flex;align-items:flex-start;gap:12px;">
        <div style="width:38px;height:38px;border-radius:12px;background:${color}22;border:1px solid ${color};color:${color};display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">
          <i class="fa-solid ${icon}"></i>
        </div>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:2px;">
            <strong style="font-size:14px;color:#F5F0E8;font-weight:700;">${escapeHtml(title)}</strong>
            <button type="button" onclick="document.getElementById('ebMobileStatusFloatingBanner').style.transform='translateX(-50%) translateY(-140%)';document.getElementById('ebMobileStatusFloatingBanner').style.opacity='0';" style="background:none;border:none;color:#8A8478;cursor:pointer;padding:2px;font-size:15px;line-height:1;"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <p style="font-size:12.5px;color:#D4C4A8;line-height:1.4;margin:0 0 ${otp ? '6px' : '0'};">${escapeHtml(body)}</p>
          ${otp ? `
            <div style="display:inline-flex;align-items:center;gap:6px;background:${color}18;border:1px solid ${color}66;padding:3px 8px;border-radius:8px;font-size:11.5px;color:#F5F0E8;font-weight:700;letter-spacing:1px;margin-top:2px;">
              <i class="fa-solid fa-shield-halved" style="color:${color};"></i> OTP: <span style="font-size:13px;color:#FFF;">${escapeHtml(otp)}</span>
            </div>
          ` : ''}
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:2px;">
        <button type="button" onclick="${trackClickCode}" style="flex:1;background:linear-gradient(135deg,${color},#B3842C);color:#0F0E0C;border:none;border-radius:10px;padding:8px 12px;font-size:12px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;letter-spacing:0.3px;">
          <i class="fa-solid fa-location-dot"></i> View Live Tracking
        </button>
        <button type="button" onclick="document.getElementById('ebMobileStatusFloatingBanner').style.transform='translateX(-50%) translateY(-140%)';document.getElementById('ebMobileStatusFloatingBanner').style.opacity='0';" style="background:rgba(255,255,255,0.08);color:#C8BFB0;border:1px solid rgba(255,255,255,0.15);border-radius:10px;padding:8px 14px;font-size:12px;font-weight:600;cursor:pointer;">
          Dismiss
        </button>
      </div>
    `;

    banner.style.opacity = '1';
    banner.style.transform = 'translateX(-50%) translateY(0)';

    if (banner._dismissTimer) clearTimeout(banner._dismissTimer);
    if (autoDismissMs > 0) {
      banner._dismissTimer = setTimeout(() => {
        banner.style.transform = 'translateX(-50%) translateY(-140%)';
        banner.style.opacity = '0';
      }, autoDismissMs);
    }
  }

  // Handle clicking on the floating banner
  window.onMobileNotificationTrackClick = function(orderNum) {
    const banner = document.getElementById('ebMobileStatusFloatingBanner');
    if (banner) {
      banner.style.transform = 'translateX(-50%) translateY(-140%)';
      banner.style.opacity = '0';
    }
    const num = orderNum || localStorage.getItem('eb_last_order') || '';
    if (typeof window.navigate === 'function') {
      window.navigate('tracking', num);
    } else {
      window.location.href = '/?view=tracking' + (num ? '&orderNumber=' + encodeURIComponent(num) : '');
    }
  };

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  // ============================================
  // MASTER DISPATCHER: NOTIFY MOBILE STATUS
  // ============================================
  function notifyMobileOrderStatus(order, oldStatus, newStatus) {
    if (!order || !newStatus) return;
    const info = STATUS_DETAILS[newStatus] || STATUS_DETAILS.pending_admin;
    const title = info.title;
    const body = typeof info.body === 'function' ? info.body(order) : info.body;

    // 1. Play luxury audio chime
    playNotificationChime();

    // 2. Vibrate phone
    vibrateDevice([200, 100, 200, 100, 200]);

    // 3. Dispatch native OS system notification (lock screen & notification tray)
    showSystemNotification(`Ember & Brew — ${title}`, {
      body,
      icon: '/images/icon-192.png',
      badge: '/images/icon-192.png',
      tag: `eb-order-${order.orderNumber || 'active'}`,
      data: { url: `/?view=tracking&orderNumber=${encodeURIComponent(order.orderNumber || '')}` }
    });

    // 4. Show top floating in-app banner
    showAppNotificationBanner({
      title,
      body,
      icon: info.icon,
      color: info.color,
      orderNumber: order.orderNumber,
      otp: (newStatus === 'out-for-delivery') ? order.otp : '',
      autoDismissMs: 8000
    });

    // 5. Fire window event so any live tracking page updates smoothly
    window.dispatchEvent(new CustomEvent('eb:order-status-changed', {
      detail: { order, oldStatus, newStatus }
    }));
  }

  // ============================================
  // UNIVERSAL LIVE ORDER WATCHER (SOCKET + POLL)
  // ============================================
  let activeWatcherTimer = null;
  let activeWatcherSocket = null;
  let currentWatchedOrderNumber = null;

  function startOrderLiveWatcher(orderNumber) {
    const targetNum = (orderNumber || localStorage.getItem('eb_last_order') || '').trim();
    if (!targetNum) return;

    currentWatchedOrderNumber = targetNum;

    // Connect to Socket.IO for zero-latency instant updates if available
    try {
      if (typeof window.io === 'function' && !activeWatcherSocket) {
        activeWatcherSocket = window.io();
        activeWatcherSocket.emit('join-order', targetNum);
        activeWatcherSocket.on('order:status', data => {
          if (data && (data.orderNumber === targetNum || data.order?.orderNumber === targetNum)) {
            const fresh = data.order || data;
            handleOrderUpdate(fresh);
          }
        });
        activeWatcherSocket.on('order:update', fresh => {
          if (fresh && fresh.orderNumber === targetNum) {
            handleOrderUpdate(fresh);
          }
        });
      }
    } catch (_) {}

    // Polling fallback every 6 seconds
    if (activeWatcherTimer) clearInterval(activeWatcherTimer);
    activeWatcherTimer = setInterval(() => {
      checkActiveOrderStatus(targetNum);
    }, 6000);

    // Initial check right away
    checkActiveOrderStatus(targetNum);
  }

  function stopOrderLiveWatcher() {
    if (activeWatcherTimer) {
      clearInterval(activeWatcherTimer);
      activeWatcherTimer = null;
    }
  }

  async function checkActiveOrderStatus(orderNum) {
    if (!orderNum) return;
    try {
      const res = await fetch(`/api/orders/track/${encodeURIComponent(orderNum)}`);
      if (!res.ok) return;
      const fresh = await res.json();
      if (fresh && fresh.orderNumber) {
        handleOrderUpdate(fresh);
      }
    } catch (_) {}
  }

  function handleOrderUpdate(fresh) {
    if (!fresh || !fresh.orderNumber) return;
    const oldStatus = localStorage.getItem('eb_last_order_status') || 'pending_admin';
    const newStatus = fresh.status;

    if (newStatus && newStatus !== oldStatus) {
      localStorage.setItem('eb_last_order_status', newStatus);
      notifyMobileOrderStatus(fresh, oldStatus, newStatus);
    }

    // Stop intense polling once order reaches terminal states
    if (['completed', 'cancelled', 'delivered'].includes(newStatus)) {
      if (activeWatcherTimer) {
        clearInterval(activeWatcherTimer);
        // Slow heartbeat poller every 30s
        activeWatcherTimer = setInterval(() => checkActiveOrderStatus(fresh.orderNumber), 30000);
      }
    }
  }

  // ============================================
  // AUTO-INITIALIZE
  // ============================================
  function initOrderNotifications() {
    const lastNum = localStorage.getItem('eb_last_order');
    const lastStatus = localStorage.getItem('eb_last_order_status');
    if (lastNum && !['completed', 'cancelled'].includes(lastStatus)) {
      startOrderLiveWatcher(lastNum);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initOrderNotifications);
  } else {
    initOrderNotifications();
  }

  // Expose global API
  window.requestNotificationPermission = requestNotificationPermission;
  window.notifyMobileOrderStatus = notifyMobileOrderStatus;
  window.playNotificationChime = playNotificationChime;
  window.vibrateDevice = vibrateDevice;
  window.startOrderLiveWatcher = startOrderLiveWatcher;
  window.stopOrderLiveWatcher = stopOrderLiveWatcher;
  window.showAppNotificationBanner = showAppNotificationBanner;

  // Preserve legacy helper for backward compatibility
  window.getOrderPushToken = async function() {
    return await requestNotificationPermission();
  };
})();
