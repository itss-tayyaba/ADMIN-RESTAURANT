(() => {
  'use strict';

  // ---------- Auth guard ----------
  const token = localStorage.getItem('eb_admin_token');
  if (!token) {
    window.location.href = 'login.html';
    return;
  }
  const user = JSON.parse(localStorage.getItem('eb_admin_user') || '{"username":"Admin","role":"admin"}');
  if (user.role !== 'admin') {
    if (user.role === 'chef') window.location.href = '/kitchen';
    else if (user.role === 'delivery') window.location.href = '/delivery';
    else window.location.href = 'login.html';
    return;
  }

  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + token
  };

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

    complaintsBadge: document.getElementById('complaintsBadge'),
    complaintFilterTabs: document.getElementById('complaintFilterTabs'),
    complaintsList: document.getElementById('complaintsList'),

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

  let allOrders = [];
  let prevOrdersMap = new Map(); // track previous statuses to notify of changes
  let allMenuItems = [];
  let allComplaints = [];
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

  async function autoAssignOrder(orderId, orderNumber) {
    try {
      const res = await fetch(`/api/delivery/${orderId}/auto-assign`, {
        method: 'PUT',
        headers: authHeaders
      });
      if (handleAuthFailure(res)) return;
      const data = await safeJson(res);
      if (!res.ok || !data.success) throw new Error(data.message || 'No rider available yet');
      showToast(data.message || `${orderNumber} auto-assigned`);
      loadOrders();
    } catch (err) {
      showToast(err.message || 'Could not auto-assign', true);
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
  els.userRole.textContent = user.role;
  els.avatarInitial.textContent = (user.username || 'A').charAt(0).toUpperCase();
  els.todayDate.textContent = new Date().toLocaleDateString(undefined, { weekday:'long', month:'long', day:'numeric' });

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
    const titles = { overview: 'Overview', orders: 'Orders', menu: 'Menu Items', complaints: 'Complaints', riders: 'Delivery Riders' };
    els.pageTitle.textContent = titles[name] || 'Overview';
    if (name === 'orders') { loadRiders(); loadOrders(); }
    if (name === 'menu') loadMenu();
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

  function renderOrdersTable(orders) {
    if (!orders.length) {
      els.ordersBody.innerHTML = '<tr><td colspan="9" class="empty-state">No orders in this category.</td></tr>';
      return;
    }
    const deliveryStatuses = ['received', 'preparing', 'ready', 'out-for-delivery', 'delivered', 'cancelled'];
    const nonDeliveryStatuses = ['received', 'preparing', 'ready', 'completed', 'cancelled'];
    els.ordersBody.innerHTML = orders.map(o => {
      const statuses = o.orderType === 'delivery' ? deliveryStatuses : nonDeliveryStatuses;
      return `
      <tr>
        <td><span class="order-id">${o.orderNumber}</span><br><span class="cust">${timeAgo(o.createdAt)}</span></td>
        <td>${escapeHtml(o.customerName)}<br><span class="cust">${escapeHtml(o.customerPhone || '')}</span></td>
        <td style="text-transform:capitalize;">${o.orderType || '—'}</td>
        <td class="cust">${o.orderType === 'delivery' ? escapeHtml(o.region || '—') : '—'}</td>
        <td class="cust">${o.items.map(i => `${i.qty}× ${escapeHtml(i.name)}`).join(', ')}</td>
        <td>${money(o.total)}</td>
        <td><span class="badge ${o.status}">${o.status.replace('-', ' ')}</span></td>
        <td>${renderDeliveryCell(o)}</td>
        <td>
          <select class="status-select" data-order="${o.orderNumber}">
            ${statuses.map(s => `<option value="${s}" ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </td>
      </tr>
    `;
    }).join('');

    els.ordersBody.querySelectorAll('.assign-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const sel = els.ordersBody.querySelector(`.rider-select[data-order-id="${btn.dataset.orderId}"]`);
        assignRider(btn.dataset.orderId, sel ? sel.value : '', btn.dataset.orderNumber);
      });
    });

    els.ordersBody.querySelectorAll('.auto-assign-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        autoAssignOrder(btn.dataset.orderId, btn.dataset.orderNumber);
      });
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
      // For delivery orders with a region set, only show riders fixed to
      // that region — that's who auto-assignment would consider too.
      const candidates = (o.orderType === 'delivery' && o.region)
        ? deliveryRiders.filter(r => r.region === o.region)
        : deliveryRiders;

      const autoAssignBtn = (o.orderType === 'delivery' && o.region)
        ? `<button class="btn-ghost auto-assign-btn" data-order-id="${o._id}" data-order-number="${o.orderNumber}" style="padding:6px 10px;font-size:12px;" title="Let the system pick the rider with the fewest active orders in ${escapeHtml(o.region)}">⚡ Auto-Assign</button>`
        : '';

      if (!candidates.length) {
        const addRiderBtn = (o.orderType === 'delivery' && o.region)
          ? `<button class="btn-ghost add-rider-for-region-btn" data-region="${escapeHtml(o.region)}" style="padding:6px 10px;font-size:12px;">+ Add rider for ${escapeHtml(o.region)}</button>`
          : '';
        return `
          <div style="display:flex;flex-direction:column;gap:4px;">
            <span class="cust">${o.orderType === 'delivery' && o.region ? `No riders in ${escapeHtml(o.region)}` : 'No riders available'}</span>
            ${addRiderBtn}
            ${autoAssignBtn}
          </div>
        `;
      }

      return `
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <select class="status-select rider-select" data-order-id="${o._id}">
            <option value="">Choose rider…</option>
            ${candidates.map(r => `<option value="${r._id}">${escapeHtml(r.name || r.username)} (${r.activeOrders || 0}/${maxActiveOrders})</option>`).join('')}
          </select>
          <button class="reply-save-btn assign-btn" data-order-id="${o._id}" data-order-number="${o.orderNumber}">Assign</button>
          ${autoAssignBtn}
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
  loadOverview();
  loadComplaintBadge();
  setInterval(loadComplaintBadge, 30000);
  // Keep whatever the admin is looking at fresh — new orders (and status
  // changes made from another tab/device) show up without a manual reload.
  setInterval(() => {
    if (currentView === 'orders') loadOrders();
    if (currentView === 'overview') loadOverview();
  }, 12000);
})();