(() => {
  'use strict';

  // ---------- Auth guard ----------
  const token = localStorage.getItem('eb_admin_token');
  if (!token) {
    window.location.href = 'login.html';
    return;
  }
  const user = JSON.parse(localStorage.getItem('eb_admin_user') || '{"username":"Admin","role":"admin"}');

  // Enforce temporary password change before access
  if (user && user.mustChangePassword) {
    window.location.href = '/admin/login';
    return;
  }

  // A superadmin has no home branch of their own, so they can only open
  // this dashboard "as" a specific branch — reached by clicking into a
  // branch from /superadmin, which links here as /admin?branchId=<id>.
  // Without that param there is nothing for this dashboard to show, so
  // send them back to pick one.
  let viewingBranchId = null;
  if (user.role !== 'admin' && user.role !== 'owner') {
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
        <h1>${escapeHtml(tenantBrandName)}</h1>
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
        <div class="qr-modal-brand">${escapeHtml(tenantBrandName)}</div>
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
      return { error: `Server returned an unexpected response (status ${res.status}).` };
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
      chefs: document.getElementById('view-chefs'),
      riders: document.getElementById('view-riders'),
      payments: document.getElementById('view-payments')
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
    itemImagePreview: document.getElementById('itemImagePreview'),
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

    chefsBody: document.getElementById('chefsBody'),
    chefsCountLabel: document.getElementById('chefsCountLabel'),
    addChefBtn: document.getElementById('addChefBtn'),
    chefModalBackdrop: document.getElementById('chefModalBackdrop'),
    chefModalTitle: document.getElementById('chefModalTitle'),
    chefForm: document.getElementById('chefForm'),
    chefId: document.getElementById('chefId'),
    chefUsername: document.getElementById('chefUsername'),
    chefUsernameField: document.getElementById('chefUsernameField'),
    chefPassword: document.getElementById('chefPassword'),
    chefPasswordField: document.getElementById('chefPasswordField'),
    chefName: document.getElementById('chefName'),
    chefEmail: document.getElementById('chefEmail'),
    chefPhone: document.getElementById('chefPhone'),
    chefFormError: document.getElementById('chefFormError'),
    chefModalCancel: document.getElementById('chefModalCancel'),

    dashboardViewerBackdrop: document.getElementById('dashboardViewerBackdrop'),
    dashboardViewerIcon: document.getElementById('dashboardViewerIcon'),
    dashboardViewerTitle: document.getElementById('dashboardViewerTitle'),
    dashboardViewerSub: document.getElementById('dashboardViewerSub'),
    dashboardViewerFrame: document.getElementById('dashboardViewerFrame'),
    dashboardViewerNewTab: document.getElementById('dashboardViewerNewTab'),
    dashboardViewerClose: document.getElementById('dashboardViewerClose'),

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
  let allChefs = [];
  let regions = [];
  let maxActiveOrders = 5;

  // ---------- Kitchen chefs ----------
  async function refreshChefsView() {
    els.chefsBody.innerHTML = '<tr><td colspan="6" class="empty-state">Loading…</td></tr>';
    try {
      const res = await fetch('/api/kitchen/chefs', { headers: authHeaders });
      if (handleAuthFailure(res)) return;
      const data = await safeJson(res);
      if (!res.ok || !data.success) throw new Error(data.message || 'Could not load chefs');
      allChefs = data.chefs || [];
      renderChefsTable();
    } catch (err) {
      els.chefsBody.innerHTML = `<tr><td colspan="6" class="empty-state">${escapeHtml(err.message || 'Could not load chefs')}</td></tr>`;
    }
  }

  function openDashboardViewer({ type, title, subtitle, url }) {
    if (!els.dashboardViewerBackdrop) return;
    if (els.dashboardViewerIcon) els.dashboardViewerIcon.textContent = type === 'chef' ? '👨‍🍳' : '🛵';
    if (els.dashboardViewerTitle) els.dashboardViewerTitle.textContent = title || 'Live Dashboard';
    if (els.dashboardViewerSub) els.dashboardViewerSub.textContent = subtitle || 'Live preview mode';
    if (els.dashboardViewerNewTab) els.dashboardViewerNewTab.href = url;
    if (els.dashboardViewerFrame) els.dashboardViewerFrame.src = url;
    els.dashboardViewerBackdrop.hidden = false;
  }

  function closeDashboardViewer() {
    if (!els.dashboardViewerBackdrop) return;
    els.dashboardViewerBackdrop.hidden = true;
    if (els.dashboardViewerFrame) els.dashboardViewerFrame.src = 'about:blank';
  }

  els.dashboardViewerClose && els.dashboardViewerClose.addEventListener('click', closeDashboardViewer);
  els.dashboardViewerBackdrop && els.dashboardViewerBackdrop.addEventListener('click', (e) => {
    if (e.target === els.dashboardViewerBackdrop) closeDashboardViewer();
  });

  function renderChefsTable() {
    els.chefsCountLabel.textContent = allChefs.length ? `${allChefs.length} chef${allChefs.length === 1 ? '' : 's'}` : 'No chefs yet';
    if (!allChefs.length) {
      els.chefsBody.innerHTML = '<tr><td colspan="7" class="empty-state">No kitchen chefs yet. Add one to get started.</td></tr>';
      return;
    }
    els.chefsBody.innerHTML = allChefs.map(c => `
      <tr>
        <td>${escapeHtml(c.name || c.username)}</td><td class="cust">${escapeHtml(c.username)}</td>
        <td>${c.email ? escapeHtml(c.email) : '<span class="cust">Not set</span>'}</td>
        <td>${c.phone ? escapeHtml(c.phone) : '<span class="cust">Not set</span>'}</td>
        <td><span class="badge ${c.active ? 'delivered' : 'cancelled'}">${c.active ? 'active' : 'inactive'}</span></td>
        <td style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="reply-save-btn edit-chef-btn" data-id="${c._id}">Edit Chef</button>
          <button class="btn-ghost toggle-chef-btn" data-id="${c._id}" style="padding:6px 12px;font-size:12px;">${c.active ? 'Deactivate' : 'Activate'}</button>
          <button class="btn-preview view-chef-btn" data-id="${c._id}" data-name="${escapeHtml(c.name || c.username)}" title="View Kitchen Display dashboard for this chef">👁 View Dashboard</button>
        </td>
      </tr>`).join('');
    els.chefsBody.querySelectorAll('.edit-chef-btn').forEach(btn => btn.addEventListener('click', () => openChefModal(allChefs.find(c => c._id === btn.dataset.id))));
    els.chefsBody.querySelectorAll('.toggle-chef-btn').forEach(btn => btn.addEventListener('click', () => toggleChef(btn.dataset.id)));
    els.chefsBody.querySelectorAll('.view-chef-btn').forEach(btn => btn.addEventListener('click', () => {
      openDashboardViewer({
        type: 'chef',
        title: `Kitchen Dashboard — ${btn.dataset.name}`,
        subtitle: `Live kitchen order queue and ticket board for chef ${btn.dataset.name}`,
        url: `/kitchen?adminPreview=1&chefName=${encodeURIComponent(btn.dataset.name)}`
      });
    }));
  }

  function openChefModal(chef = null) {
    els.chefForm.reset(); els.chefFormError.hidden = true;
    const editing = Boolean(chef);
    els.chefModalTitle.textContent = editing ? `Edit Chef — ${chef.name || chef.username}` : 'Add Kitchen Chef';
    els.chefId.value = editing ? chef._id : '';
    els.chefUsernameField.hidden = editing; els.chefPasswordField.hidden = editing;
    els.chefName.value = editing ? (chef.name || '') : '';
    els.chefEmail.value = editing ? (chef.email || '') : '';
    els.chefPhone.value = editing ? (chef.phone || '') : '';
    els.chefModalBackdrop.hidden = false;
  }
  function closeChefModal() { els.chefModalBackdrop.hidden = true; }
  async function toggleChef(id) {
    try {
      const res = await fetch(`/api/kitchen/chefs/${id}/toggle`, { method: 'PUT', headers: authHeaders });
      if (handleAuthFailure(res)) return;
      const data = await safeJson(res);
      if (!res.ok || !data.success) throw new Error(data.message || 'Could not update chef');
      showToast(data.message); refreshChefsView();
    } catch (err) { showToast(err.message || 'Could not update chef', true); }
  }
  els.addChefBtn && els.addChefBtn.addEventListener('click', () => openChefModal());
  els.chefModalCancel && els.chefModalCancel.addEventListener('click', closeChefModal);
  els.chefModalBackdrop && els.chefModalBackdrop.addEventListener('click', e => { if (e.target === els.chefModalBackdrop) closeChefModal(); });
  els.chefForm && els.chefForm.addEventListener('submit', async e => {
    e.preventDefault(); els.chefFormError.hidden = true;
    const id = els.chefId.value;
    const body = { name: els.chefName.value.trim(), email: els.chefEmail.value.trim(), phone: els.chefPhone.value.trim() };
    if (!id) { body.username = els.chefUsername.value.trim(); body.password = els.chefPassword.value; }
    if (!id && (!body.username || !body.password)) { els.chefFormError.textContent = 'Username and password are required.'; els.chefFormError.hidden = false; return; }
    try {
      const res = await fetch(id ? `/api/kitchen/chefs/${id}` : '/api/kitchen/chefs', { method: id ? 'PUT' : 'POST', headers: authHeaders, body: JSON.stringify(body) });
      if (handleAuthFailure(res)) return;
      const data = await safeJson(res);
      if (!res.ok || !data.success) throw new Error(data.message || 'Could not save chef');
      showToast(data.message || 'Chef saved'); closeChefModal(); refreshChefsView();
    } catch (err) { els.chefFormError.textContent = err.message || 'Something went wrong'; els.chefFormError.hidden = false; }
  });

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
      els.ridersBody.innerHTML = '<tr><td colspan="8" class="empty-state">No delivery riders yet. Add one to get started.</td></tr>';
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
          <button class="btn-preview view-rider-btn" data-id="${r._id}" data-name="${escapeHtml(r.name || r.username)}" data-region="${escapeHtml(r.region || '')}" title="View Delivery Dashboard for this rider">👁 View Dashboard</button>
        </td>
      </tr>
    `).join('');

    els.ridersBody.querySelectorAll('.change-region-btn').forEach(btn => {
      btn.addEventListener('click', () => openRiderModal({ mode: 'edit', id: btn.dataset.id, region: btn.dataset.region, name: btn.dataset.name, phone: btn.dataset.phone }));
    });

    els.ridersBody.querySelectorAll('.toggle-rider-btn').forEach(btn => {
      btn.addEventListener('click', () => toggleRider(btn.dataset.id));
    });

    els.ridersBody.querySelectorAll('.view-rider-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        openDashboardViewer({
          type: 'rider',
          title: `Rider Dashboard — ${btn.dataset.name}`,
          subtitle: `Region: ${btn.dataset.region || 'Not assigned'} · Assigned orders & live delivery map`,
          url: `/delivery?adminPreview=1&riderId=${encodeURIComponent(btn.dataset.id)}&riderName=${encodeURIComponent(btn.dataset.name)}`
        });
      });
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
    const titles = { overview: 'Overview', orders: 'Orders', menu: 'Menu Items', reservations: 'Reservations', floorplans: 'Floor Plans', complaints: 'Complaints', chefs: 'Kitchen Chefs', riders: 'Delivery Riders', payments: 'Payments & Revenue' };
    els.pageTitle.textContent = titles[name] || 'Overview';
    if (name === 'orders') { loadRiders(); loadOrders(); }
    if (name === 'overview') loadOverview();
    if (name === 'menu') loadMenu();
    if (name === 'reservations') loadReservations();
    if (name === 'floorplans') { loadTables(); loadReservations(); }
    if (name === 'complaints') loadComplaints();
    if (name === 'riders') refreshRidersView();
    if (name === 'chefs') refreshChefsView();
    if (name === 'payments') initPaymentsView();
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

  let tenantCurrencySymbol = 'Rs';
  let tenantBrandName = 'Ember & Brew';

  function money(n) {
    const num = Number(n || 0);
    return `${tenantCurrencySymbol} ${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  async function loadTenantBranding() {
    try {
      const res = await fetch('/api/tenants/me/profile', { headers: authHeaders });
      if (res.status === 401) return;
      const data = await safeJson(res);
      if (data && data.tenant) {
        const t = data.tenant;
        if (t.currencySymbol) {
          tenantCurrencySymbol = t.currencySymbol;
        } else if (t.currency) {
          tenantCurrencySymbol = t.currency;
        }
        if (t.name) {
          tenantBrandName = t.name;
          document.title = `${t.name} — Admin Dashboard`;
          const brandEl = document.getElementById('sidebarBrandName');
          if (brandEl) brandEl.textContent = t.name;
        }
        if (t.logo) {
          const logoEl = document.getElementById('sidebarLogo');
          if (logoEl) logoEl.src = t.logo;
        }
        if (t.theme && t.theme.primaryColor) {
          document.documentElement.style.setProperty('--gold', t.theme.primaryColor);
          document.documentElement.style.setProperty('--gold-deep', t.theme.primaryColor);
        }
        if (data.role === 'owner') {
          els.userRole.textContent = `Owner (${t.name})`;
        } else if (data.role === 'admin') {
          els.userRole.textContent = `Admin (${t.name})`;
        }
      }
    } catch (e) {
      console.warn('Failed to load tenant branding', e);
    }
  }
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
      const statsRes = await fetch('/api/orders/stats/summary', { headers: authHeaders });
      if (handleAuthFailure(statsRes)) return;
      const stats = await safeJson(statsRes);
      if (statsRes.ok) {
        els.statRevenue.textContent = money(stats.totalRevenue);
        els.statRevenueSub.textContent = (stats.totalOrders || 0) + ' orders total';
        els.statToday.textContent = stats.todayOrders || 0;
        els.statPending.textContent = stats.pendingCount || 0;
        renderPopularDishes(stats.popularDishes || []);
      } else {
        throw new Error(stats.error || 'Failed to load stats');
      }
    } catch (err) {
      showToast(err.message || 'Could not load dashboard stats', true);
      els.popularDishesBody.innerHTML = '<div class="empty-state">Could not reach the server.</div>';
    }

    try {
      const ordersRes = await fetch('/api/orders', { headers: authHeaders });
      if (handleAuthFailure(ordersRes)) return;
      const orders = await safeJson(ordersRes);
      if (!ordersRes.ok) throw new Error(orders.error || 'Failed to load orders');

      if (Array.isArray(orders)) {
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

        renderRecentOrders(orders.slice(0, 6));
        renderRevenueOverview(orders);
        renderOrderTypeDonut(orders);
      }
    } catch (err) {
      els.recentOrdersBody.innerHTML = '<tr><td colspan="4" class="empty-state">Could not reach the server.</td></tr>';
    }

    try {
      const res = await fetch('/api/menu/admin', { headers: authHeaders });
      if (handleAuthFailure(res)) return;
      const items = await safeJson(res);
      if (!res.ok) throw new Error(items.error || 'Failed to load menu');
      allMenuItems = Array.isArray(items) ? items : [];
      els.statMenuCount.textContent = allMenuItems.length;
      const unavailable = allMenuItems.filter(i => !i.available).length;
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
    els.weeklyRevenueAmount.textContent = thisWeekRevenue >= 1000 ? `${tenantCurrencySymbol} ${(thisWeekRevenue / 1000).toFixed(1)}K` : money(thisWeekRevenue);
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
          <div class="mini-stat-head"><span class="mini-stat-icon revenue">${escapeHtml(tenantCurrencySymbol)}</span><span class="mini-stat-label">Revenue</span></div>
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
      case 'pending_admin':
        // Admin decision point: approve for the kitchen or reject.
        return ['pending_admin', 'pending_kitchen', 'cancelled'];
      case 'pending_kitchen':
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
    if (['pending_kitchen', 'received', 'preparing'].includes(o.status)) {
      return 'Controlled by the kitchen — the chef updates this stage';
    }
    if (['completed', 'delivered', 'cancelled'].includes(o.status)) {
      return 'Order finalized — status is locked';
    }
    return '';
  }

  function adminStatusLabel(status) {
    if (status === 'pending_admin') return 'Awaiting review';
    if (status === 'pending_kitchen') return 'Approve — Send to Kitchen';
    if (status === 'cancelled') return 'Reject — Cancel Order';
    return status.replace('-', ' ');
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
            ${allowed.map(s => `<option value="${s}" ${s === o.status ? 'selected' : ''}>${adminStatusLabel(s)}</option>`).join('')}
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
      const payStatus = (o.paymentStatus || 'PENDING').toUpperCase();
      const isPaid = payStatus === 'PAID';
      const isFailed = payStatus === 'FAILED';
      const isProcessing = payStatus === 'PROCESSING';
      const isCod = o.paymentMethod === 'cash';

      const payBg = isPaid ? 'rgba(74,222,128,0.15);color:#4ade80;border:1px solid rgba(74,222,128,0.3)'
        : isFailed ? 'rgba(239,68,68,0.15);color:#ef4444;border:1px solid rgba(239,68,68,0.3)'
        : isProcessing ? 'rgba(56,189,248,0.15);color:#38bdf8;border:1px solid rgba(56,189,248,0.3)'
        : 'rgba(212,168,83,0.15);color:#D4A853;border:1px solid rgba(212,168,83,0.3)';

      const verifyBtn = (!isPaid && !isCod)
        ? `<button class="verify-payment-btn" data-order-id="${o._id}" style="display:inline-block;margin-top:4px;padding:2px 6px;font-size:10px;border-radius:4px;background:#38bdf8;color:#0f172a;border:none;cursor:pointer;font-weight:700;">🔍 Verify Deposit</button>`
        : '';

      return `
      <tr>
        <td><span class="order-id">${o.orderNumber}</span><br><span class="cust">${timeAgo(o.createdAt)}</span></td>
        <td>
          ${escapeHtml(o.customerName)}<br>
          <span class="cust">${escapeHtml(o.customerPhone || '')}</span>
          ${o.customerPhone ? `<a href="https://wa.me/${String(o.customerPhone).replace(/\D/g, '').replace(/^0/, '92')}?text=${encodeURIComponent(`Hello ${o.customerName || 'Customer'}! Regarding your ${encodeURIComponent(tenantBrandName)} order #${o.orderNumber} (Status: ${o.status})`)}" target="_blank" title="WhatsApp Customer (Free)" style="display:inline-flex;align-items:center;margin-left:4px;color:#25D366;text-decoration:none;font-size:12px;font-weight:600;">💬</a>` : ''}
        </td>
        <td style="text-transform:capitalize;">${o.orderType || '—'}</td>
        <td class="cust">${renderRegionOrTableCell(o)}</td>
        <td class="cust">${o.items.map(i => `${i.qty}× ${escapeHtml(i.name)}`).join(', ')}</td>
        <td>
          ${money(o.total)}<br>
          <span style="display:inline-block;margin-top:3px;font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;text-transform:uppercase;background:${payBg}">
            ${escapeHtml(o.paymentMethod || 'cash')} · ${payStatus}
          </span>
          ${verifyBtn}
          ${o.paymentDetails?.verifiedBy ? `<span style="font-size:9px;color:var(--ink-3);display:block;margin-top:2px;">by ${escapeHtml(o.paymentDetails.verifiedBy)}</span>` : ''}
        </td>
        <td><span class="badge ${o.status}">${o.status.replace('-', ' ')}</span></td>
        <td>${renderDeliveryCell(o)}</td>
        <td><div class="update-cell">${statusCell}${qrCell}</div></td>
      </tr>
    `;
    }).join('');

    els.ordersBody.querySelectorAll('.verify-payment-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const order = orders.find(o => String(o._id) === btn.dataset.orderId);
        if (order) openPaymentVerifyModal(order);
      });
    });

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
  let editingItemHasImage = false; // true when editing an item that already has an image on file

  function openItemModal(item) {
    els.itemFormError.hidden = true;
    els.itemImage.value = '';
    if (item) {
      els.itemModalTitle.textContent = 'Edit Menu Item';
      els.itemId.value = item._id;
      els.itemName.value = item.name;
      els.itemDescription.value = item.description;
      els.itemPrice.value = item.price;
      els.itemCategory.value = item.category;
      els.itemAvailable.checked = item.available;
      editingItemHasImage = Boolean(item.image);
      els.itemImagePreview.src = item.image || '';
      els.itemImagePreview.hidden = !item.image;
    } else {
      els.itemModalTitle.textContent = 'Add Menu Item';
      els.itemForm.reset();
      els.itemId.value = '';
      els.itemAvailable.checked = true;
      editingItemHasImage = false;
      els.itemImagePreview.src = '';
      els.itemImagePreview.hidden = true;
    }
    els.itemModalBackdrop.hidden = false;
  }
  function closeItemModal() { els.itemModalBackdrop.hidden = true; }

  els.addItemBtn.addEventListener('click', () => openItemModal(null));
  els.itemModalCancel.addEventListener('click', closeItemModal);
  els.itemModalBackdrop.addEventListener('click', (e) => { if (e.target === els.itemModalBackdrop) closeItemModal(); });

  // Live preview when the admin picks a new file
  els.itemImage.addEventListener('change', () => {
    const file = els.itemImage.files[0];
    if (!file) return;
    els.itemImagePreview.src = URL.createObjectURL(file);
    els.itemImagePreview.hidden = false;
  });

  els.itemForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    els.itemFormError.hidden = true;
    const id = els.itemId.value;
    const file = els.itemImage.files[0];

    if (!id && !file) {
      els.itemFormError.textContent = 'Please choose an image.';
      els.itemFormError.hidden = false;
      return;
    }

    const formData = new FormData();
    formData.append('name', els.itemName.value.trim());
    formData.append('description', els.itemDescription.value.trim());
    formData.append('price', parseFloat(els.itemPrice.value));
    formData.append('category', els.itemCategory.value.trim());
    formData.append('available', els.itemAvailable.checked);
    if (file) formData.append('image', file);

    try {
      // Don't send authHeaders as-is — it hardcodes Content-Type: application/json,
      // but FormData needs the browser to set its own multipart boundary.
      const { 'Content-Type': _drop, ...fileUploadHeaders } = authHeaders;
      const res = await fetch(id ? `/api/menu/${id}` : '/api/menu', {
        method: id ? 'PUT' : 'POST',
        headers: fileUploadHeaders,
        body: formData
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
    function minutesFromTimeStr(timeStr) {
      if (!timeStr) return 0;
      const str = String(timeStr).trim();
      const match12 = str.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
      if (match12) {
        let h = Number(match12[1]);
        const m = Number(match12[2]);
        const period = match12[3].toUpperCase();
        if (period === 'PM' && h < 12) h += 12;
        if (period === 'AM' && h === 12) h = 0;
        return h * 60 + m;
      }
      const match24 = str.match(/^(\d{1,2}):(\d{2})/);
      if (match24) {
        const h = Number(match24[1]);
        const m = Number(match24[2]);
        return h * 60 + m;
      }
      return 0;
    }

    // Only offer FREE tables that are not already assigned to another confirmed reservation
    // at an overlapping time on the same date.
    const freeTableOptionsForReservation = (r) => {
      const partySize = Number(r.guests) || 1;
      const rStart = minutesFromTimeStr(r.time);

      const busyTableNumbers = new Set();
      reservations.forEach(other => {
        if (String(other._id) === String(r._id)) return;
        if (other.date !== r.date) return;
        if (!['confirmed'].includes(other.status)) return;
        if (!other.tableNumber) return;

        const otherStart = minutesFromTimeStr(other.time);
        if (Math.abs(otherStart - rStart) < 120) {
          busyTableNumbers.add(other.tableNumber);
        }
      });

      return restaurantTables
        .filter(t => {
          const seatsOk = Number(t.seats) >= partySize;
          const isFree = !busyTableNumbers.has(t.tableNumber) || (r.tableNumber && t.tableNumber === r.tableNumber);
          return seatsOk && isFree;
        })
        .sort((a, b) => Number(a.seats) - Number(b.seats))
        .map(table => `${table.tableNumber}|${table.seats}`);
    };

    const statusPriority = { pending: 0, confirmed: 1, completed: 2, cancelled: 3 };
    const sortedReservations = [...reservations].sort((a, b) => {
      const pA = statusPriority[a.status] !== undefined ? statusPriority[a.status] : 99;
      const pB = statusPriority[b.status] !== undefined ? statusPriority[b.status] : 99;
      if (pA !== pB) return pA - pB;
      if (a.date !== b.date) return (a.date || '').localeCompare(b.date || '');
      return (a.time || '').localeCompare(b.time || '');
    });

    els.reservationsBody.innerHTML = sortedReservations.map(r => `
      <tr>
        <td>
          <div class="reservation-guest">
            <span class="guest-initial">${escapeHtml((r.guestName || '?').trim().charAt(0).toUpperCase())}</span>
            <span>
              <strong>${escapeHtml(r.guestName)}</strong>
              <small>${escapeHtml(r.email)}<br>${escapeHtml(r.phone)}</small>
              ${r.phone ? `
                <a href="https://wa.me/${String(r.phone).replace(/\D/g, '').replace(/^0/, '92')}?text=${encodeURIComponent('Hello ' + r.guestName + '! Ember & Brew is writing regarding your table reservation for ' + r.date + ' at ' + r.time + (r.tableNumber ? ' (Table ' + r.tableNumber + ')' : '') + '.')}" target="_blank" style="display:inline-flex;align-items:center;gap:4px;color:#25D366;font-weight:700;font-size:11.5px;margin-top:4px;text-decoration:none;">
                  <i class="fa-brands fa-whatsapp"></i> WhatsApp Guest
                </a>
              ` : ''}
            </span>
          </div>
        </td>
        <td>${reservationDateTime(r)}</td><td>${Number(r.guests)}</td>
        <td><select class="reservation-table-select" data-reservation="${r._id}"><option value="">Assign table</option>${freeTableOptionsForReservation(r).map(entry => { const [t, seats] = entry.split('|'); return `<option value="${t}" ${r.tableNumber === t ? 'selected' : ''}>${t} (${seats} seats)</option>`; }).join('') || '<option value="" disabled>No free tables for this time</option>'}</select></td>
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

  // ---------- Payment Verification Modal & Settings ----------
  let currentVerifyingOrder = null;

  function openPaymentVerifyModal(order) {
    currentVerifyingOrder = order;
    const modal = document.getElementById('paymentVerifyModalBackdrop');
    const details = document.getElementById('verifyModalDetails');
    const notes = document.getElementById('verifyNotes');
    if (!modal || !details) return;

    if (notes) notes.value = '';
    const pd = order.paymentDetails || {};
    details.innerHTML = `
      <div style="display:flex;justify-content:space-between;"><strong>Order Number:</strong> <span>${escapeHtml(order.orderNumber)}</span></div>
      <div style="display:flex;justify-content:space-between;"><strong>Total Amount:</strong> <span style="font-weight:bold;color:#4ade80;">${money(order.total)}</span></div>
      <div style="display:flex;justify-content:space-between;"><strong>Payment Method:</strong> <span style="text-transform:uppercase;font-weight:600;">${escapeHtml(order.paymentMethod || 'manual')}</span></div>
      <div style="display:flex;justify-content:space-between;"><strong>Current Status:</strong> <span style="font-weight:bold;">${escapeHtml((order.paymentStatus || 'PENDING').toUpperCase())}</span></div>
      <hr style="border:none;border-top:1px solid var(--line);margin:6px 0;" />
      <div style="display:flex;justify-content:space-between;"><strong>Customer / Sender:</strong> <span style="color:#38bdf8;">${escapeHtml(pd.senderName || order.customerName || '—')}</span></div>
      <div style="display:flex;justify-content:space-between;"><strong>Deposit Ref / TID:</strong> <span style="font-family:monospace;font-weight:bold;color:#facc15;">${escapeHtml(pd.referenceId || order.transactionId || 'None')}</span></div>
      ${pd.accountNumber ? `<div style="display:flex;justify-content:space-between;"><strong>Sender Account:</strong> <span>${escapeHtml(pd.accountNumber)}</span></div>` : ''}
      <div style="font-size:11px;color:var(--ink-3);margin-top:8px;background:rgba(255,255,255,0.03);padding:8px;border-radius:6px;">
        💡 Verify this reference ID against your bank statement / SMS before approving. Clicking Approve will mark this order as PAID.
      </div>
    `;

    modal.hidden = false;
  }

  const verifyCancelBtn = document.getElementById('verifyCancelBtn');
  const verifyApproveBtn = document.getElementById('verifyApproveBtn');
  const verifyRejectBtn = document.getElementById('verifyRejectBtn');
  const verifyModal = document.getElementById('paymentVerifyModalBackdrop');

  if (verifyCancelBtn && verifyModal) {
    verifyCancelBtn.addEventListener('click', () => { verifyModal.hidden = true; });
  }

  if (verifyApproveBtn) {
    verifyApproveBtn.addEventListener('click', async () => {
      if (!currentVerifyingOrder) return;
      const notes = document.getElementById('verifyNotes')?.value || '';
      verifyApproveBtn.disabled = true;
      try {
        const res = await fetch(`/api/payments/orders/${currentVerifyingOrder._id}/verify-manual`, {
          method: 'PUT',
          headers: authHeaders,
          body: JSON.stringify({ approved: true, reason: notes })
        });
        if (handleAuthFailure(res)) return;
        if (!res.ok) throw new Error('Verification request failed');
        showToast(`Order #${currentVerifyingOrder.orderNumber} payment approved & marked PAID!`);
        if (verifyModal) verifyModal.hidden = true;
        loadOrders();
      } catch (err) {
        showToast(err.message || 'Could not verify payment', true);
      } finally {
        verifyApproveBtn.disabled = false;
      }
    });
  }

  if (verifyRejectBtn) {
    verifyRejectBtn.addEventListener('click', async () => {
      if (!currentVerifyingOrder) return;
      const notes = document.getElementById('verifyNotes')?.value || '';
      verifyRejectBtn.disabled = true;
      try {
        const res = await fetch(`/api/payments/orders/${currentVerifyingOrder._id}/verify-manual`, {
          method: 'PUT',
          headers: authHeaders,
          body: JSON.stringify({ approved: false, reason: notes })
        });
        if (handleAuthFailure(res)) return;
        if (!res.ok) throw new Error('Rejection request failed');
        showToast(`Order #${currentVerifyingOrder.orderNumber} payment marked FAILED`, true);
        if (verifyModal) verifyModal.hidden = true;
        loadOrders();
      } catch (err) {
        showToast(err.message || 'Could not reject payment', true);
      } finally {
        verifyRejectBtn.disabled = false;
      }
    });
  }

  // Helper to dynamically toggle active class and status badges on payment cards
  function updatePaymentCardUI(cardId, tagId, isEnabled) {
    const card = document.getElementById(cardId);
    const tag = document.getElementById(tagId);
    if (card) {
      card.classList.toggle('active', Boolean(isEnabled));
    }
    if (tag) {
      tag.textContent = isEnabled ? 'Active' : 'Disabled';
      tag.classList.toggle('active', Boolean(isEnabled));
      tag.classList.toggle('inactive', !isEnabled);
    }
  }

  // Register interactive toggle listeners for instant UI feedback
  const paymentToggleBindings = [
    { card: 'card_jazzcash', check: 'jc_enabled', tag: 'jc_status_tag' },
    { card: 'card_easypaisa', check: 'ep_enabled', tag: 'ep_status_tag' },
    { card: 'card_stripe', check: 'st_enabled', tag: 'st_status_tag' },
    { card: 'card_raast', check: 'rs_enabled', tag: 'rs_status_tag' },
    { card: 'card_bank', check: 'bt_enabled', tag: 'bt_status_tag' },
    { card: 'card_cod', check: 'cod_enabled', tag: 'cod_status_tag' }
  ];

  paymentToggleBindings.forEach(({ card, check, tag }) => {
    const el = document.getElementById(check);
    if (el) {
      el.addEventListener('change', () => {
        updatePaymentCardUI(card, tag, el.checked);
      });
    }
  });

  // Global helper to show/hide password secrets
  window.togglePassVisibility = function(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const isPass = input.type === 'password';
    input.type = isPass ? 'text' : 'password';
    if (btn) btn.textContent = isPass ? '🙈' : '👁';
  };

  // Global helper to copy webhook URLs to clipboard
  window.copyWebhookText = function(textOrId, btn) {
    let toCopy = textOrId;
    const targetEl = document.getElementById(textOrId);
    if (targetEl) {
      toCopy = targetEl.textContent.trim();
    }
    if (!toCopy) return;

    const showCopiedState = () => {
      if (!btn) return;
      const originalText = btn.textContent;
      btn.textContent = 'Copied! ✓';
      btn.style.background = '#C4923A';
      btn.style.color = '#FFFFFF';
      setTimeout(() => {
        btn.textContent = originalText;
        btn.style.background = '';
        btn.style.color = '';
      }, 2000);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(toCopy).then(showCopiedState).catch(() => {
        fallbackCopy(toCopy, showCopiedState);
      });
    } else {
      fallbackCopy(toCopy, showCopiedState);
    }
  };

  function fallbackCopy(text, cb) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      if (cb) cb();
    } catch (e) {}
    document.body.removeChild(ta);
  }

  async function loadPaymentSettings() {
    try {
      const res = await fetch('/api/payments/settings', { headers: authHeaders });
      if (handleAuthFailure(res)) return;
      if (!res.ok) throw new Error('Failed to fetch payment settings');
      const data = await res.json();

      const jc = data.jazzcash || {};
      const ep = data.easypaisa || {};
      const st = data.stripe || {};
      const bt = data.bankTransfer || {};
      const rs = data.raast || {};
      const cod = data.cashOnDelivery || {};

      const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val ?? ''; };
      const setChecked = (id, val) => { const el = document.getElementById(id); if (el) el.checked = Boolean(val); };

      setChecked('jc_enabled', jc.enabled);
      updatePaymentCardUI('card_jazzcash', 'jc_status_tag', jc.enabled);
      setVal('jc_mode', jc.mode || 'sandbox');
      setVal('jc_merchantId', jc.merchantId);
      setVal('jc_password', '');
      const jcPassEl = document.getElementById('jc_password');
      if (jcPassEl) jcPassEl.placeholder = jc.isConfigured ? '•••••••• (Configured — leave blank to keep)' : 'Enter Merchant Password';
      setVal('jc_integritySalt', '');
      const jcSaltEl = document.getElementById('jc_integritySalt');
      if (jcSaltEl) jcSaltEl.placeholder = jc.isConfigured ? '•••••••• (Configured — leave blank to keep)' : 'Enter Integrity Salt';

      setChecked('ep_enabled', ep.enabled);
      updatePaymentCardUI('card_easypaisa', 'ep_status_tag', ep.enabled);
      setVal('ep_mode', ep.mode || 'sandbox');
      setVal('ep_storeId', ep.storeId);
      setVal('ep_hashKey', '');
      const epHashEl = document.getElementById('ep_hashKey');
      if (epHashEl) epHashEl.placeholder = ep.isConfigured ? '•••••••• (Configured — leave blank to keep)' : 'Enter Hash Key';

      setChecked('st_enabled', st.enabled);
      updatePaymentCardUI('card_stripe', 'st_status_tag', st.enabled);
      setVal('st_publishableKey', st.publishableKey);
      setVal('st_secretKey', '');
      const stSecEl = document.getElementById('st_secretKey');
      if (stSecEl) stSecEl.placeholder = st.isConfigured ? '•••••••• (Configured — leave blank to keep)' : 'Enter Secret Key (sk_...)';

      const isBt = bt.enabled !== false;
      setChecked('bt_enabled', isBt);
      updatePaymentCardUI('card_bank', 'bt_status_tag', isBt);
      setVal('bt_bankName', bt.bankName);
      setVal('bt_accountTitle', bt.accountTitle);
      setVal('bt_iban', bt.iban);
      setVal('bt_accountNumber', bt.accountNumber);

      const isRs = rs.enabled !== false;
      setChecked('rs_enabled', isRs);
      updatePaymentCardUI('card_raast', 'rs_status_tag', isRs);
      setVal('rs_iban', rs.iban);
      setVal('rs_accountTitle', rs.accountTitle);
      setVal('rs_bankName', rs.bankName);

      const isCod = cod.enabled !== false;
      setChecked('cod_enabled', isCod);
      updatePaymentCardUI('card_cod', 'cod_status_tag', isCod);

      // Populate Webhook URLs dynamically with current host
      const jcUrlEl = document.getElementById('wh_jazzcash_url');
      if (jcUrlEl) jcUrlEl.textContent = `${window.location.origin}/api/payments/ipn/jazzcash`;
      const epUrlEl = document.getElementById('wh_easypaisa_url');
      if (epUrlEl) epUrlEl.textContent = `${window.location.origin}/api/payments/ipn/easypaisa`;
      const strUrlEl = document.getElementById('wh_stripe_url');
      if (strUrlEl) strUrlEl.textContent = `${window.location.origin}/api/payments/stripe/webhook`;
      const retUrlEl = document.getElementById('wh_return_url');
      if (retUrlEl) retUrlEl.textContent = `${window.location.origin}/customer`;
    } catch (err) {
      showToast('Error loading payment settings: ' + err.message, true);
    }
  }

  const savePaymentSettingsBtn = document.getElementById('savePaymentSettingsBtn');
  if (savePaymentSettingsBtn) {
    savePaymentSettingsBtn.addEventListener('click', async () => {
      savePaymentSettingsBtn.disabled = true;
      savePaymentSettingsBtn.textContent = 'Saving…';
      try {
        const payload = {
          jazzcash: {
            enabled: document.getElementById('jc_enabled')?.checked,
            mode: document.getElementById('jc_mode')?.value,
            merchantId: document.getElementById('jc_merchantId')?.value,
            password: document.getElementById('jc_password')?.value,
            integritySalt: document.getElementById('jc_integritySalt')?.value
          },
          easypaisa: {
            enabled: document.getElementById('ep_enabled')?.checked,
            mode: document.getElementById('ep_mode')?.value,
            storeId: document.getElementById('ep_storeId')?.value,
            hashKey: document.getElementById('ep_hashKey')?.value
          },
          stripe: {
            enabled: document.getElementById('st_enabled')?.checked,
            publishableKey: document.getElementById('st_publishableKey')?.value,
            secretKey: document.getElementById('st_secretKey')?.value
          },
          bankTransfer: {
            enabled: document.getElementById('bt_enabled')?.checked,
            bankName: document.getElementById('bt_bankName')?.value,
            accountTitle: document.getElementById('bt_accountTitle')?.value,
            iban: document.getElementById('bt_iban')?.value,
            accountNumber: document.getElementById('bt_accountNumber')?.value
          },
          raast: {
            enabled: document.getElementById('rs_enabled')?.checked,
            iban: document.getElementById('rs_iban')?.value,
            accountTitle: document.getElementById('rs_accountTitle')?.value,
            bankName: document.getElementById('rs_bankName')?.value
          },
          cashOnDelivery: {
            enabled: document.getElementById('cod_enabled')?.checked
          }
        };

        const res = await fetch('/api/payments/settings', {
          method: 'PUT',
          headers: authHeaders,
          body: JSON.stringify(payload)
        });
        if (handleAuthFailure(res)) return;
        if (!res.ok) throw new Error('Failed to update payment settings');

        showToast('Payment settings saved successfully!');
        loadPaymentSettings();
      } catch (err) {
        showToast('Could not save payment settings: ' + err.message, true);
      } finally {
        savePaymentSettingsBtn.disabled = false;
        savePaymentSettingsBtn.textContent = '💾 Save Payment Settings';
      }
    });
  }

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, m => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[m]));
  }


  // ================================================================
  // ---------- Production Payment Transactions Controller ----------
  // ================================================================
  let activePaymentSubTab = 'transactions';
  let currentPaymentPage = 1;
  let currentPaymentMethodFilter = 'all';
  let currentPaymentStatusFilter = 'all';
  let currentPaymentSearch = '';
  let paymentSearchDebounceTimer = null;
  let activeRefundPayment = null;
  let cachedPaymentTransactions = [];
  let paymentsInitialized = false;

  function initPaymentsView() {
    if (!paymentsInitialized) {
      setupPaymentsUIListeners();
      paymentsInitialized = true;
    }

    if (activePaymentSubTab === 'transactions') {
      loadPaymentTransactions(currentPaymentPage);
    } else {
      loadPaymentSettings();
    }
  }

  function setupPaymentsUIListeners() {
    // Sub-tab toggling
    const subTabTx = document.getElementById('paySubTabTransactions');
    const subTabGw = document.getElementById('paySubTabGateways');
    const viewTx = document.getElementById('paySubViewTransactions');
    const viewGw = document.getElementById('paySubViewGateways');
    const gwActionWrap = document.getElementById('payGatewaysActionWrap');

    function switchSubTab(tab) {
      activePaymentSubTab = tab;
      if (tab === 'transactions') {
        if (subTabTx) {
          subTabTx.classList.add('active');
          subTabTx.style.background = 'var(--ink)';
          subTabTx.style.color = '#fff';
        }
        if (subTabGw) {
          subTabGw.classList.remove('active');
          subTabGw.style.background = 'var(--paper-2)';
          subTabGw.style.color = 'var(--text)';
        }
        if (viewTx) viewTx.style.display = 'block';
        if (viewGw) viewGw.style.display = 'none';
        if (gwActionWrap) gwActionWrap.style.display = 'none';
        loadPaymentTransactions(1);
      } else {
        if (subTabGw) {
          subTabGw.classList.add('active');
          subTabGw.style.background = 'var(--ink)';
          subTabGw.style.color = '#fff';
        }
        if (subTabTx) {
          subTabTx.classList.remove('active');
          subTabTx.style.background = 'var(--paper-2)';
          subTabTx.style.color = 'var(--text)';
        }
        if (viewTx) viewTx.style.display = 'none';
        if (viewGw) viewGw.style.display = 'block';
        if (gwActionWrap) gwActionWrap.style.display = 'flex';
        loadPaymentSettings();
      }
    }

    if (subTabTx) subTabTx.addEventListener('click', () => switchSubTab('transactions'));
    if (subTabGw) subTabGw.addEventListener('click', () => switchSubTab('gateways'));

    // Method filter pills
    document.querySelectorAll('.pay-filter-pill[data-pay-method]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.pay-filter-pill[data-pay-method]').forEach(b => {
          b.classList.toggle('active', b === btn);
          b.style.background = b === btn ? 'var(--ink)' : 'var(--paper-2)';
          b.style.color = b === btn ? '#fff' : 'var(--text)';
        });
        currentPaymentMethodFilter = btn.dataset.payMethod || 'all';
        loadPaymentTransactions(1);
      });
    });

    // Status filter pills
    document.querySelectorAll('.pay-status-pill[data-pay-status]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.pay-status-pill[data-pay-status]').forEach(b => {
          b.classList.toggle('active', b === btn);
          b.style.background = b === btn ? 'var(--ink)' : 'var(--paper-2)';
          b.style.color = b === btn ? '#fff' : 'var(--text)';
        });
        currentPaymentStatusFilter = btn.dataset.payStatus || 'all';
        loadPaymentTransactions(1);
      });
    });

    // Search input with debounce
    const paySearchInput = document.getElementById('paySearchInput');
    if (paySearchInput) {
      paySearchInput.addEventListener('input', (e) => {
        clearTimeout(paymentSearchDebounceTimer);
        paymentSearchDebounceTimer = setTimeout(() => {
          currentPaymentSearch = e.target.value.trim();
          loadPaymentTransactions(1);
        }, 320);
      });
    }

    // Pagination
    const prevBtn = document.getElementById('payPrevPageBtn');
    const nextBtn = document.getElementById('payNextPageBtn');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (currentPaymentPage > 1) {
          loadPaymentTransactions(currentPaymentPage - 1);
        }
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        loadPaymentTransactions(currentPaymentPage + 1);
      });
    }

    // Refund modal listeners
    const refundModal = document.getElementById('refundModalBackdrop');
    const cancelRefundBtn = document.getElementById('cancelRefundBtn');
    const confirmRefundBtn = document.getElementById('confirmRefundBtn');

    if (cancelRefundBtn && refundModal) {
      cancelRefundBtn.addEventListener('click', () => {
        refundModal.hidden = true;
        activeRefundPayment = null;
      });
    }

    if (confirmRefundBtn) {
      confirmRefundBtn.addEventListener('click', async () => {
        if (!activeRefundPayment) return;
        const refundAmtInput = document.getElementById('refundAmountInput');
        const reasonSelect = document.getElementById('refundReasonSelect');
        const reasonNotes = document.getElementById('refundReasonNotes');

        const refundAmount = refundAmtInput ? parseFloat(refundAmtInput.value) : activeRefundPayment.amount;
        if (isNaN(refundAmount) || refundAmount <= 0) {
          showToast('Please enter a valid refund amount greater than 0', true);
          return;
        }
        if (refundAmount > activeRefundPayment.amount) {
          showToast('Refund amount cannot exceed the original transaction amount', true);
          return;
        }

        const reason = (reasonSelect ? reasonSelect.value : 'Customer requested refund') +
          (reasonNotes && reasonNotes.value.trim() ? ' - ' + reasonNotes.value.trim() : '');

        confirmRefundBtn.disabled = true;
        confirmRefundBtn.textContent = 'Processing Refund…';

        try {
          const res = await fetch(`/api/payments/${activeRefundPayment._id}/refund`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({ refundAmount, reason })
          });

          if (handleAuthFailure(res)) return;
          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.error || 'Refund failed');
          }

          showToast(data.message || 'Refund successfully executed!');
          if (refundModal) refundModal.hidden = true;
          activeRefundPayment = null;
          loadPaymentTransactions(currentPaymentPage);
        } catch (err) {
          showToast('Refund error: ' + err.message, true);
        } finally {
          confirmRefundBtn.disabled = false;
          confirmRefundBtn.textContent = 'Confirm Refund';
        }
      });
    }

    // Transaction Details modal close
    const detailsModal = document.getElementById('payDetailsModalBackdrop');
    const closePayDetailsBtn = document.getElementById('closePayDetailsBtn');
    if (closePayDetailsBtn && detailsModal) {
      closePayDetailsBtn.addEventListener('click', () => {
        detailsModal.hidden = true;
      });
    }
  }

  async function loadPaymentTransactions(page = 1) {
    const tbody = document.getElementById('payTransactionsTbody');
    if (!tbody) return;

    currentPaymentPage = page;
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-muted);font-size:13px;"><i class="fa-solid fa-spinner fa-spin"></i> Loading transactions…</td></tr>';

    try {
      const qParams = new URLSearchParams({
        page: currentPaymentPage,
        limit: 15,
        method: currentPaymentMethodFilter,
        status: currentPaymentStatusFilter,
        search: currentPaymentSearch
      });

      const res = await fetch(`/api/payments/admin/transactions?${qParams.toString()}`, {
        headers: authHeaders
      });

      if (handleAuthFailure(res)) return;
      if (!res.ok) throw new Error('Failed to load payment transactions');

      const data = await res.json();
      cachedPaymentTransactions = data.transactions || [];
      const stats = data.stats || {};
      const pagination = data.pagination || {};

      // 1. Render Stats
      const statRevEl = document.getElementById('payStatRevenue');
      const statRevSub = document.getElementById('payStatRevenueSub');
      const statPaid = document.getElementById('payStatPaid');
      const statPending = document.getElementById('payStatPending');
      const statFailed = document.getElementById('payStatFailed');
      const statRefunds = document.getElementById('payStatRefunds');

      if (statRevEl) statRevEl.textContent = money(stats.totalRevenue);
      if (statRevSub) statRevSub.textContent = `${stats.paidCount || 0} completed orders`;
      if (statPaid) statPaid.textContent = stats.paidCount || 0;
      if (statPending) statPending.textContent = stats.pendingCount || 0;
      if (statFailed) statFailed.textContent = stats.failedCount || 0;
      if (statRefunds) {
        statRefunds.textContent = `${stats.refundCount || 0} (${money(stats.refundAmount || 0)})`;
      }

      // 2. Render Table
      if (cachedPaymentTransactions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted);font-size:13px;">No payment transactions found matching the selected criteria.</td></tr>';
      } else {
        tbody.innerHTML = cachedPaymentTransactions.map(tx => {
          const dtStr = new Date(tx.createdAt).toLocaleDateString(undefined, {
            month: 'short', day: 'numeric', year: 'numeric'
          }) + ' ' + new Date(tx.createdAt).toLocaleTimeString(undefined, {
            hour: '2-digit', minute: '2-digit'
          });

          const methodBadge = getPaymentMethodBadge(tx.paymentMethod, tx.provider);
          const statusBadge = getPaymentStatusBadge(tx.status);
          const customerName = tx.customerName || tx.orderId?.customerName || 'Guest Customer';
          const contact = tx.customerPhone || tx.customerEmail || '';

          const currency = tx.currency || 'PKR';
          const sym = tx.branchId?.currencySymbol || (currency === 'PKR' ? 'Rs ' : currency + ' ');
          const formattedAmt = sym + Number(tx.amount || 0).toLocaleString(undefined, {
            minimumFractionDigits: 2, maximumFractionDigits: 2
          });

          const refundNote = tx.refundAmount
            ? `<div style="font-size:11px;color:#c5221f;font-weight:600;margin-top:2px;">↩ Refunded: ${sym}${Number(tx.refundAmount).toLocaleString(undefined, {minimumFractionDigits:2})}</div>`
            : '';

          return `
            <tr style="border-bottom:1px solid var(--border);">
              <td style="padding:12px 14px;font-size:13px;">
                <div style="font-weight:700;color:var(--ink);display:flex;align-items:center;gap:6px;">
                  <span>#${escapeHtml(tx.orderNumber)}</span>
                </div>
                <div style="font-family:monospace;font-size:11px;color:var(--text-muted);margin-top:2px;" title="Transaction / Reference ID">
                  ${escapeHtml(tx.transactionId || '—')}
                </div>
                <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${dtStr}</div>
              </td>
              <td style="padding:12px 14px;font-size:13px;">
                <div style="font-weight:600;color:var(--ink);">${escapeHtml(customerName)}</div>
                ${contact ? `<div style="font-size:11.5px;color:var(--text-muted);margin-top:2px;">${escapeHtml(contact)}</div>` : ''}
              </td>
              <td style="padding:12px 14px;font-size:13px;">
                ${methodBadge}
              </td>
              <td style="padding:12px 14px;font-size:13.5px;font-weight:700;color:var(--ink);">
                ${formattedAmt}
                ${refundNote}
              </td>
              <td style="padding:12px 14px;font-size:13px;">
                ${statusBadge}
              </td>
              <td style="padding:12px 14px;font-size:13px;text-align:right;">
                <div style="display:inline-flex;gap:6px;align-items:center;justify-content:flex-end;">
                  <button type="button" class="btn-ghost btn-sm pay-btn-details" data-id="${tx._id}" style="padding:5px 10px;font-size:12px;border:1px solid var(--border);border-radius:6px;background:var(--paper);cursor:pointer;">
                    Details
                  </button>
                  ${tx.status === 'PAID' ? `
                    <button type="button" class="btn-ghost btn-sm pay-btn-refund" data-id="${tx._id}" style="padding:5px 10px;font-size:12px;border:1px solid rgba(179,57,39,0.3);color:#B33927;border-radius:6px;background:rgba(179,57,39,0.05);cursor:pointer;">
                      Refund
                    </button>
                  ` : ''}
                  ${(tx.status === 'PENDING' && (tx.paymentMethod === 'raast' || tx.paymentMethod === 'bankTransfer')) ? `
                    <button type="button" class="btn-primary btn-sm pay-btn-verify" data-id="${tx._id}" style="padding:5px 10px;font-size:12px;border-radius:6px;cursor:pointer;">
                      Verify
                    </button>
                  ` : ''}
                </div>
              </td>
            </tr>
          `;
        }).join('');

        // Wire up row action handlers
        tbody.querySelectorAll('.pay-btn-details').forEach(btn => {
          btn.addEventListener('click', () => {
            const tx = cachedPaymentTransactions.find(t => t._id === btn.dataset.id);
            if (tx) showPaymentDetailsModal(tx);
          });
        });

        tbody.querySelectorAll('.pay-btn-refund').forEach(btn => {
          btn.addEventListener('click', () => {
            const tx = cachedPaymentTransactions.find(t => t._id === btn.dataset.id);
            if (tx) openRefundModal(tx);
          });
        });

        tbody.querySelectorAll('.pay-btn-verify').forEach(btn => {
          btn.addEventListener('click', () => {
            const tx = cachedPaymentTransactions.find(t => t._id === btn.dataset.id);
            if (tx && tx.orderId) {
              currentVerifyingOrder = typeof tx.orderId === 'object' ? tx.orderId : { _id: tx.orderId, orderNumber: tx.orderNumber };
              openPaymentVerifyModal(currentVerifyingOrder);
            }
          });
        });
      }

      // 3. Update Pagination
      const pageInfo = document.getElementById('payPageInfo');
      const prevBtn = document.getElementById('payPrevPageBtn');
      const nextBtn = document.getElementById('payNextPageBtn');

      if (pageInfo) {
        pageInfo.textContent = `Page ${pagination.page || 1} of ${pagination.pages || 1} (${pagination.total || 0} total)`;
      }
      if (prevBtn) prevBtn.disabled = (pagination.page || 1) <= 1;
      if (nextBtn) nextBtn.disabled = (pagination.page || 1) >= (pagination.pages || 1);

    } catch (err) {
      console.error('loadPaymentTransactions error:', err);
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:#c5221f;font-size:13px;">Error loading transactions: ${escapeHtml(err.message)}</td></tr>`;
    }
  }

  function getPaymentMethodBadge(method, provider) {
    const m = (method || '').toLowerCase();
    const p = (provider || '').toLowerCase();

    if (m === 'stripe' || m === 'card' || p.includes('stripe')) {
      return '<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:12px;font-size:11.5px;font-weight:600;background:#EBF3FE;color:#185ABC;border:1px solid #C2D7FA;">💳 Stripe</span>';
    }
    if (m === 'jazzcash' || p.includes('jazzcash')) {
      return '<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:12px;font-size:11.5px;font-weight:600;background:#FDE8E8;color:#C81E1E;border:1px solid #F8B4B4;">📱 JazzCash</span>';
    }
    if (m === 'easypaisa' || p.includes('easypaisa')) {
      return '<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:12px;font-size:11.5px;font-weight:600;background:#DEF7EC;color:#03543F;border:1px solid #BCF0DA;">🟢 Easypaisa</span>';
    }
    if (m === 'raast' || p.includes('raast')) {
      return '<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:12px;font-size:11.5px;font-weight:600;background:#FEF08A;color:#854D0E;border:1px solid #FDE047;">⚡ Raast</span>';
    }
    if (m === 'banktransfer' || m === 'bank') {
      return '<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:12px;font-size:11.5px;font-weight:600;background:#F3F4F6;color:#374151;border:1px solid #E5E7EB;">🏦 Bank Transfer</span>';
    }
    return '<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:12px;font-size:11.5px;font-weight:600;background:#FEF3C7;color:#92400E;border:1px solid #FDE68A;">💵 COD</span>';
  }

  function getPaymentStatusBadge(status) {
    const s = (status || '').toUpperCase();
    if (s === 'PAID') {
      return '<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:12px;font-size:11.5px;font-weight:700;background:#DEF7EC;color:#03543F;border:1px solid #BCF0DA;">● PAID</span>';
    }
    if (s === 'PROCESSING') {
      return '<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:12px;font-size:11.5px;font-weight:700;background:#FEF08A;color:#854D0E;border:1px solid #FDE047;">● PROCESSING</span>';
    }
    if (s === 'PENDING') {
      return '<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:12px;font-size:11.5px;font-weight:700;background:#FFFBEB;color:#B45309;border:1px solid #FDE68A;">● PENDING</span>';
    }
    if (s === 'REFUNDED') {
      return '<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:12px;font-size:11.5px;font-weight:700;background:#F3E8FF;color:#6B21A8;border:1px solid #E9D5FF;">● REFUNDED</span>';
    }
    return '<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:12px;font-size:11.5px;font-weight:700;background:#FDE8E8;color:#9B1C1C;border:1px solid #F8B4B4;">● FAILED</span>';
  }

  function openRefundModal(tx) {
    activeRefundPayment = tx;
    const modal = document.getElementById('refundModalBackdrop');
    const detailsWrap = document.getElementById('refundModalDetails');
    const amtInput = document.getElementById('refundAmountInput');
    const reasonNotes = document.getElementById('refundReasonNotes');

    if (!modal) return;

    if (detailsWrap) {
      const sym = tx.currency === 'PKR' ? 'Rs ' : (tx.currency || 'PKR') + ' ';
      detailsWrap.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="color:var(--text-muted);">Order:</span>
          <strong>#${escapeHtml(tx.orderNumber)}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="color:var(--text-muted);">Customer:</span>
          <span>${escapeHtml(tx.customerName || 'Guest')}</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="color:var(--text-muted);">Original Paid Amount:</span>
          <strong style="color:var(--ink);">${sym}${Number(tx.amount).toFixed(2)}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="color:var(--text-muted);">Payment Gateway:</span>
          <span>${escapeHtml((tx.paymentMethod || '').toUpperCase())} (${escapeHtml(tx.transactionId || 'N/A')})</span>
        </div>
      `;
    }

    if (amtInput) {
      amtInput.value = tx.amount;
      amtInput.max = tx.amount;
    }
    if (reasonNotes) reasonNotes.value = '';

    modal.hidden = false;
  }

  function showPaymentDetailsModal(tx) {
    const modal = document.getElementById('payDetailsModalBackdrop');
    const body = document.getElementById('payDetailsModalBody');
    if (!modal || !body) return;

    const sym = tx.currency === 'PKR' ? 'Rs ' : (tx.currency || 'PKR') + ' ';
    const dt = new Date(tx.createdAt).toLocaleString();
    const paidDt = tx.paidAt ? new Date(tx.paidAt).toLocaleString() : 'Not paid yet';

    body.innerHTML = `
      <div style="background:var(--paper-2);border-radius:8px;padding:12px;border:1px solid var(--border);display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:12.5px;">
        <div>
          <div style="color:var(--text-muted);font-size:11px;">Order Number</div>
          <div style="font-weight:700;color:var(--ink);">#${escapeHtml(tx.orderNumber)}</div>
        </div>
        <div>
          <div style="color:var(--text-muted);font-size:11px;">Status</div>
          <div>${getPaymentStatusBadge(tx.status)}</div>
        </div>
        <div>
          <div style="color:var(--text-muted);font-size:11px;">Amount</div>
          <div style="font-weight:700;font-size:14px;color:var(--ink);">${sym}${Number(tx.amount).toFixed(2)}</div>
        </div>
        <div>
          <div style="color:var(--text-muted);font-size:11px;">Method / Provider</div>
          <div>${getPaymentMethodBadge(tx.paymentMethod, tx.provider)}</div>
        </div>
        <div>
          <div style="color:var(--text-muted);font-size:11px;">Transaction / Ref ID</div>
          <div style="font-family:monospace;word-break:break-all;">${escapeHtml(tx.transactionId || '—')}</div>
        </div>
        <div>
          <div style="color:var(--text-muted);font-size:11px;">Customer</div>
          <div style="font-weight:600;">${escapeHtml(tx.customerName || 'Guest')}</div>
          <div style="font-size:11px;color:var(--text-muted);">${escapeHtml(tx.customerEmail || tx.customerPhone || 'No contact')}</div>
        </div>
        <div>
          <div style="color:var(--text-muted);font-size:11px;">Created At</div>
          <div>${dt}</div>
        </div>
        <div>
          <div style="color:var(--text-muted);font-size:11px;">Paid At</div>
          <div>${paidDt}</div>
        </div>
        ${tx.verifiedBy ? `
          <div style="grid-column:1 / -1;">
            <div style="color:var(--text-muted);font-size:11px;">Verified / Processed By</div>
            <div style="font-weight:600;">${escapeHtml(tx.verifiedBy)}</div>
          </div>
        ` : ''}
        ${tx.notes ? `
          <div style="grid-column:1 / -1;">
            <div style="color:var(--text-muted);font-size:11px;">Notes</div>
            <div style="font-size:12px;color:var(--ink);">${escapeHtml(tx.notes)}</div>
          </div>
        ` : ''}
        ${tx.refundAmount ? `
          <div style="grid-column:1 / -1;background:rgba(197,34,31,0.08);padding:8px 10px;border-radius:6px;border:1px solid rgba(197,34,31,0.2);">
            <div style="font-weight:700;color:#c5221f;font-size:12px;">Refund Details</div>
            <div style="font-size:12px;color:var(--text);margin-top:2px;">Amount: <strong>${sym}${Number(tx.refundAmount).toFixed(2)}</strong></div>
            <div style="font-size:11.5px;color:var(--text-muted);">Reason: ${escapeHtml(tx.refundReason || 'N/A')}</div>
            <div style="font-size:11px;color:var(--text-muted);font-family:monospace;">Refund ID: ${escapeHtml(tx.refundId || 'N/A')}</div>
          </div>
        ` : ''}
      </div>
      ${tx.gatewayResponse ? `
        <div style="margin-top:8px;">
          <div style="font-size:11px;font-weight:700;color:var(--text-muted);margin-bottom:4px;">Gateway Response Payload</div>
          <pre style="margin:0;padding:10px;background:#18181b;color:#e4e4e7;border-radius:6px;font-size:11px;max-height:140px;overflow:auto;font-family:monospace;">${escapeHtml(JSON.stringify(tx.gatewayResponse, null, 2))}</pre>
        </div>
      ` : ''}
    `;

    modal.hidden = false;
  }

  // ---------- Boot ----------
  async function boot() {
    await loadTenantBranding();
    loadOverview();
  }
  boot();
  // Defer heavier badge/table requests slightly so the UI paints first
  setTimeout(() => { loadComplaintBadge(); updateReservationBadge(); }, 1200);
  // Poll less frequently to reduce repeated load on backend
  setInterval(loadComplaintBadge, 45000);
  setInterval(updateReservationBadge, 45000);
  // Keep views fresh, but with a longer interval and lighter overview refresh
  setInterval(() => {
    if (currentView === 'orders') loadOrders();
    if (currentView === 'overview') loadOverview();
    if (currentView === 'reservations') loadReservations();
  }, 20000);
})();
