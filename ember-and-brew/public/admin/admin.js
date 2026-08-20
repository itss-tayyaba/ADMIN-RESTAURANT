(() => {
  'use strict';

  // ---------- Auth guard ----------
  const token = localStorage.getItem('eb_admin_token');
  if (!token) {
    window.location.href = 'login.html';
    return;
  }
  const user = JSON.parse(localStorage.getItem('eb_admin_user') || '{"username":"Admin","role":"admin"}');

  // A superadmin has no home branch of their own, so they can only open
  // this dashboard "as" a specific branch — reached by clicking into a
  // branch from /superadmin, which links here as /admin?branchId=<id>.
  // Without that param there is nothing for this dashboard to show, so
  // send them back to pick one.
  let viewingBranchId = null;
  if (user.role !== 'admin') {
    if (user.role === 'superadmin') {
      viewingBranchId = new URLSearchParams(window.location.search).get('branchId');
      if (!viewingBranchId) {
        window.location.href = '/superadmin';
        return;
      }
      // Falls through — a superadmin with a branchId is allowed to use
      // this dashboard exactly like that branch's own admin would.
    } else if (user.role === 'chef') {
      window.location.href = '/kitchen';
      return;
    } else if (user.role === 'delivery') {
      window.location.href = '/delivery';
      return;
    } else {
      window.location.href = 'login.html';
      return;
    }
  }

  // Every branch-scoped endpoint in this dashboard (orders, menu,
  // reservations, tables, complaints, delivery/riders) reads an optional
  // ?branchId= query param for a superadmin (see src/utils/branchScope.js
  // on the server). Rather than threading viewingBranchId through all 27
  // fetch() call sites in this file, transparently stamp it onto every
  // same-origin /api/ request this dashboard makes. A no-op for a normal
  // branch admin, since viewingBranchId is null for them.
  if (viewingBranchId) {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      try {
        if (typeof input === 'string' && input.startsWith('/api/')) {
          const sep = input.includes('?') ? '&' : '?';
          input = input + sep + 'branchId=' + encodeURIComponent(viewingBranchId);
        }
      } catch (_) { /* fall through and fetch the original input untouched */ }
      return nativeFetch(input, init);
    };
  }

  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + token
  };

  // ---------- Table QR ordering ----------
  // Change this to your real customer-facing ordering route once it exists.
  // Defaults to same-origin so it works out of the box in any environment.
  // Your storefront is a single-page app — everything lives at the root
  // URL, there's no separate /order route. The customer's phone just needs
  // to land on that page with ?table=... in the query string.
  const CUSTOMER_ORDER_BASE_URL = 'https://admin-restaurant-six.vercel.app';

  function buildTableOrderUrl(tableNumber) {
    return `${CUSTOMER_ORDER_BASE_URL}?table=${encodeURIComponent(tableNumber)}`;
  }

  // Renders a QR code into `container` and returns the element itself so
  // callers can read the image data back out (e.g. for printing).
  function renderQrInto(container, text) {
    container.innerHTML = '';
    if (typeof QRCode === 'undefined') {
      container.innerHTML = '<div style="font-size:12px;color:#b23">QR library failed to load — check your internet connection.</div>';
      return null;
    }
    return new QRCode(container, {
      text,
      width: 220,
      height: 220,
      colorDark: '#1A1913',
      colorLight: '#FFFFFF',
      correctLevel: QRCode.CorrectLevel.M
    });
  }

  // qrcodejs draws to a <canvas> then swaps in an <img> a tick later — read
  // whichever is present so "Print" works regardless of timing.
  function getQrImageSrc(container) {
    const img = container.querySelector('img');
    if (img && img.src) return img.src;
    const canvas = container.querySelector('canvas');
    if (canvas) return canvas.toDataURL('image/png');
    return null;
  }

  function printQrCard(tableNumber, imgSrc, url) {
    const win = window.open('', '_blank', 'width=420,height=560');
    if (!win) { showToast('Please allow pop-ups to print the QR card.', true); return; }
    win.document.write(`
      <!DOCTYPE html><html><head><title>Table ${tableNumber} — QR</title>
      <style>
        body{ font-family:'DM Sans',Arial,sans-serif; text-align:center; padding:40px 20px; }
        h1{ font-family:'Playfair Display',Georgia,serif; font-size:22px; margin:0 0 4px; }
        p{ color:#555; font-size:13px; margin:0 0 24px; }
        img{ width:240px; height:240px; }
        .table-name{ font-size:28px; font-weight:700; margin-top:18px; }
        .url{ font-size:11px; color:#888; margin-top:10px; word-break:break-all; }
      </style></head>
      <body>
        <h1>Ember &amp; Brew</h1>
        <p>Scan to view the menu &amp; order</p>
        <img src="${imgSrc}" alt="QR code for table ${escapeHtml(tableNumber)}" />
        <div class="table-name">${escapeHtml(tableNumber)}</div>
        <div class="url">${escapeHtml(url)}</div>
        <script>window.onload = () => { window.print(); };<\/script>
      </body></html>
    `);
    win.document.close();
  }

  function showTableQrModal(tableNumber) {
    const existing = document.getElementById('tableQrModal');
    if (existing) existing.remove();

    const url = buildTableOrderUrl(tableNumber);
    const modal = document.createElement('div');
    modal.id = 'tableQrModal';
    modal.className = 'qr-modal-overlay';
    modal.innerHTML = `
      <div class="qr-modal-card">
        <button class="qr-modal-close" id="tableQrModalClose" aria-label="Close">&times;</button>
        <div class="qr-modal-brand">Ember &amp; Brew</div>
        <div class="qr-modal-sub">Scan to view the menu &amp; order</div>
        <div class="qr-modal-code" id="tableQrCode"></div>
        <div class="qr-modal-table">${escapeHtml(tableNumber)}</div>
        <div class="qr-modal-url">${escapeHtml(url)}</div>
        <div class="qr-modal-actions">
          <button class="btn-ghost" id="tableQrPrint">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:5px;">
              <polyline points="6 9 6 2 18 2 18 9"></polyline>
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
              <rect x="6" y="14" width="12" height="8"></rect>
            </svg>Print
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const codeEl = document.getElementById('tableQrCode');
    renderQrInto(codeEl, url);

    document.getElementById('tableQrModalClose').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    document.getElementById('tableQrPrint').addEventListener('click', () => {
      const imgSrc = getQrImageSrc(codeEl);
      if (!imgSrc) { showToast('QR not ready yet — try again in a second.', true); return; }
      printQrCard(tableNumber, imgSrc, url);
    });
  }


  // ----- Socket.IO real-time notifications -----
  let socket = null;
  try {
    if (typeof io !== 'undefined') {
      socket = io();
      socket.on('connect', () => console.log('socket connected', socket.id));
      socket.on('order:update', (order) => {
        // When order becomes ready, show stronger notification
        if (order.status === 'ready') {
          // toast
          showToast(`Order ${order.orderNumber || order._id} is READY — send to service`, false);
          // desktop notification
          try {
            if (window.Notification) {
              if (Notification.permission === 'granted') {
                new Notification(`Order ${order.orderNumber || order._id} is READY`, { body: 'Prepared by kitchen — ready to deliver' });
              } else if (Notification.permission !== 'denied') {
                Notification.requestPermission().then(p => { if (p === 'granted') new Notification(`Order ${order.orderNumber || order._id} is READY`, { body: 'Prepared by kitchen — ready to deliver' }); });
              }
            }
          } catch (e) { /* ignore */ }
          // modal
          showOrderModal(order);
          // Delivery orders with a region are assigned to a rider automatically —
          // no admin click required. The server picks the rider with the fewest
          // active orders in that region.
          if (order.orderType === 'delivery' && order.region) {
            tryAutoAssign(order._id, order.orderNumber);
          }
        }
        // keep views fresh
        if (currentView === 'orders') loadOrders();
        if (currentView === 'overview') loadOverview();
      });
    }
  } catch (e) { console.warn('Socket init failed', e); }

  // create a simple modal for admin alerts
  function showOrderModal(order) {
    // remove any existing
    const existing = document.getElementById('adminOrderModal');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'adminOrderModal';
    modal.style.position = 'fixed';
    modal.style.left = '0';
    modal.style.top = '0';
    modal.style.right = '0';
    modal.style.bottom = '0';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.zIndex = '9999';
    modal.innerHTML = `
      <div style="background:rgba(10,10,10,0.94);padding:22px 24px;border-radius:12px;max-width:680px;width:95%;box-shadow:0 30px 80px rgba(0,0,0,0.6);color:#fff">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <div>
            <h3 style="margin:0;font-family:'Playfair Display',serif">Order ${order.orderNumber || order._id} is READY</h3>
            <div style="color:#cfcfcf;font-size:13px;margin-top:6px">Prepared and ready for delivery/service</div>
          </div>
          <div><button id="adminOrderModalClose" style="background:var(--accent-2);border:none;color:#fff;padding:8px 12px;border-radius:10px;cursor:pointer">Dismiss</button></div>
        </div>
        <div style="max-height:320px;overflow:auto;padding-top:6px;color:#ddd">
          <strong>Items:</strong>
          <ul style="margin-top:8px">
            ${ (order.items || []).map(i => `<li style=\"margin-bottom:6px\">${i.qty}× ${escapeHtml(i.name || i)} </li>`).join('') }
          </ul>
          <div style="margin-top:8px"><strong>Notes:</strong><div style="color:#cfcfcf;margin-top:6px">${escapeHtml(order.notes || '—')}</div></div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    document.getElementById('adminOrderModalClose').addEventListener('click', () => modal.remove());
  }


  function handleAuthFailure(res) {
    if (res.status === 401) {
      localStorage.removeItem('eb_admin_token');
      localStorage.removeItem('eb_admin_user');
      window.location.href = 'login.html';
      return true;
    }
    return false;
  }

  // Parses a response as JSON without throwing on empty bodies, HTML error
  // pages, or network hiccups — returns {} instead so callers can check
  // res.ok themselves and show a real error rather than a parse crash.
  async function safeJson(res) {
    const text = await res.text();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      return { error: `Server returned an unexpected response (status ${res.status}). Is the server running and connected to MongoDB?` };
    }
  }

  // ---------- Elements ----------
  const els = {
    navItems: document.querySelectorAll('.nav-item'),
    views: {
      overview: document.getElementById('view-overview'),
      orders: document.getElementById('view-orders'),
      menu: document.getElementById('view-menu'),
      reservations: document.getElementById('view-reservations'),
      floorplans: document.getElementById('view-floorplans'),
      complaints: document.getElementById('view-complaints'),
      riders: document.getElementById('view-riders')
    },
    pageTitle: document.getElementById('pageTitle'),
    todayDate: document.getElementById('todayDate'),
    userName: document.getElementById('userName'),
    userRole: document.getElementById('userRole'),
    avatarInitial: document.getElementById('avatarInitial'),
    logoutBtn: document.getElementById('logoutBtn'),

    statRevenue: document.getElementById('statRevenue'),
    statRevenueSub: document.getElementById('statRevenueSub'),
    statToday: document.getElementById('statToday'),
    statPending: document.getElementById('statPending'),
    statMenuCount: document.getElementById('statMenuCount'),
    statMenuSub: document.getElementById('statMenuSub'),
    statComplaints: document.getElementById('statComplaints'),
    statComplaintsSub: document.getElementById('statComplaintsSub'),
    recentOrdersBody: document.getElementById('recentOrdersBody'),
    popularDishesBody: document.getElementById('popularDishesBody'),
    weeklyRevenueAmount: document.getElementById('weeklyRevenueAmount'),
    weeklyRevenueChange: document.getElementById('weeklyRevenueChange'),
    weeklyRevenueBars: document.getElementById('weeklyRevenueBars'),
    revenueMiniStats: document.getElementById('revenueMiniStats'),
    orderTypeDonut: document.getElementById('orderTypeDonut'),
    orderTypeDonutTotal: document.getElementById('orderTypeDonutTotal'),
    orderTypeLegend: document.getElementById('orderTypeLegend'),

    complaintsBadge: document.getElementById('complaintsBadge'),
    complaintFilterTabs: document.getElementById('complaintFilterTabs'),
    complaintsList: document.getElementById('complaintsList'),
    reservationsBadge: document.getElementById('reservationsBadge'),
    reservationFilterTabs: document.getElementById('reservationFilterTabs'),
    reservationsBody: document.getElementById('reservationsBody'),
    bookingTotal: document.getElementById('bookingTotal'),
    bookingPending: document.getElementById('bookingPending'),
    bookingConfirmed: document.getElementById('bookingConfirmed'),
    bookingCompleted: document.getElementById('bookingCompleted'),
    bookingUpcomingCount: document.getElementById('bookingUpcomingCount'),
    bookingUpcomingList: document.getElementById('bookingUpcomingList'),
    floorMap: document.getElementById('floorMap'), tableTotal: document.getElementById('tableTotal'), tableAvailable: document.getElementById('tableAvailable'), tableReserved: document.getElementById('tableReserved'),
    floorFilters: document.getElementById('floorFilters'), toggleTableForm: document.getElementById('toggleTableForm'), addTableForm: document.getElementById('addTableForm'), newTableNumber: document.getElementById('newTableNumber'), newTableSeats: document.getElementById('newTableSeats'), newTableArea: document.getElementById('newTableArea'),
    cancelAddTable: document.getElementById('cancelAddTable'), floorplanDate: document.getElementById('floorplanDate'),

    newReservationBtn: document.getElementById('newReservationBtn'),
    reservationModalBackdrop: document.getElementById('reservationModalBackdrop'),
    reservationForm: document.getElementById('reservationForm'),
    reservationModalCancel: document.getElementById('reservationModalCancel'),
    reservationFormError: document.getElementById('reservationFormError'),
    resGuestName: document.getElementById('resGuestName'),
    resPhone: document.getElementById('resPhone'),
    resEmail: document.getElementById('resEmail'),
    resDate: document.getElementById('resDate'),
    resTime: document.getElementById('resTime'),
    resGuests: document.getElementById('resGuests'),
    resTable: document.getElementById('resTable'),
    resNotes: document.getElementById('resNotes'),

    orderFilterTabs: document.getElementById('orderFilterTabs'),
    ordersBody: document.getElementById('ordersBody'),

    menuCategoryTabs: document.getElementById('menuCategoryTabs'),
    menuGrid: document.getElementById('menuGrid'),
    menuCountLabel: document.getElementById('menuCountLabel'),
    addItemBtn: document.getElementById('addItemBtn'),

    itemModalBackdrop: document.getElementById('itemModalBackdrop'),
    itemModalTitle: document.getElementById('itemModalTitle'),
    itemForm: document.getElementById('itemForm'),
    itemId: document.getElementById('itemId'),
    itemName: document.getElementById('itemName'),
    itemDescription: document.getElementById('itemDescription'),
    itemPrice: document.getElementById('itemPrice'),
    itemCategory: document.getElementById('itemCategory'),
    itemImage: document.getElementById('itemImage'),
    itemAvailable: document.getElementById('itemAvailable'),
    itemFormError: document.getElementById('itemFormError'),
    itemModalCancel: document.getElementById('itemModalCancel'),
    categoryList: document.getElementById('categoryList'),

    ridersBody: document.getElementById('ridersBody'),
    ridersCountLabel: document.getElementById('ridersCountLabel'),
    addRiderBtn: document.getElementById('addRiderBtn'),

    riderModalBackdrop: document.getElementById('riderModalBackdrop'),
    riderModalTitle: document.getElementById('riderModalTitle'),
    riderForm: document.getElementById('riderForm'),
    riderId: document.getElementById('riderId'),
    riderUsername: document.getElementById('riderUsername'),
    riderUsernameField: document.getElementById('riderUsernameField'),
    riderPassword: document.getElementById('riderPassword'),
    riderPasswordField: document.getElementById('riderPasswordField'),
    riderName: document.getElementById('riderName'),
    riderNameField: document.getElementById('riderNameField'),
    riderPhone: document.getElementById('riderPhone'),
    riderRegion: document.getElementById('riderRegion'),
    riderFormError: document.getElementById('riderFormError'),
    riderModalCancel: document.getElementById('riderModalCancel'),

    toast: document.getElementById('toast')
  };

  // Table edit option removed — edit modal elements omitted

  let allOrders = [];
  let prevOrdersMap = new Map(); // track previous statuses to notify of changes
  let allMenuItems = [];
  let allComplaints = [];
  let currentReservationFilter = '';
  let allReservations = [];
  let restaurantTables = [];
  let currentTableArea = '';
  let currentOrderFilter = '';
  let currentMenuCategory = '';
  let currentComplaintFilter = '';
  let deliveryRiders = []; // active riders only, for the orders-view assign dropdown
  let allRiders = [];      // every rider (active + inactive), for the Riders view
  let regions = [];
  let maxActiveOrders = 5;

  // ---------- Delivery riders ----------
  async function loadRiders() {
    try {
      const res = await fetch('/api/delivery/riders', { headers: authHeaders });
      if (handleAuthFailure(res)) return;
      const data = await safeJson(res);
      if (res.ok && data.success) {
        allRiders = data.riders || [];
        deliveryRiders = allRiders.filter(r => r.active);
        if (data.regions) regions = data.regions;
        if (data.maxActiveOrders) maxActiveOrders = data.maxActiveOrders;
      }
    } catch { /* silent — assign dropdown just stays empty */ }
  }

  async function assignRider(orderId, riderId, orderNumber) {
    if (!riderId) { showToast('Choose a rider first', true); return; }
    try {
      const res = await fetch(`/api/delivery/${orderId}/assign`, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({ riderId })
      });
      if (handleAuthFailure(res)) return;
      const data = await safeJson(res);
      if (!res.ok || !data.success) throw new Error(data.message || 'Could not assign rider');
      showToast(`${orderNumber} sent out for delivery`);
      loadOrders();
    } catch (err) {
      showToast(err.message || 'Could not assign rider', true);
    }
  }

  // Orders are assigned to a rider automatically as soon as they're ready —
  // the admin never has to click anything. These two sets just stop us from
  // firing duplicate requests (in-flight guard) or re-toasting the same
  // "no rider yet" state on every poll (already-notified guard).
  const autoAssignInFlight = new Set();
  const autoAssignNoRider = new Set();

  async function tryAutoAssign(orderId, orderNumber) {
    if (!orderId || autoAssignInFlight.has(orderId)) return;
    autoAssignInFlight.add(orderId);
    try {
      const res = await fetch(`/api/delivery/${orderId}/auto-assign`, {
        method: 'PUT',
        headers: authHeaders
      });
      if (handleAuthFailure(res)) return;
      const data = await safeJson(res);
      if (res.ok && data.success) {
        autoAssignNoRider.delete(orderId);
        showToast(data.message || `${orderNumber} auto-assigned to a rider`);
        loadOrders();
        if (currentView === 'overview') loadOverviewLite();
      } else if (!autoAssignNoRider.has(orderId)) {
        // No rider available right now — don't error-toast on every retry,
        // just note it once. We'll keep retrying quietly (poll + socket
        // events) until a rider frees up or one is added.
        autoAssignNoRider.add(orderId);
      }
    } catch (err) {
      // network hiccup — will retry on the next poll/socket event
    } finally {
      autoAssignInFlight.delete(orderId);
    }
  }

  // ---------- Delivery Riders view ----------
  function populateRegionSelect(selectEl, selected) {
    selectEl.innerHTML = regions.map(r => `<option value="${escapeHtml(r)}" ${r === selected ? 'selected' : ''}>${escapeHtml(r)}</option>`).join('');
  }

  async function refreshRidersView() {
    els.ridersBody.innerHTML = '<tr><td colspan="6" class="empty-state">Loading…</td></tr>';
    await loadRiders();
    renderRidersTable();
  }

  function renderRidersTable() {
    els.ridersCountLabel.textContent = allRiders.length
      ? `${allRiders.length} rider${allRiders.length === 1 ? '' : 's'} · max ${maxActiveOrders} active orders each`
      : 'No riders yet';

    if (!allRiders.length) {
      els.ridersBody.innerHTML = '<tr><td colspan="6" class="empty-state">No delivery riders yet. Add one to get started.</td></tr>';
      return;
    }

    els.ridersBody.innerHTML = allRiders.map(r => `
      <tr>
        <td>${escapeHtml(r.name || r.username)}</td>
        <td class="cust">${escapeHtml(r.username)}</td>
        <td>${r.phone ? escapeHtml(r.phone) : '<span class="cust">Not set</span>'}</td>
        <td>${r.region ? escapeHtml(r.region) : '<span class="cust">Not set</span>'}</td>
        <td>${r.activeOrders || 0}/${maxActiveOrders}</td>
        <td><span class="badge ${r.active ? 'delivered' : 'cancelled'}">${r.active ? 'active' : 'inactive'}</span></td>
        <td style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="reply-save-btn change-region-btn" data-id="${r._id}" data-region="${escapeHtml(r.region || '')}" data-name="${escapeHtml(r.name || r.username)}" data-phone="${escapeHtml(r.phone || '')}">Edit Rider</button>
          <button class="btn-ghost toggle-rider-btn" data-id="${r._id}" style="padding:6px 12px;font-size:12px;">${r.active ? 'Deactivate' : 'Activate'}</button>
        </td>
      </tr>
    `).join('');

    els.ridersBody.querySelectorAll('.change-region-btn').forEach(btn => {
      btn.addEventListener('click', () => openRiderModal({ mode: 'edit', id: btn.dataset.id, region: btn.dataset.region, name: btn.dataset.name, phone: btn.dataset.phone }));
    });

    els.ridersBody.querySelectorAll('.toggle-rider-btn').forEach(btn => {
      btn.addEventListener('click', () => toggleRider(btn.dataset.id));
    });
  }

  async function toggleRider(id) {
    try {
      const res = await fetch(`/api/delivery/riders/${id}/toggle`, { method: 'PUT', headers: authHeaders });
      if (handleAuthFailure(res)) return;
      const data = await safeJson(res);
      if (!res.ok || !data.success) throw new Error(data.message || 'Could not update rider');
      showToast(data.message);
      refreshRidersView();
    } catch (err) {
      showToast(err.message || 'Could not update rider', true);
    }
  }

  let riderModalMode = 'add'; // 'add' | 'edit'
  function openRiderModal({ mode, id, region, name, phone } = { mode: 'add' }) {
    riderModalMode = mode;
    els.riderForm.reset();
    els.riderFormError.hidden = true;
    populateRegionSelect(els.riderRegion, region || regions[0]);

    if (mode === 'add') {
      els.riderModalTitle.textContent = 'Add Delivery Rider';
      els.riderId.value = '';
      els.riderUsernameField.hidden = false;
      els.riderPasswordField.hidden = false;
      els.riderNameField.hidden = false;
      els.riderName.value = '';
      els.riderPhone.value = '';
    } else {
      els.riderModalTitle.textContent = `Edit Rider — ${name}`;
      els.riderId.value = id;
      els.riderUsernameField.hidden = true;
      els.riderPasswordField.hidden = true;
      els.riderNameField.hidden = false;
      els.riderName.value = name || '';
      els.riderPhone.value = phone || '';
    }

    els.riderModalBackdrop.hidden = false;
  }

  function closeRiderModal() {
    els.riderModalBackdrop.hidden = true;
  }

  els.addRiderBtn && els.addRiderBtn.addEventListener('click', () => openRiderModal({ mode: 'add' }));
  els.riderModalCancel && els.riderModalCancel.addEventListener('click', closeRiderModal);
  els.riderModalBackdrop && els.riderModalBackdrop.addEventListener('click', (e) => { if (e.target === els.riderModalBackdrop) closeRiderModal(); });

  els.riderForm && els.riderForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    els.riderFormError.hidden = true;
    const region = els.riderRegion.value;

    try {
      if (riderModalMode === 'add') {
        const username = els.riderUsername.value.trim();
        const password = els.riderPassword.value;
        const name = els.riderName.value.trim();
        const phone = els.riderPhone.value.trim();
        if (!username || !password) throw new Error('Username and password are required.');

        const res = await fetch('/api/delivery/riders', {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ username, password, name, region, phone })
        });
        if (handleAuthFailure(res)) return;
        const data = await safeJson(res);
        if (!res.ok || !data.success) throw new Error(data.message || 'Could not add rider');
        showToast(data.message || 'Rider added');
      } else {
        const name = els.riderName.value.trim();
        const phone = els.riderPhone.value.trim();
        const res = await fetch(`/api/delivery/riders/${els.riderId.value}/region`, {
          method: 'PUT',
          headers: authHeaders,
          body: JSON.stringify({ region, name, phone })
        });
        if (handleAuthFailure(res)) return;
        const data = await safeJson(res);
        if (!res.ok || !data.success) throw new Error(data.message || 'Could not update rider');
        showToast(data.message || 'Rider updated');
      }
      closeRiderModal();
      refreshRidersView();
    } catch (err) {
      els.riderFormError.textContent = err.message || 'Something went wrong';
      els.riderFormError.hidden = false;
    }
  });

  // ---------- Init header ----------
  els.userName.textContent = user.username;
  els.userRole.textContent = viewingBranchId ? 'superadmin (viewing branch)' : user.role;
  els.avatarInitial.textContent = (user.username || 'A').charAt(0).toUpperCase();
  els.todayDate.textContent = new Date().toLocaleDateString(undefined, { weekday:'long', month:'long', day:'numeric' });
  if (els.floorplanDate) els.floorplanDate.textContent = new Date().toLocaleDateString(undefined, { day:'2-digit', month:'short', year:'numeric' });

  // A superadmin browsing a branch's dashboard needs a visible way back to
  // /superadmin — injected here rather than hardcoded into admin/index.html
  // markup, so it appears regardless of that file's exact layout.
  if (viewingBranchId) {
    const banner = document.createElement('div');
    banner.style.cssText = 'position:sticky;top:0;z-index:60;background:#1A1917;color:#F5F0E8;padding:10px 20px;font-size:13px;font-weight:600;display:flex;align-items:center;gap:12px;font-family:"DM Sans",sans-serif;';
    banner.innerHTML = '<span>★ Viewing this branch as superadmin</span>';
    const back = document.createElement('button');
    back.textContent = '← Back to Superadmin';
    back.style.cssText = 'background:rgba(245,240,232,0.12);border:1px solid rgba(245,240,232,0.25);color:#F5F0E8;border-radius:8px;padding:5px 12px;font-size:12.5px;font-weight:700;cursor:pointer;';
    back.addEventListener('click', () => { window.location.href = '/superadmin'; });
    banner.appendChild(back);
    document.body.insertBefore(banner, document.body.firstChild);
  }

  els.logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('eb_admin_token');
    localStorage.removeItem('eb_admin_user');
    window.location.href = 'login.html';
  });

  // ---------- Navigation ----------
  let currentView = 'overview';
  function switchView(name) {
    currentView = name;
    Object.entries(els.views).forEach(([key, el]) => { el.hidden = key !== name; });
    els.navItems.forEach(btn => btn.classList.toggle('active', btn.dataset.view === name));
    const titles = { overview: 'Overview', orders: 'Orders', menu: 'Menu Items', reservations: 'Reservations', floorplans: 'Floor Plans', complaints: 'Complaints', riders: 'Delivery Riders' };
    els.pageTitle.textContent = titles[name] || 'Overview';
    if (name === 'orders') { loadRiders(); loadOrders(); }
    if (name === 'overview') loadOverview();
    if (name === 'menu') loadMenu();
    if (name === 'reservations') loadReservations();
    if (name === 'floorplans') { loadTables(); loadReservations(); }
    if (name === 'complaints') loadComplaints();
    if (name === 'riders') refreshRidersView();
  }
  els.navItems.forEach(btn => btn.addEventListener('click', () => { switchView(btn.dataset.view); closeSidebar(); }));
  document.querySelectorAll('[data-goto]').forEach(btn => {
    btn.addEventListener('click', () => { switchView(btn.dataset.goto); closeSidebar(); });
  });

  // ---------- Mobile sidebar toggle ----------
  const sidebarEl = document.getElementById('sidebar');
  const menuToggleBtn = document.getElementById('menuToggle');
  const sidebarOverlay = document.getElementById('sidebarOverlay');
  function openSidebar() {
    sidebarEl && sidebarEl.classList.add('open');
    sidebarOverlay && sidebarOverlay.classList.add('show');
  }
  function closeSidebar() {
    sidebarEl && sidebarEl.classList.remove('open');
    sidebarOverlay && sidebarOverlay.classList.remove('show');
  }
  menuToggleBtn && menuToggleBtn.addEventListener('click', () => {
    sidebarEl.classList.contains('open') ? closeSidebar() : openSidebar();
  });
  sidebarOverlay && sidebarOverlay.addEventListener('click', closeSidebar);

  // ---------- Toast ----------
  let toastTimer;
  function showToast(msg, isError) {
    els.toast.textContent = msg;
    els.toast.classList.toggle('error', !!isError);
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2800);
  }

  function money(n) { return '$' + Number(n || 0).toFixed(2); }
  function timeAgo(dateStr) {
    const diff = Math.floor((Date.now() - new Date(dateStr)) / 60000);
    if (diff < 1) return 'just now';
    if (diff < 60) return diff + 'm ago';
    const h = Math.floor(diff / 60);
    if (h < 24) return h + 'h ago';
    return Math.floor(h / 24) + 'd ago';
  }

  // ---------- Overview ----------
  async function loadOverview() {
    try {
      const [statsRes, ordersRes] = await Promise.all([
        fetch('/api/orders/stats/summary', { headers: authHeaders }),
        fetch('/api/orders', { headers: authHeaders })
      ]);
      if (handleAuthFailure(statsRes) || handleAuthFailure(ordersRes)) return;

      const stats = await safeJson(statsRes);
      const orders = await safeJson(ordersRes);
      if (!statsRes.ok) throw new Error(stats.error || 'Failed to load stats');
      if (!ordersRes.ok) throw new Error(orders.error || 'Failed to load orders');

      // If this is the first load, prime prevOrdersMap
      if (prevOrdersMap.size === 0) {
        orders.forEach(o => prevOrdersMap.set(o._id || o.id || o.orderNumber, { status: o.status }));
      }
      // detect status transitions (prev -> current) and notify admin when an order becomes ready
      const newOrdersMap = new Map();
      orders.forEach(o => newOrdersMap.set(o._id || o.id || o.orderNumber, o));

      // compare against prevOrdersMap and show notifications for transitions to 'ready'
      newOrdersMap.forEach((order, id) => {
        const prev = prevOrdersMap.get(id);
        if (prev && prev.status !== 'ready' && order.status === 'ready') {
          showToast(`Order ${order.orderNumber || id} is READY — send to service`, false);
        }
      });

      // update previous map
      prevOrdersMap = new Map();
      orders.forEach(o => prevOrdersMap.set(o._id || o.id || o.orderNumber, { status: o.status }));

      allOrders = orders;

      els.statRevenue.textContent = money(stats.totalRevenue);
      els.statRevenueSub.textContent = stats.totalOrders + ' orders total';
      els.statToday.textContent = stats.todayOrders;
      els.statPending.textContent = stats.pendingCount;

      renderRecentOrders(orders.slice(0, 6));
      renderPopularDishes(stats.popularDishes || []);
      renderRevenueOverview(orders);
      renderOrderTypeDonut(orders);
    } catch (err) {
      showToast(err.message || 'Could not load dashboard stats', true);
      els.recentOrdersBody.innerHTML = '<tr><td colspan="4" class="empty-state">Could not reach the server.</td></tr>';
      els.popularDishesBody.innerHTML = '<div class="empty-state">Could not reach the server.</div>';
    }

    try {
      const res = await fetch('/api/menu/admin', { headers: authHeaders });
      if (handleAuthFailure(res)) return;
      const items = await safeJson(res);
      if (!res.ok) throw new Error(items.error || 'Failed to load menu');
      allMenuItems = items;
      els.statMenuCount.textContent = items.length;
      const unavailable = items.filter(i => !i.available).length;
      els.statMenuSub.textContent = unavailable ? unavailable + ' unavailable' : 'all available';
    } catch (err) {
      showToast(err.message || 'Could not load menu stats', true);
    }
  }

  // Lightweight overview for faster initial load (only stats + popular dishes)
  async function loadOverviewLite() {
    try {
      const statsRes = await fetch('/api/orders/stats/summary', { headers: authHeaders });
      if (handleAuthFailure(statsRes)) return;
      const stats = await safeJson(statsRes);
      if (!statsRes.ok) throw new Error(stats.error || 'Failed to load stats');

      els.statRevenue.textContent = money(stats.totalRevenue);
      els.statRevenueSub.textContent = (stats.totalOrders || 0) + ' orders total';
      els.statToday.textContent = stats.todayOrders || 0;
      els.statPending.textContent = stats.pendingCount || 0;
      renderPopularDishes(stats.popularDishes || []);
    } catch (err) {
      showToast(err.message || 'Could not load dashboard stats', true);
    }
  }

  function renderRecentOrders(orders) {
    if (!orders.length) {
      els.recentOrdersBody.innerHTML = '<tr><td colspan="4" class="empty-state">No orders yet.</td></tr>';
      return;
    }
    els.recentOrdersBody.innerHTML = orders.map(o => `
      <tr>
        <td><span class="order-id">${o.orderNumber}</span><br><span class="cust">${timeAgo(o.createdAt)}</span></td>
        <td>${escapeHtml(o.customerName)}</td>
        <td>${money(o.total)}</td>
        <td><span class="badge ${o.status}">${o.status}</span></td>
      </tr>
    `).join('');
  }

  function renderPopularDishes(dishes) {
    if (!dishes.length) {
      els.popularDishesBody.innerHTML = '<div class="empty-state">No orders yet to rank dishes.</div>';
      return;
    }
    const max = Math.max(...dishes.map(d => d.qty), 1);
    els.popularDishesBody.innerHTML = dishes.map((d, i) => `
      <div class="pop-item">
        <div class="pop-rank">${i + 1}</div>
        <div class="pop-info">
          <div class="n">${escapeHtml(d.name)}</div>
          <div class="pop-bar-track"><div class="pop-bar-fill" data-width="${(d.qty / max) * 100}"></div></div>
        </div>
        <div class="pop-qty">${d.qty} sold</div>
      </div>
    `).join('');
    // Animate bars from 0 -> target width after the initial paint
    requestAnimationFrame(() => {
      els.popularDishesBody.querySelectorAll('.pop-bar-fill').forEach(bar => {
        bar.style.width = bar.dataset.width + '%';
      });
    });
  }

  // ---------- Revenue Overview (weekly bar chart) ----------
  function startOfWeek(d) {
    // Monday-start week
    const date = new Date(d);
    const day = date.getDay(); // 0=Sun..6=Sat
    const diff = day === 0 ? -6 : 1 - day;
    date.setDate(date.getDate() + diff);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  function renderRevenueOverview(orders) {
    if (!els.weeklyRevenueBars) return;
    const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const now = new Date();
    const thisWeekStart = startOfWeek(now);
    const lastWeekStart = new Date(thisWeekStart); lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    const nextWeekStart = new Date(thisWeekStart); nextWeekStart.setDate(nextWeekStart.getDate() + 7);

    const dayTotals = [0, 0, 0, 0, 0, 0, 0];
    let thisWeekRevenue = 0, lastWeekRevenue = 0;
    let dineInRevenue = 0, deliveryRevenue = 0;

    (orders || []).forEach(o => {
      if (o.status === 'cancelled') return;
      const created = new Date(o.createdAt);
      const total = Number(o.total) || 0;
      if (created >= thisWeekStart && created < nextWeekStart) {
        thisWeekRevenue += total;
        const dayIdx = (created.getDay() + 6) % 7; // Mon=0..Sun=6
        dayTotals[dayIdx] += total;
        if (o.orderType === 'dine-in') dineInRevenue += total;
        if (o.orderType === 'delivery') deliveryRevenue += total;
      } else if (created >= lastWeekStart && created < thisWeekStart) {
        lastWeekRevenue += total;
      }
    });

    const change = lastWeekRevenue > 0 ? ((thisWeekRevenue - lastWeekRevenue) / lastWeekRevenue) * 100 : (thisWeekRevenue > 0 ? 100 : 0);
    els.weeklyRevenueAmount.textContent = thisWeekRevenue >= 1000 ? '$' + (thisWeekRevenue / 1000).toFixed(1) + 'K' : money(thisWeekRevenue);
    els.weeklyRevenueChange.textContent = (change >= 0 ? '+' : '') + change.toFixed(0) + '%';
    els.weeklyRevenueChange.classList.toggle('positive', change >= 0);
    els.weeklyRevenueChange.classList.toggle('negative', change < 0);

    const maxDay = Math.max(...dayTotals, 1);
    const todayIdx = (now.getDay() + 6) % 7;
    els.weeklyRevenueBars.innerHTML = dayLabels.map((label, i) => {
      const heightPct = Math.max((dayTotals[i] / maxDay) * 100, dayTotals[i] > 0 ? 6 : 3);
      return `<div class="revenue-bar-col"><div class="revenue-bar${i === todayIdx ? ' peak' : ''}" style="height:${heightPct}%" title="${label}: ${money(dayTotals[i])}"></div><span class="revenue-bar-label">${label}</span></div>`;
    }).join('');

    if (els.revenueMiniStats) {
      const otherRevenue = Math.max(thisWeekRevenue - dineInRevenue - deliveryRevenue, 0);
      const pct = (v) => thisWeekRevenue > 0 ? Math.min((v / thisWeekRevenue) * 100, 100) : 0;
      els.revenueMiniStats.innerHTML = `
        <div class="mini-stat">
          <div class="mini-stat-head"><span class="mini-stat-icon revenue">$</span><span class="mini-stat-label">Revenue</span></div>
          <div class="mini-stat-value">${money(thisWeekRevenue)}</div>
          <div class="mini-stat-track"><div class="mini-stat-fill revenue" data-width="100"></div></div>
        </div>
        <div class="mini-stat">
          <div class="mini-stat-head"><span class="mini-stat-icon dine">🍽</span><span class="mini-stat-label">Dine-in</span></div>
          <div class="mini-stat-value">${money(dineInRevenue)}</div>
          <div class="mini-stat-track"><div class="mini-stat-fill dine" data-width="${pct(dineInRevenue)}"></div></div>
        </div>
        <div class="mini-stat">
          <div class="mini-stat-head"><span class="mini-stat-icon delivery">🛵</span><span class="mini-stat-label">Delivery</span></div>
          <div class="mini-stat-value">${money(deliveryRevenue)}</div>
          <div class="mini-stat-track"><div class="mini-stat-fill delivery" data-width="${pct(deliveryRevenue)}"></div></div>
        </div>`;
      requestAnimationFrame(() => {
        els.revenueMiniStats.querySelectorAll('.mini-stat-fill').forEach(f => { f.style.width = f.dataset.width + '%'; });
      });
    }
  }

  // ---------- Order Type donut (today's distribution) ----------
  function renderOrderTypeDonut(orders) {
    if (!els.orderTypeDonut) return;
    const todayStr = new Date().toISOString().slice(0, 10);
    const todays = (orders || []).filter(o => o.status !== 'cancelled' && String(o.createdAt || '').slice(0, 10) === todayStr);

    const counts = { 'dine-in': 0, 'takeout': 0, 'delivery': 0 };
    todays.forEach(o => { const t = o.orderType || 'dine-in'; counts[t] = (counts[t] || 0) + 1; });
    const total = todays.length;
    els.orderTypeDonutTotal.textContent = total;

    const segments = [
      { key: 'dine-in', label: 'Dine-in', color: 'var(--chart-dine)' },
      { key: 'takeout', label: 'Takeout', color: 'var(--chart-takeout)' },
      { key: 'delivery', label: 'Delivery', color: 'var(--chart-delivery)' }
    ];

    if (total === 0) {
      els.orderTypeDonut.style.background = 'conic-gradient(var(--paper) 0 100%)';
      els.orderTypeLegend.innerHTML = '<div class="empty-state">No orders yet today.</div>';
      return;
    }

    let acc = 0;
    const stops = segments.map(seg => {
      const pct = (counts[seg.key] || 0) / total * 100;
      const start = acc; acc += pct;
      return `${seg.color} ${start}% ${acc}%`;
    }).join(', ');
    els.orderTypeDonut.style.background = `conic-gradient(${stops})`;

    els.orderTypeLegend.innerHTML = segments.map(seg => {
      const c = counts[seg.key] || 0;
      const pct = total > 0 ? Math.round((c / total) * 100) : 0;
      return `<div class="order-type-legend-row"><span class="dot" style="background:${seg.color}"></span><span class="lbl">${seg.label}</span><span class="cnt">${c} orders</span><span class="pct">${pct}%</span></div>`;
    }).join('');
  }

  // ---------- Orders view ----------
  async function loadOrders() {
    els.ordersBody.innerHTML = '<tr><td colspan="9" class="empty-state">Loading…</td></tr>';
    try {
      const url = currentOrderFilter ? `/api/orders?status=${currentOrderFilter}` : '/api/orders';
      const res = await fetch(url, { headers: authHeaders });
      if (handleAuthFailure(res)) return;
      const orders = await safeJson(res);
      if (!res.ok) throw new Error(orders.error || 'Failed to load orders');
      // detect transitions in this orders view polling too
      const newMap = new Map();
      orders.forEach(o => newMap.set(o._id || o.id || o.orderNumber, o));
      newMap.forEach((order, id) => {
        const prev = prevOrdersMap.get(id);
        if (prev && prev.status !== 'ready' && order.status === 'ready') {
          showToast(`Order ${order.orderNumber || id} is READY — send to service`, false);
        }
      });
      // update prev map
      prevOrdersMap = new Map();
      orders.forEach(o => prevOrdersMap.set(o._id || o.id || o.orderNumber, { status: o.status }));

      allOrders = orders;
      renderOrdersTable(orders);
    } catch (err) {
      els.ordersBody.innerHTML = `<tr><td colspan="9" class="empty-state">${escapeHtml(err.message || 'Failed to load orders.')}</td></tr>`;
    }
  }

  // Region/Table column: delivery orders show their region, dine-in orders
  // show the table they're tagged to. If a dine-in order has no table
  // number (e.g. placed without scanning a QR, or a backend gap), flag it
  // visibly instead of silently rendering a blank dash — staff need to
  // know they'll have to ask the customer which table they're at.
  function renderRegionOrTableCell(o) {
    if (o.orderType === 'delivery') return escapeHtml(o.region || '—');
    if (o.orderType === 'dine-in') {
      return o.tableNumber
        ? `<span class="table-tag">${escapeHtml(o.tableNumber)}</span>`
        : `<span class="table-tag table-tag-missing" title="No table attached to this order">No table</span>`;
    }
    return '—';
  }

  // ---- RBAC: which statuses admin is allowed to set, given the order's
  // current status. Kitchen-owned stages (received -> preparing -> ready)
  // are the chef's exclusive responsibility (set via kitchen.js's
  // /accept and /prepared endpoints) — admin must never be able to
  // overwrite them. Admin only takes over once an order is 'ready',
  // moving it through fulfillment (out-for-delivery/delivered, or
  // completed for dine-in/takeaway), plus cancellation at any point.
  function getAdminAllowedStatuses(o) {
    const isDelivery = o.orderType === 'delivery';
    switch (o.status) {
      case 'received':
      case 'preparing':
        // Kitchen-owned — admin has no status control here at all.
        return [];
      case 'ready':
        return isDelivery
          ? ['ready', 'out-for-delivery', 'cancelled']
          : ['ready', 'completed', 'cancelled'];
      case 'out-for-delivery':
        return ['out-for-delivery', 'delivered', 'cancelled'];
      case 'completed':
      case 'delivered':
      case 'cancelled':
        // Terminal states — locked.
        return [];
      default:
        return [];
    }
  }

  function lockedStatusReason(o) {
    if (o.status === 'received' || o.status === 'preparing') {
      return 'Controlled by the kitchen — the chef updates this stage';
    }
    if (['completed', 'delivered', 'cancelled'].includes(o.status)) {
      return 'Order finalized — status is locked';
    }
    return '';
  }

  function renderOrdersTable(orders) {
    if (!orders.length) {
      els.ordersBody.innerHTML = '<tr><td colspan="9" class="empty-state">No orders in this category.</td></tr>';
      return;
    }
    els.ordersBody.innerHTML = orders.map(o => {
      const allowed = getAdminAllowedStatuses(o);
      const canEdit = allowed.length > 1; // more than just the current status
      const statusCell = canEdit
        ? `<select class="status-select" data-order="${o.orderNumber}">
            ${allowed.map(s => `<option value="${s}" ${s === o.status ? 'selected' : ''}>${s.replace('-', ' ')}</option>`).join('')}
          </select>`
        : `<span class="status-locked" title="${escapeHtml(lockedStatusReason(o))}">
            <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:3px;">
              <rect x="4" y="10" width="16" height="10" rx="2"></rect>
              <path d="M8 10V7a4 4 0 0 1 8 0v3"></path>
            </svg>Locked
          </span>`;
      // Dine-in orders tied to a table can pull up that table's ordering
      // QR right from the order row — handy for reprinting at the table.
      const qrCell = (o.orderType === 'dine-in' && o.tableNumber)
        ? `<button class="order-qr-btn" data-qr-table="${escapeHtml(o.tableNumber)}" title="Show order QR for ${escapeHtml(o.tableNumber)}" aria-label="Show order QR for ${escapeHtml(o.tableNumber)}">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="7" height="7"></rect>
              <rect x="14" y="3" width="7" height="7"></rect>
              <rect x="3" y="14" width="7" height="7"></rect>
              <line x1="14" y1="14" x2="14" y2="21"></line>
              <line x1="21" y1="14" x2="21" y2="21"></line>
              <line x1="14" y1="17.5" x2="21" y2="17.5"></line>
            </svg>
          </button>`
        : '';
      return `
      <tr>
        <td><span class="order-id">${o.orderNumber}</span><br><span class="cust">${timeAgo(o.createdAt)}</span></td>
        <td>${escapeHtml(o.customerName)}<br><span class="cust">${escapeHtml(o.customerPhone || '')}</span></td>
        <td style="text-transform:capitalize;">${o.orderType || '—'}</td>
        <td class="cust">${renderRegionOrTableCell(o)}</td>
        <td class="cust">${o.items.map(i => `${i.qty}× ${escapeHtml(i.name)}`).join(', ')}</td>
        <td>${money(o.total)}</td>
        <td><span class="badge ${o.status}">${o.status.replace('-', ' ')}</span></td>
        <td>${renderDeliveryCell(o)}</td>
        <td><div class="update-cell">${statusCell}${qrCell}</div></td>
      </tr>
    `;
    }).join('');

    els.ordersBody.querySelectorAll('.order-qr-btn').forEach(btn => {
      btn.addEventListener('click', () => showTableQrModal(btn.dataset.qrTable));
    });

    els.ordersBody.querySelectorAll('.assign-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const sel = els.ordersBody.querySelector(`.rider-select[data-order-id="${btn.dataset.orderId}"]`);
        assignRider(btn.dataset.orderId, sel ? sel.value : '', btn.dataset.orderNumber);
      });
    });

    // Sweep ready delivery orders and assign riders automatically — this is
    // the fallback path (socket event is the fast path) so nothing gets
    // stuck waiting on a click even if a socket message was missed.
    orders.forEach(o => {
      if (o.orderType === 'delivery' && o.status === 'ready' && o.region) {
        tryAutoAssign(o._id, o.orderNumber);
      }
    });

    els.ordersBody.querySelectorAll('.add-rider-for-region-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        switchView('riders');
        openRiderModal({ mode: 'add', region: btn.dataset.region });
      });
    });

    els.ordersBody.querySelectorAll('.status-select').forEach(sel => {
      sel.addEventListener('change', async (e) => {
        const orderNumber = e.target.dataset.order;
        const newStatus = e.target.value;
        try {
          const res = await fetch(`/api/orders/${orderNumber}/status`, {
            method: 'PUT',
            headers: authHeaders,
            body: JSON.stringify({ status: newStatus })
          });
          if (handleAuthFailure(res)) return;
          if (!res.ok) throw new Error();
          showToast(`${orderNumber} marked ${newStatus}`);
          loadOrders();
        } catch {
          showToast('Could not update order status', true);
        }
      });
    });
  }

  function renderDeliveryCell(o) {
    // Dine-in and takeaway orders never need a rider — only delivery orders do.
    if (o.orderType !== 'delivery') {
      return '<span class="cust">—</span>';
    }
    if (o.status === 'ready') {
      // Orders with a region are assigned automatically — the server picks
      // the rider with the fewest active orders in that region, no admin
      // click required (see tryAutoAssign).
      if (o.region) {
        if (autoAssignNoRider.has(o._id)) {
          return `
            <div style="display:flex;flex-direction:column;gap:4px;">
              <span class="cust">No riders free in ${escapeHtml(o.region)} — will auto-assign as soon as one is</span>
              <button class="btn-ghost add-rider-for-region-btn" data-region="${escapeHtml(o.region)}" style="padding:6px 10px;font-size:12px;">+ Add rider for ${escapeHtml(o.region)}</button>
            </div>
          `;
        }
        return '<span class="cust">⚡ Auto-assigning…</span>';
      }

      // No region on the order — the system has nothing to match a rider
      // against, so it falls back to a manual pick from all active riders.
      const candidates = deliveryRiders;
      if (!candidates.length) {
        return '<span class="cust">No riders available</span>';
      }
      return `
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <select class="status-select rider-select" data-order-id="${o._id}">
            <option value="">Choose rider…</option>
            ${candidates.map(r => `<option value="${r._id}">${escapeHtml(r.name || r.username)} (${r.activeOrders || 0}/${maxActiveOrders})</option>`).join('')}
          </select>
          <button class="reply-save-btn assign-btn" data-order-id="${o._id}" data-order-number="${o.orderNumber}">Assign</button>
        </div>
      `;
    }
    if (o.status === 'out-for-delivery') {
      return `<span class="cust">🛵 ${escapeHtml(o.deliveryBoyName || 'Rider assigned')}</span>`;
    }
    if (o.status === 'delivered' || o.status === 'completed') {
      return o.deliveryBoyName ? `<span class="cust">✅ ${escapeHtml(o.deliveryBoyName)}</span>` : '<span class="cust">—</span>';
    }
    return '<span class="cust">—</span>';
  }

  els.orderFilterTabs.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-tab');
    if (!btn) return;
    els.orderFilterTabs.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    currentOrderFilter = btn.dataset.status;
    loadOrders();
  });

  // ---------- Menu view ----------
  async function loadMenu() {
    els.menuGrid.innerHTML = '<div class="empty-state">Loading…</div>';
    try {
      const res = await fetch('/api/menu/admin', { headers: authHeaders });
      if (handleAuthFailure(res)) return;
      const items = await safeJson(res);
      if (!res.ok) throw new Error(items.error || 'Failed to load menu items');
      allMenuItems = items;
      buildCategoryTabs(items);
      renderMenuGrid(filterMenuByCategory(items));
    } catch (err) {
      els.menuGrid.innerHTML = `<div class="empty-state">${escapeHtml(err.message || 'Failed to load menu items.')}</div>`;
    }
  }

  function filterMenuByCategory(items) {
    return currentMenuCategory ? items.filter(i => i.category === currentMenuCategory) : items;
  }

  function buildCategoryTabs(items) {
    const cats = [...new Set(items.map(i => i.category))].sort();
    els.categoryList.innerHTML = cats.map(c => `<option value="${escapeHtml(c)}"></option>`).join('');
    const tabsHtml = ['<button class="filter-tab' + (currentMenuCategory === '' ? ' active' : '') + '" data-cat="">All</button>']
      .concat(cats.map(c => `<button class="filter-tab${currentMenuCategory === c ? ' active' : ''}" data-cat="${escapeHtml(c)}">${escapeHtml(c)}</button>`));
    els.menuCategoryTabs.innerHTML = tabsHtml.join('');
  }

  els.menuCategoryTabs.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-tab');
    if (!btn) return;
    currentMenuCategory = btn.dataset.cat;
    els.menuCategoryTabs.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    renderMenuGrid(filterMenuByCategory(allMenuItems));
  });

  function renderMenuGrid(items) {
    els.menuCountLabel.textContent = `${items.length} item${items.length === 1 ? '' : 's'}${currentMenuCategory ? ' in ' + currentMenuCategory : ' across all categories'}`;
    if (!items.length) {
      els.menuGrid.innerHTML = '<div class="empty-state">No items here yet. Add one to get started.</div>';
      return;
    }
    els.menuGrid.innerHTML = items.map(item => `
      <div class="menu-card ${item.available ? '' : 'is-off'}">
        ${!item.available ? '<span class="unavailable-tag">Unavailable</span>' : ''}
        <img class="thumb" src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" onerror="this.outerHTML='<div class=&quot;thumb-fallback&quot;>No image</div>'" />
        <div class="body">
          <span class="cat">${escapeHtml(item.category)}</span>
          <span class="n">${escapeHtml(item.name)}</span>
          <span class="desc">${escapeHtml(item.description)}</span>
          <div class="row-bottom">
            <span class="price">${money(item.price)}</span>
            <div class="actions">
              <button class="btn-icon" data-edit="${item._id}" title="Edit">✎</button>
              <button class="btn-icon" data-delete="${item._id}" title="Delete">🗑</button>
            </div>
          </div>
        </div>
      </div>
    `).join('');

    els.menuGrid.querySelectorAll('[data-edit]').forEach(btn => {
      btn.addEventListener('click', () => openItemModal(allMenuItems.find(i => i._id === btn.dataset.edit)));
    });
    els.menuGrid.querySelectorAll('[data-delete]').forEach(btn => {
      btn.addEventListener('click', () => deleteItem(btn.dataset.delete));
    });
  }

  async function deleteItem(id) {
    const item = allMenuItems.find(i => i._id === id);
    if (!confirm(`Delete "${item ? item.name : 'this item'}"? This can't be undone.`)) return;
    try {
      const res = await fetch(`/api/menu/${id}`, { method: 'DELETE', headers: authHeaders });
      if (handleAuthFailure(res)) return;
      if (!res.ok) throw new Error();
      showToast('Item deleted');
      loadMenu();
    } catch {
      showToast('Could not delete item', true);
    }
  }

  // ---------- Add/Edit modal ----------
  function openItemModal(item) {
    els.itemFormError.hidden = true;
    if (item) {
      els.itemModalTitle.textContent = 'Edit Menu Item';
      els.itemId.value = item._id;
      els.itemName.value = item.name;
      els.itemDescription.value = item.description;
      els.itemPrice.value = item.price;
      els.itemCategory.value = item.category;
      els.itemImage.value = item.image;
      els.itemAvailable.checked = item.available;
    } else {
      els.itemModalTitle.textContent = 'Add Menu Item';
      els.itemForm.reset();
      els.itemId.value = '';
      els.itemAvailable.checked = true;
    }
    els.itemModalBackdrop.hidden = false;
  }
  function closeItemModal() { els.itemModalBackdrop.hidden = true; }

  els.addItemBtn.addEventListener('click', () => openItemModal(null));
  els.itemModalCancel.addEventListener('click', closeItemModal);
  els.itemModalBackdrop.addEventListener('click', (e) => { if (e.target === els.itemModalBackdrop) closeItemModal(); });

  els.itemForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    els.itemFormError.hidden = true;
    const id = els.itemId.value;
    const payload = {
      name: els.itemName.value.trim(),
      description: els.itemDescription.value.trim(),
      price: parseFloat(els.itemPrice.value),
      category: els.itemCategory.value.trim(),
      image: els.itemImage.value.trim(),
      available: els.itemAvailable.checked
    };
    try {
      const res = await fetch(id ? `/api/menu/${id}` : '/api/menu', {
        method: id ? 'PUT' : 'POST',
        headers: authHeaders,
        body: JSON.stringify(payload)
      });
      if (handleAuthFailure(res)) return;
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || 'Failed to save item');
      showToast(id ? 'Item updated' : 'Item added');
      closeItemModal();
      loadMenu();
    } catch (err) {
      els.itemFormError.textContent = err.message;
      els.itemFormError.hidden = false;
    }
  });

  // ---------- Reservations view ----------
  function reservationStatusLabel(status) {
    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  function reservationDateTime(reservation) {
    const date = new Date(`${reservation.date}T00:00:00`);
    const readableDate = Number.isNaN(date.getTime()) ? reservation.date : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    return `${readableDate}<span class="reservation-time">${escapeHtml(reservation.time)}</span>`;
  }

  async function loadReservations() {
    els.reservationsBody.innerHTML = '<tr><td colspan="6" class="empty-state">Loading...</td></tr>';
    try {
      const url = currentReservationFilter ? `/api/reservations?status=${currentReservationFilter}` : '/api/reservations';
      const res = await fetch(url, { headers: authHeaders });
      if (handleAuthFailure(res)) return;
      const reservations = await safeJson(res);
      if (!res.ok) throw new Error(reservations.error || 'Failed to load reservations');
      allReservations = reservations;
      renderReservations(reservations);
      updateReservationBadge(reservations, currentReservationFilter);
      if (!currentReservationFilter) renderBookingDashboard(reservations);
      else loadBookingDashboard();
      if (currentView === 'floorplans') renderFloorMap();
    } catch (err) {
      els.reservationsBody.innerHTML = `<tr><td colspan="6" class="empty-state">${escapeHtml(err.message || 'Failed to load reservations.')}</td></tr>`;
    }
  }

  async function loadBookingDashboard() {
    try {
      const res = await fetch('/api/reservations', { headers: authHeaders });
      if (handleAuthFailure(res)) return;
      const reservations = await safeJson(res);
      if (res.ok) renderBookingDashboard(reservations);
    } catch { /* table remains available if dashboard summary cannot refresh */ }
  }

  function renderBookingDashboard(reservations) {
    const counts = status => reservations.filter(r => r.status === status).length;
    els.bookingTotal.textContent = reservations.length;
    els.bookingPending.textContent = counts('pending');
    els.bookingConfirmed.textContent = counts('confirmed');
    els.bookingCompleted.textContent = counts('completed');

    const upcoming = reservations.filter(r => !['completed', 'cancelled'].includes(r.status)).slice(0, 5);
    els.bookingUpcomingCount.textContent = upcoming.length;
    if (!upcoming.length) {
      els.bookingUpcomingList.innerHTML = '<div class="empty-state">No upcoming reservations yet.</div>';
      return;
    }
    els.bookingUpcomingList.innerHTML = upcoming.map(r => `
      <div class="booking-upcoming-item">
        <div class="booking-upcoming-time"><strong>${escapeHtml(r.time)}</strong><small>${escapeHtml(r.date)}</small></div>
        <div class="booking-upcoming-guest"><strong>${escapeHtml(r.guestName)}</strong><small>${Number(r.guests)} guests · ${escapeHtml(r.tableNumber || 'Table to assign')}</small></div>
        <span class="booking-status-pill ${escapeHtml(r.status)}">${escapeHtml(reservationStatusLabel(r.status))}</span>
      </div>`).join('');
  }

  async function loadTables() {
    try {
      const res = await fetch('/api/tables', { headers: authHeaders });
      if (handleAuthFailure(res)) return;
      const tables = await safeJson(res);
      if (!res.ok) throw new Error(tables.error || 'Failed to load tables');
      restaurantTables = tables;
      renderFloorMap();
    } catch (err) { els.floorMap.innerHTML = `<div class="empty-state">${escapeHtml(err.message || 'Could not load tables.')}</div>`; }
  }

  const AREA_LABELS = { 'main-dining': 'Main Dining', 'private-room': 'Private Room', 'outdoor': 'Outdoor', 'indoor': 'Indoor' };
  function areaLabel(area) { return AREA_LABELS[area] || (area ? area.charAt(0).toUpperCase() + area.slice(1) : 'Unassigned'); }

  // Finds today's active (pending/confirmed) reservation assigned to a given table, if any.
  function todaysBookingForTable(tableNumber) {
    if (!tableNumber) return null;
    const todayStr = new Date().toISOString().slice(0, 10);
    return allReservations.find(r => r.tableNumber === tableNumber && r.date === todayStr && ['pending', 'confirmed'].includes(r.status)) || null;
  }

  function renderFloorMap() {
    const visible = restaurantTables.filter(t => !currentTableArea || t.area === currentTableArea);
    els.tableTotal.textContent = restaurantTables.length;
    els.tableAvailable.textContent = restaurantTables.filter(t => t.status === 'available').length;
    els.tableReserved.textContent = restaurantTables.filter(t => t.status === 'reserved').length;
    if (!visible.length) { els.floorMap.innerHTML = '<div class="empty-state">No tables in this area yet. Use the + button above to add one.</div>'; return; }

    els.floorMap.innerHTML = visible.map(t => {
      const seats = Number(t.seats) || 0;
      const ticks = Array.from({ length: Math.min(seats, 8) }, () => '<span class="seat-tick"></span>').join('');
      const half = Math.ceil(Math.min(seats, 8) / 2);
      const topTicks = Array.from({ length: half }, () => '<span class="seat-tick"></span>').join('');
      const bottomTicks = Array.from({ length: Math.min(seats, 8) - half }, () => '<span class="seat-tick"></span>').join('');
      const booking = todaysBookingForTable(t.tableNumber);
      const bookingHtml = booking
        ? `<div class="table-card-booking"><strong>${escapeHtml(booking.guestName)}</strong>${escapeHtml(booking.time)} · ${Number(booking.guests)} guests</div>`
        : '';
      return `
      <div class="table-card ${escapeHtml(t.status)}" data-table="${t._id}" title="Click to change table status">
        <button class="table-qr-btn" data-qr-table="${escapeHtml(t.tableNumber)}" title="Show order QR for ${escapeHtml(t.tableNumber)}" aria-label="Show order QR for ${escapeHtml(t.tableNumber)}">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="7" height="7"></rect>
            <rect x="14" y="3" width="7" height="7"></rect>
            <rect x="3" y="14" width="7" height="7"></rect>
            <line x1="14" y1="14" x2="14" y2="21"></line>
            <line x1="21" y1="14" x2="21" y2="21"></line>
            <line x1="14" y1="17.5" x2="21" y2="17.5"></line>
          </svg>
        </button>
        <div class="table-card-visual">
          <div class="seat-row">${topTicks}</div>
          <div class="table-card-box">▢</div>
          <div class="seat-row">${bottomTicks}</div>
        </div>
        <div class="table-card-name">${escapeHtml(t.tableNumber)}</div>
        <div class="table-card-meta"><span class="meta-icon">👥</span>${seats} seats · ${escapeHtml(areaLabel(t.area))}</div>
        <span class="table-card-status status-${escapeHtml(t.status)}">${escapeHtml(t.status)}</span>
        ${bookingHtml}
      </div>`;
    }).join('');

    // QR button — must stop propagation so it doesn't also trigger the
    // card's status-toggle click handler below.
    els.floorMap.querySelectorAll('.table-qr-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        showTableQrModal(btn.dataset.qrTable);
      });
    });

    // status click listeners
    els.floorMap.querySelectorAll('.table-card').forEach(card => {
      card.addEventListener('click', async () => {
        const table = restaurantTables.find(t => t._id === card.dataset.table);
        if (!table || table.status === 'reserved') return showToast('This table is reserved by an active booking.', true);
        const next = table.manualStatus === 'available' ? 'occupied' : table.manualStatus === 'occupied' ? 'maintenance' : 'available';
        try {
          const res = await fetch(`/api/tables/${table._id}/status`, { method: 'PUT', headers: authHeaders, body: JSON.stringify({ manualStatus: next }) });
          if (!res.ok) throw new Error();
          loadTables();
        } catch { showToast('Could not update table status.', true); }
      });
    });
  }

  els.toggleTableForm.addEventListener('click', () => { els.addTableForm.hidden = !els.addTableForm.hidden; });
  if (els.cancelAddTable) els.cancelAddTable.addEventListener('click', () => { els.addTableForm.reset(); els.addTableForm.hidden = true; });
  els.addTableForm.addEventListener('submit', async e => {
    e.preventDefault();
    try {
      const res = await fetch('/api/tables', { method: 'POST', headers: authHeaders, body: JSON.stringify({ tableNumber: els.newTableNumber.value, seats: Number(els.newTableSeats.value), area: els.newTableArea.value }) });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || 'Could not add table');
      els.addTableForm.reset(); els.addTableForm.hidden = true; showToast(`Table ${data.tableNumber} added.`); loadTables();
    } catch (err) { showToast(err.message || 'Could not add table.', true); }
  });
  // Table editing has been disabled — edit modal and handlers removed
  els.floorFilters.addEventListener('click', e => {
    const btn = e.target.closest('.filter-tab'); if (!btn) return;
    els.floorFilters.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active'); currentTableArea = btn.dataset.area; renderFloorMap();
  });

  // ---------- New Reservation modal (create walk-in / phone bookings from the admin panel) ----------
  // Refreshes the table dropdown to only show tables that can seat the
  // currently-entered party size (seats >= guests), closest fit first.
  // Falls back to every table, sorted by seats, before a guest count is
  // entered yet.
  function refreshReservationTableOptions() {
    const guests = Number(els.resGuests.value);
    const currentValue = els.resTable.value;
    const pool = Number.isInteger(guests) && guests > 0
      ? restaurantTables.filter(t => Number(t.seats) >= guests)
      : restaurantTables;
    const sorted = [...pool].sort((a, b) => Number(a.seats) - Number(b.seats));
    els.resTable.innerHTML = '<option value="">Assign later</option>' +
      sorted.map(t => `<option value="${escapeHtml(t.tableNumber)}">${escapeHtml(t.tableNumber)} · ${Number(t.seats)} seats · ${escapeHtml(areaLabel(t.area))}</option>`).join('');
    if (currentValue && sorted.some(t => t.tableNumber === currentValue)) {
      els.resTable.value = currentValue;
    }
  }

  function openReservationModal() {
    els.reservationForm.reset();
    els.reservationFormError.hidden = true;
    els.resDate.value = new Date().toISOString().slice(0, 10);
    refreshReservationTableOptions();
    els.reservationModalBackdrop.hidden = false;
  }
  function closeReservationModal() { els.reservationModalBackdrop.hidden = true; }

  if (els.resGuests) els.resGuests.addEventListener('input', refreshReservationTableOptions);
  if (els.newReservationBtn) els.newReservationBtn.addEventListener('click', openReservationModal);
  if (els.reservationModalCancel) els.reservationModalCancel.addEventListener('click', closeReservationModal);
  if (els.reservationModalBackdrop) els.reservationModalBackdrop.addEventListener('click', e => { if (e.target === els.reservationModalBackdrop) closeReservationModal(); });

  if (els.reservationForm) els.reservationForm.addEventListener('submit', async e => {
    e.preventDefault();
    els.reservationFormError.hidden = true;
    const payload = {
      guestName: els.resGuestName.value.trim(),
      email: els.resEmail.value.trim(),
      phone: els.resPhone.value.trim(),
      date: els.resDate.value,
      time: els.resTime.value,
      guests: Number(els.resGuests.value),
      notes: els.resNotes.value.trim()
    };
    if (els.resTable.value) payload.tableNumber = els.resTable.value;
    const saveBtn = document.getElementById('reservationModalSave');
    saveBtn.disabled = true; saveBtn.textContent = 'Saving…';
    try {
      const res = await fetch('/api/reservations', { method: 'POST', headers: authHeaders, body: JSON.stringify(payload) });
      if (handleAuthFailure(res)) return;
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || 'Could not create reservation');
      showToast(`Reservation for ${payload.guestName} created.`);
      closeReservationModal();
      loadReservations();
      if (currentView === 'floorplans') loadTables();
    } catch (err) {
      els.reservationFormError.textContent = err.message || 'Could not create reservation. If this keeps happening, the server may need an admin-facing reservations endpoint.';
      els.reservationFormError.hidden = false;
    } finally {
      saveBtn.disabled = false; saveBtn.textContent = 'Save Reservation';
    }
  });

  async function updateReservationBadge(knownReservations, filtered) {
    try {
      let reservations = knownReservations && !filtered ? knownReservations : null;
      if (!reservations) {
        const res = await fetch('/api/reservations', { headers: authHeaders });
        if (handleAuthFailure(res)) return;
        reservations = await safeJson(res);
        if (!res.ok || !Array.isArray(reservations)) return;
      }
      const pending = reservations.filter(r => r.status === 'pending').length;
      els.reservationsBadge.textContent = pending;
      els.reservationsBadge.hidden = pending === 0;
    } catch { /* badge is non-critical */ }
  }

  function renderReservations(reservations) {
    if (!reservations.length) {
      els.reservationsBody.innerHTML = '<tr><td colspan="6" class="empty-state">No reservations found.</td></tr>';
      return;
    }
    const statuses = ['pending', 'confirmed', 'completed', 'cancelled'];
    // Offer any table that can seat the party (not just an exact match),
    // closest fit first, so e.g. a party of 2 can still be seated at a free
    // 4-top when no 2-top is available.
    const tableOptionsByReservation = (guests) => restaurantTables
      .filter(t => Number(t.seats) >= Number(guests))
      .sort((a, b) => Number(a.seats) - Number(b.seats))
      .map(table => `${table.tableNumber}|${table.seats}`);
    els.reservationsBody.innerHTML = reservations.map(r => `
      <tr>
        <td><div class="reservation-guest"><span class="guest-initial">${escapeHtml((r.guestName || '?').trim().charAt(0).toUpperCase())}</span><span><strong>${escapeHtml(r.guestName)}</strong><small>${escapeHtml(r.email)}<br>${escapeHtml(r.phone)}</small></span></div></td>
        <td>${reservationDateTime(r)}</td><td>${Number(r.guests)}</td>
        <td><select class="reservation-table-select" data-reservation="${r._id}"><option value="">Assign table</option>${tableOptionsByReservation(r.guests).map(entry => { const [t, seats] = entry.split('|'); return `<option value="${t}" ${r.tableNumber === t ? 'selected' : ''}>${t} (${seats} seats)</option>`; }).join('') || '<option value="" disabled>No table big enough</option>'}</select></td>
        <td><select class="reservation-status-select status-${escapeHtml(r.status)}" data-reservation="${r._id}">${statuses.map(s => `<option value="${s}" ${r.status === s ? 'selected' : ''}>${reservationStatusLabel(s)}</option>`).join('')}</select></td>
        <td><button class="btn-primary reservation-save-btn" data-reservation="${r._id}">Save</button></td>
      </tr>`).join('');

    els.reservationsBody.querySelectorAll('.reservation-save-btn').forEach(btn => btn.addEventListener('click', async () => {
      const id = btn.dataset.reservation;
      const tableNumber = els.reservationsBody.querySelector(`.reservation-table-select[data-reservation="${id}"]`).value;
      const status = els.reservationsBody.querySelector(`.reservation-status-select[data-reservation="${id}"]`).value;
      btn.disabled = true; btn.textContent = 'Saving...';
      try {
        const res = await fetch(`/api/reservations/${id}`, { method: 'PUT', headers: authHeaders, body: JSON.stringify({ tableNumber, status }) });
        if (handleAuthFailure(res)) return;
        const data = await safeJson(res);
        if (!res.ok) throw new Error(data.error || 'Could not update reservation');
        showToast(`Reservation for ${data.guestName} updated.`);
        loadReservations();
      } catch (err) {
        showToast(err.message || 'Could not update reservation.', true);
        btn.disabled = false; btn.textContent = 'Save';
      }
    }));
  }

  els.reservationFilterTabs.addEventListener('click', (e) => {
    const btn = e.target.closest('.booking-nav-link');
    if (!btn) return;
    els.reservationFilterTabs.querySelectorAll('.booking-nav-link').forEach(tab => tab.classList.remove('active'));
    btn.classList.add('active');
    currentReservationFilter = btn.dataset.status;
    loadReservations();
  });

  // ---------- Complaints view ----------
  async function loadComplaintBadge() {
    try {
      const res = await fetch('/api/complaints/stats/summary', { headers: authHeaders });
      if (handleAuthFailure(res)) return;
      const stats = await safeJson(res);
      if (!res.ok) return;
      const openCount = (stats.new || 0) + (stats.inProgress || 0);
      els.statComplaints.textContent = stats.new || 0;
      els.statComplaintsSub.textContent = openCount ? `${openCount} awaiting reply` : 'all clear';
      if (stats.new > 0) {
        els.complaintsBadge.textContent = stats.new;
        els.complaintsBadge.hidden = false;
      } else {
        els.complaintsBadge.hidden = true;
      }
    } catch { /* silent — badge just won't update this cycle */ }
  }

  async function loadComplaints() {
    els.complaintsList.innerHTML = '<div class="empty-state">Loading…</div>';
    try {
      const url = currentComplaintFilter ? `/api/complaints?status=${currentComplaintFilter}` : '/api/complaints';
      const res = await fetch(url, { headers: authHeaders });
      if (handleAuthFailure(res)) return;
      const complaints = await safeJson(res);
      if (!res.ok) throw new Error(complaints.error || 'Failed to load complaints');
      allComplaints = complaints;
      renderComplaints(complaints);
      loadComplaintBadge();
    } catch (err) {
      els.complaintsList.innerHTML = `<div class="empty-state">${escapeHtml(err.message || 'Failed to load complaints.')}</div>`;
    }
  }

  function renderComplaints(list) {
    if (!list.length) {
      els.complaintsList.innerHTML = '<div class="empty-state">No complaints here. Nice and quiet. 🎉</div>';
      return;
    }
    const statuses = ['new', 'in-progress', 'resolved'];
    els.complaintsList.innerHTML = list.map((c, i) => `
      <div class="complaint-card status-${c.status}" style="animation-delay:${Math.min(i * 45, 400)}ms">
        <div class="complaint-top">
          <div>
            <span class="badge complaint-badge ${c.status}">${c.status.replace('-', ' ')}</span>
            ${c.orderNumber ? `<span class="complaint-order">Order ${escapeHtml(c.orderNumber)}</span>` : ''}
          </div>
          <span class="cust">${timeAgo(c.createdAt)}</span>
        </div>
        <p class="complaint-subject">${escapeHtml(c.subject || 'General')}</p>
        <p class="complaint-message">${escapeHtml(c.message)}</p>
        <div class="complaint-cust" style="margin-bottom:8px">
          <span class="n">${escapeHtml(c.customerName)}</span>
          <span class="cust">${escapeHtml(c.customerPhone)}${c.customerEmail ? ' · ' + escapeHtml(c.customerEmail) : ''}</span>
        </div>
        <textarea class="reply-input" data-complaint="${c._id}" placeholder="Write a reply the customer will see on their account page…" rows="2" style="width:100%;box-sizing:border-box;margin-bottom:8px">${escapeHtml(c.adminNote || '')}</textarea>
        <div class="complaint-bottom">
          <button class="reply-save-btn" data-complaint="${c._id}">Save Reply</button>
          <select class="status-select" data-complaint="${c._id}">
            ${statuses.map(s => `<option value="${s}" ${s === c.status ? 'selected' : ''}>${s.replace('-', ' ')}</option>`).join('')}
          </select>
        </div>
      </div>
    `).join('');

    els.complaintsList.querySelectorAll('.status-select').forEach(sel => {
      sel.addEventListener('change', async (e) => {
        const id = e.target.dataset.complaint;
        const newStatus = e.target.value;
        try {
          const res = await fetch(`/api/complaints/${id}/status`, {
            method: 'PUT',
            headers: authHeaders,
            body: JSON.stringify({ status: newStatus })
          });
          if (handleAuthFailure(res)) return;
          if (!res.ok) throw new Error();
          showToast(`Complaint marked ${newStatus.replace('-', ' ')}`);
          loadComplaints();
        } catch {
          showToast('Could not update complaint', true);
        }
      });
    });

    els.complaintsList.querySelectorAll('.reply-save-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.target.dataset.complaint;
        const textarea = els.complaintsList.querySelector(`.reply-input[data-complaint="${id}"]`);
        const currentStatus = allComplaints.find(c => c._id === id)?.status || 'in-progress';
        // Saving a reply while still "new" moves it to in-progress automatically
        const nextStatus = currentStatus === 'new' ? 'in-progress' : currentStatus;
        try {
          const res = await fetch(`/api/complaints/${id}/status`, {
            method: 'PUT',
            headers: authHeaders,
            body: JSON.stringify({ status: nextStatus, adminNote: textarea.value })
          });
          if (handleAuthFailure(res)) return;
          if (!res.ok) throw new Error();
          showToast('Reply saved — the customer will see it on their account page.');
          loadComplaints();
        } catch {
          showToast('Could not save reply', true);
        }
      });
    });
  }

  els.complaintFilterTabs.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-tab');
    if (!btn) return;
    els.complaintFilterTabs.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    currentComplaintFilter = btn.dataset.status;
    loadComplaints();
  });

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, m => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[m]));
  }

  // ---------- Boot ----------
  // Load a lightweight overview first to speed initial render (stats only).
  loadOverviewLite();
  // Defer heavier badge/table requests slightly so the UI paints first
  setTimeout(() => { loadComplaintBadge(); updateReservationBadge(); }, 1200);
  // Poll less frequently to reduce repeated load on backend
  setInterval(loadComplaintBadge, 45000);
  setInterval(updateReservationBadge, 45000);
  // Keep views fresh, but with a longer interval and lighter overview refresh
  setInterval(() => {
    if (currentView === 'orders') loadOrders();
    if (currentView === 'overview') loadOverviewLite();
    if (currentView === 'reservations') loadReservations();
  }, 20000);
})();