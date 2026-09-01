// ==========================================================================
// Ember & Brew — Customer Portal Application
// Luxury Dashboard Architecture matching Admin Dashboard
// ==========================================================================

const customerState = {
  token: localStorage.getItem('eb_customer_token'),
  customer: JSON.parse(localStorage.getItem('eb_customer') || 'null'),
  orders: [],
  complaints: [],
  reservations: [],
  dataLoaded: false,
  dashboardView: 'orders',
  orderFilter: '',
  complaintFilter: '',
  selectedOrderNumber: null,
  authMode: 'login',
  searchQuery: ''
};

// URL query parameter routing (e.g. ?order=EB-XXXXXX or ?view=reservations)
const urlParams = new URLSearchParams(window.location.search);
const notifOrder = urlParams.get('order');
if (notifOrder) {
  customerState.selectedOrderNumber = notifOrder.trim();
  customerState.dashboardView = 'tracking';
}
const initialView = urlParams.get('view');
if (initialView && ['orders', 'tracking', 'menu', 'reservations', 'complaints'].includes(initialView)) {
  customerState.dashboardView = initialView;
}

// Branch scoping
(function captureBranchId() {
  const fromUrl = urlParams.get('branchId');
  if (fromUrl) localStorage.setItem('eb_branch_id', fromUrl);
})();

async function resolveBranchFromPath() {
  const match = window.location.pathname.match(/^\/customer\/([^/]+)$/);
  if (!match) return null;
  const res = await fetch(`/api/branches/by-code/${encodeURIComponent(match[1])}`);
  if (!res.ok) throw new Error('Branch not found');
  const branch = await res.json();
  localStorage.setItem('eb_branch_id', branch._id);
  localStorage.setItem('eb_branch_code', branch.code);
  document.title = `Ember & Brew — ${branch.city}`;
  return branch;
}

function getBranchId() {
  return localStorage.getItem('eb_branch_id') || '';
}

function withBranch(url) {
  const b = getBranchId();
  if (!b) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}branchId=${encodeURIComponent(b)}`;
}

const STATUS_LABELS = {
  received: 'Order Received',
  pending_admin: 'Awaiting Admin',
  pending_kitchen: 'In Kitchen Queue',
  preparing: 'Preparing',
  ready: 'Ready for Pickup',
  'out-for-delivery': 'Out for Delivery',
  delivered: 'Delivered',
  completed: 'Completed',
  cancelled: 'Cancelled'
};

const STATUS_ICONS = {
  received: 'fa-receipt',
  pending_admin: 'fa-clock',
  pending_kitchen: 'fa-utensils',
  preparing: 'fa-fire-burner',
  ready: 'fa-box-open',
  'out-for-delivery': 'fa-motorcycle',
  delivered: 'fa-truck-ramp-box',
  completed: 'fa-circle-check',
  cancelled: 'fa-ban'
};

const TRACKING_FLOW = ['received', 'preparing', 'ready', 'out-for-delivery', 'delivered', 'completed'];
const PICKUP_LOCATION = { lat: 31.4187, lng: 73.0791 };

function straightLineKm(from, to) {
  const rad = v => v * Math.PI / 180;
  const dLat = rad(to.lat - from.lat);
  const dLng = rad(to.lng - from.lng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(from.lat)) * Math.cos(rad(to.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

let customerTrackingPoll = null;

function apiFetch(url, options = {}) {
  return fetch(url, options).then(async res => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Server error');
    return data;
  });
}

function escapeHtml(text) {
  return String(text || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}


function parseReservationDateTime(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  let hours = 0;
  let minutes = 0;
  const match12 = String(timeStr).trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (match12) {
    hours = Number(match12[1]);
    minutes = Number(match12[2]);
    const period = match12[3].toUpperCase();
    if (period === 'PM' && hours < 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
  } else {
    const match24 = String(timeStr).trim().match(/^(\d{1,2}):(\d{2})$/);
    if (match24) {
      hours = Number(match24[1]);
      minutes = Number(match24[2]);
    } else {
      return null;
    }
  }
  const [year, month, day] = String(dateStr).split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, hours, minutes, 0, 0);
}

function formatCurrency(val) {
  const num = Number(val);
  return Number.isFinite(num) ? num.toFixed(2) : '0.00';
}

function authHeaders() {
  return { 'Content-Type': 'application/json', Authorization: 'Bearer ' + customerState.token };
}

function saveSession(token, customer) {
  customerState.token = token;
  customerState.customer = customer;
  localStorage.setItem('eb_customer_token', token);
  localStorage.setItem('eb_customer', JSON.stringify(customer));
}

function clearSession() {
  customerState.token = null;
  customerState.customer = null;
  customerState.orders = [];
  customerState.complaints = [];
  customerState.reservations = [];
  customerState.dataLoaded = false;
  customerState.dashboardView = 'orders';
  customerState.selectedOrderNumber = null;
  customerState.authMode = 'login';
  localStorage.removeItem('eb_customer_token');
  localStorage.removeItem('eb_customer');
  localStorage.removeItem('eb_customer_identifier');
  localStorage.removeItem('eb_customer_password');
}

// ============================================
// INITIALIZATION
// ============================================
window.addEventListener('DOMContentLoaded', async () => {
  try {
    await resolveBranchFromPath();
  } catch (e) {
    console.warn('Branch resolution note:', e.message);
  }
  initPortal();
});

function initPortal() {
  if (customerState.customer && localStorage.getItem('eb_return_to_checkout') === '1') {
    localStorage.removeItem('eb_return_to_checkout');
    window.location.href = withBranch('/');
    return;
  }
  renderPortal();
}

async function renderPortal() {
  const root = document.getElementById('portal-root');
  if (!root) return;

  if (!customerState.customer) {
    root.innerHTML = renderAuthHtml();
    bindAuthEvents();
    return;
  }

  root.innerHTML = renderDashboardHtml();
  bindDashboardEvents();

  if (!customerState.dataLoaded) {
    await loadCustomerData();
  } else {
    renderActiveView();
  }
}

// ============================================
// AUTHENTICATION SCREEN (Luxury Dark Theme)
// ============================================
function renderAuthHtml() {
  return `
    <div class="auth-body">
      <div class="auth-wrap">
        <div class="auth-card">
          <div class="auth-brand">
            <img src="/images/app-logo.png" alt="Ember &amp; Brew" style="width:30px;height:30px;border-radius:8px;object-fit:cover;border:1px solid #D4A853;box-shadow:0 0 6px rgba(212,168,83,0.3);">
            <span class="name">Ember <em>&amp;</em> Brew</span>
          </div>
          <p class="auth-sub">Sign in to track orders, view delivery OTP codes, reserve tables, and manage complaints.</p>
          <div class="auth-tabs">
            <button id="auth-login-tab" class="auth-tab ${customerState.authMode === 'login' ? 'active' : ''}">Sign In</button>
            <button id="auth-register-tab" class="auth-tab ${customerState.authMode === 'register' ? 'active' : ''}">Create Account</button>
          </div>
          <div id="auth-forms">
            ${customerState.authMode === 'login' ? renderLoginForm() : renderRegisterForm()}
          </div>
        </div>
        <p class="auth-foot"><a href="${withBranch('/')}" style="color:rgba(245,240,232,0.7);text-decoration:underline;">← Back to Restaurant Website</a></p>
      </div>
    </div>
  `;
}

function renderLoginForm() {
  return `
    <form id="login-form" class="space-y-4" autocomplete="off">
      <div class="form-group">
        <label class="form-label">Email or Phone Number</label>
        <input name="identifier" class="form-input" placeholder="e.g. aimenyasin320@gmail.com or 03206551696" required autocomplete="username">
        <div class="field-error" id="error-identifier"></div>
      </div>
      <div class="form-group">
        <label class="form-label">Password</label>
        <input type="password" name="password" class="form-input" placeholder="••••••••" required autocomplete="current-password">
        <div class="field-error" id="error-password"></div>
      </div>
      <div class="field-error" id="error-login"></div>
      <button type="submit" class="btn-primary" style="width:100%;padding:12px;font-size:14px;">Sign In</button>
    </form>
  `;
}

function renderRegisterForm() {
  return `
    <form id="register-form" class="space-y-4" autocomplete="off">
      <div class="form-group">
        <label class="form-label">Full Name</label>
        <input name="name" class="form-input" placeholder="e.g. Aimen Yasin" required autocomplete="name">
        <div class="field-error" id="error-name"></div>
      </div>
      <div class="form-group">
        <label class="form-label">Phone Number</label>
        <input type="tel" name="phone" class="form-input" placeholder="e.g. 03206551696 or +923206551696" required inputmode="tel" maxlength="16">
        <div class="field-error" id="error-phone"></div>
      </div>
      <div class="form-group">
        <label class="form-label">Email Address (Optional)</label>
        <input name="email" type="email" class="form-input" placeholder="name@example.com" autocomplete="email">
        <div class="field-error" id="error-email"></div>
      </div>
      <div class="form-group">
        <label class="form-label">Password (Min 6 chars)</label>
        <input name="password" type="password" class="form-input" placeholder="••••••••" required autocomplete="new-password">
        <div class="field-error" id="error-password"></div>
      </div>
      <div class="field-error" id="error-register"></div>
      <button type="submit" class="btn-primary" style="width:100%;padding:12px;font-size:14px;">Create Account</button>
    </form>
  `;
}

function bindAuthEvents() {
  const loginTab = document.getElementById('auth-login-tab');
  const registerTab = document.getElementById('auth-register-tab');
  if (loginTab && registerTab) {
    loginTab.addEventListener('click', () => {
      customerState.authMode = 'login';
      renderPortal();
    });
    registerTab.addEventListener('click', () => {
      customerState.authMode = 'register';
      renderPortal();
    });
  }

  const loginForm = document.getElementById('login-form');
  if (loginForm) loginForm.addEventListener('submit', handleLogin);

  const registerForm = document.getElementById('register-form');
  if (registerForm) registerForm.addEventListener('submit', handleRegister);
}

function isValidCustomerPhone(phone) {
  const clean = String(phone || '').trim().replace(/[\s()-]/g, '');
  return /^(0\d{9,11}|\+?[1-9]\d{6,14})$/.test(clean);
}

async function handleLogin(e) {
  e.preventDefault();
  const form = e.target;
  const identifier = form.identifier.value.trim();
  const password = form.password.value;
  const errEl = document.getElementById('error-login');
  if (errEl) errEl.textContent = '';

  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true; btn.textContent = 'Signing in…';

  try {
    const data = await apiFetch('/api/customer-auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password })
    });
    saveSession(data.token, data.customer);
    showToast(`Welcome back, ${(data.customer.name || 'Customer').split(' ')[0]}!`, 'success');
    await loadCustomerData();
    renderPortal();
  } catch (err) {
    if (errEl) errEl.textContent = err.message || 'Login failed';
  } finally {
    btn.disabled = false; btn.textContent = 'Sign In';
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const form = e.target;
  const name = form.name.value.trim();
  const phone = form.phone.value.trim();
  const email = form.email.value.trim();
  const password = form.password.value;
  const errEl = document.getElementById('error-register');
  if (errEl) errEl.textContent = '';

  if (!isValidCustomerPhone(phone)) {
    if (errEl) errEl.textContent = 'Enter a valid phone number (e.g. 03206551696 or +923206551696).';
    return;
  }

  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true; btn.textContent = 'Creating account…';

  try {
    const data = await apiFetch('/api/customer-auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone, email, password })
    });
    saveSession(data.token, data.customer);
    showToast(`Welcome, ${(data.customer.name || 'Customer').split(' ')[0]}!`, 'success');
    await loadCustomerData();
    renderPortal();
  } catch (err) {
    if (errEl) errEl.textContent = err.message || 'Registration failed';
  } finally {
    btn.disabled = false; btn.textContent = 'Create Account';
  }
}

// ============================================
// MAIN DASHBOARD LAYOUT (Admin-Style Shell)
// ============================================
function renderDashboardHtml() {
  const c = customerState.customer || {};
  const initial = (c.name || 'Customer').charAt(0).toUpperCase();
  const activeOrdersCount = customerState.orders.filter(o => !['completed', 'cancelled'].includes(o.status)).length;
  const complaintsCount = customerState.complaints.filter(cm => cm.status !== 'resolved').length;
  const reservationsCount = customerState.reservations.length;

  const viewTitles = {
    orders: 'My Orders',
    tracking: 'Live Order Tracking',
    menu: 'Restaurant Menu',
    reservations: 'Table Bookings',
    complaints: 'My Complaints'
  };

  const todayStr = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

  return `
    <div class="app">
      <!-- Luxury Dark Sidebar -->
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-brand">
          <img src="/images/app-logo.png" alt="Ember &amp; Brew" style="width:30px;height:30px;border-radius:8px;object-fit:cover;border:1px solid #D4A853;box-shadow:0 0 6px rgba(212,168,83,0.3);">
          <span class="name">Ember <em>&amp;</em> Brew</span>
        </div>

        <div class="nav-section-label">Customer Portal</div>
        <button class="nav-item ${customerState.dashboardView === 'orders' ? 'active' : ''}" data-view="orders">
          <span class="ic"><i class="fa-solid fa-receipt"></i></span> My Orders
          ${activeOrdersCount > 0 ? `<span class="nav-badge">${activeOrdersCount}</span>` : ''}
        </button>
        <button class="nav-item ${customerState.dashboardView === 'tracking' ? 'active' : ''}" data-view="tracking">
          <span class="ic"><i class="fa-solid fa-location-crosshairs"></i></span> Live Tracking
        </button>
        <button class="nav-item ${customerState.dashboardView === 'menu' ? 'active' : ''}" data-view="menu">
          <span class="ic"><i class="fa-solid fa-mug-hot"></i></span> Browse Menu
        </button>
        <button class="nav-item ${customerState.dashboardView === 'reservations' ? 'active' : ''}" data-view="reservations">
          <span class="ic"><i class="fa-solid fa-chair"></i></span> Table Bookings
          ${reservationsCount > 0 ? `<span class="nav-badge" style="background:var(--sage);">${reservationsCount}</span>` : ''}
        </button>
        <button class="nav-item ${customerState.dashboardView === 'complaints' ? 'active' : ''}" data-view="complaints">
          <span class="ic"><i class="fa-solid fa-flag"></i></span> My Complaints
          ${complaintsCount > 0 ? `<span class="nav-badge">${complaintsCount}</span>` : ''}
        </button>

        <div class="nav-section-label" style="margin-top:20px;">Explore</div>
        <a href="${withBranch('/')}" class="nav-item" target="_blank">
          <span class="ic"><i class="fa-solid fa-arrow-up-right-from-square"></i></span> Restaurant Home
        </a>

        <!-- Sidebar User Profile Footer -->
        <div class="sidebar-foot">
          <div class="sidebar-user">
            <div class="sidebar-avatar">${initial}</div>
            <div class="who">
              <span class="n">${escapeHtml(c.name || 'Customer')}</span>
              <span class="r">${escapeHtml(c.email || c.phone || 'Customer')}</span>
            </div>
          </div>
          <button class="logout-btn" id="logoutBtn"><i class="fa-solid fa-arrow-right-from-bracket mr-1"></i> Sign Out</button>
        </div>
      </aside>

      <!-- Sidebar mobile overlay -->
      <div class="sidebar-overlay" id="sidebarOverlay"></div>

      <!-- Main Dashboard Canvas -->
      <div class="main">
        <header class="topbar">
          <button class="menu-toggle" id="menuToggle" aria-label="Toggle menu">
            <span></span><span></span><span></span>
          </button>
          <h1 class="serif" id="pageTitle">${viewTitles[customerState.dashboardView] || 'Customer Portal'}</h1>
          
          <div class="topbar-search">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input type="text" id="globalSearch" placeholder="Search orders, dishes, or tables…" value="${escapeHtml(customerState.searchQuery)}" oninput="onGlobalSearch(this.value)">
          </div>

          <div class="topbar-right">
            <span class="date-pill"><i class="fa-regular fa-calendar mr-1.5 text-brand-400"></i>${todayStr}</span>
            ${customerState.dashboardView === 'reservations' 
              ? `<button class="btn-primary" onclick="openNewReservationModal()"><i class="fa-solid fa-plus"></i> Book Table</button>`
              : customerState.dashboardView === 'complaints'
              ? `<button class="btn-primary" onclick="openNewComplaintModal()"><i class="fa-solid fa-plus"></i> File Complaint</button>`
              : `<a href="${withBranch('/')}" class="btn-primary"><i class="fa-solid fa-bag-shopping"></i> Order Ahead</a>`
            }
          </div>
        </header>

        <section class="content">
          <div id="view-container">
            ${renderCurrentViewHtml()}
          </div>
        </section>
      </div>
    </div>

    <!-- New Reservation Modal -->
    <div class="modal-backdrop" id="reservationModalBackdrop" hidden>
      <div class="modal">
        <h3><i class="fa-solid fa-chair text-brand-400 mr-2"></i>Request a Table Reservation</h3>
        <form id="modalReservationForm">
          <div class="form-group">
            <label class="form-label">Guest Name</label>
            <input name="guestName" class="form-input" value="${escapeHtml(c.name || '')}" required>
          </div>
          <div class="form-group">
            <label class="form-label">Contact Phone</label>
            <input name="phone" type="tel" class="form-input" value="${escapeHtml(c.phone || '')}" required placeholder="03206551696 or +923206551696">
          </div>
          <div style="display:flex;gap:12px;">
            <div class="form-group" style="flex:1;">
              <label class="form-label">Date</label>
              <input name="date" type="date" class="form-input" required min="${new Date().toISOString().split('T')[0]}">
            </div>
            <div class="form-group" style="flex:1;">
              <label class="form-label">Time</label>
              <input name="time" type="time" class="form-input" required>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Party Size</label>
            <select name="guests" class="form-input">
              ${[1,2,3,4,5,6,7,8,10,12,15].map(n => `<option value="${n}">${n} Guests</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Special Requests (Optional)</label>
            <textarea name="notes" rows="2" class="form-input" placeholder="Window table, birthday, quiet area, etc."></textarea>
          </div>
          <div class="field-error" id="modal-error-reservation"></div>
          <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:16px;">
            <button type="button" class="btn-ghost" onclick="closeNewReservationModal()">Cancel</button>
            <button type="submit" class="btn-primary">Submit Request</button>
          </div>
        </form>
      </div>
    </div>

    <!-- New Complaint Modal -->
    <div class="modal-backdrop" id="complaintModalBackdrop" hidden>
      <div class="modal">
        <h3><i class="fa-solid fa-flag text-terra-400 mr-2"></i>Submit a Complaint or Feedback</h3>
        <form id="modalComplaintForm">
          <div class="form-group">
            <label class="form-label">Order Number (Optional)</label>
            <input name="orderNumber" class="form-input" placeholder="e.g. EB-XXXXXX" value="${escapeHtml(customerState.selectedOrderNumber || '')}">
          </div>
          <div class="form-group">
            <label class="form-label">Subject</label>
            <select name="subject" class="form-input">
              <option value="Food Quality">Food Quality</option>
              <option value="Order Accuracy">Order Accuracy (Missing/Wrong items)</option>
              <option value="Delivery / Wait Time">Delivery Delay or Rider Issue</option>
              <option value="Service & Staff">Staff &amp; Service</option>
              <option value="Other">Other Feedback</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Message Details</label>
            <textarea name="message" rows="4" class="form-input" placeholder="Please describe what happened so our management can fix it for you..." required></textarea>
          </div>
          <div class="field-error" id="modal-error-complaint"></div>
          <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:16px;">
            <button type="button" class="btn-ghost" onclick="closeNewComplaintModal()">Cancel</button>
            <button type="submit" class="btn-primary">Send to Management</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function renderCurrentViewHtml() {
  switch (customerState.dashboardView) {
    case 'tracking': return renderTrackingViewHtml();
    case 'reservations': return renderReservationsViewHtml();
    case 'complaints': return renderComplaintsViewHtml();
    case 'menu': return renderMenuViewHtml();
    case 'orders':
    default:
      return renderOrdersViewHtml();
  }
}

// ============================================
// VIEW 1: MY ORDERS (Overview + Stats + List)
// ============================================
function renderOrdersViewHtml() {
  const orders = customerState.orders || [];
  const activeOrders = orders.filter(o => !['completed', 'cancelled'].includes(o.status));
  const totalSpent = orders.filter(o => o.status !== 'cancelled').reduce((sum, o) => sum + (Number(o.total) || 0), 0);
  const reservationsCount = (customerState.reservations || []).length;
  const complaintsCount = (customerState.complaints || []).length;

  let filtered = orders;
  if (customerState.orderFilter) {
    if (customerState.orderFilter === 'active') {
      filtered = filtered.filter(o => !['completed', 'cancelled'].includes(o.status));
    } else {
      filtered = filtered.filter(o => o.status === customerState.orderFilter);
    }
  }
  if (customerState.searchQuery) {
    const q = customerState.searchQuery.toLowerCase();
    filtered = filtered.filter(o => 
      (o.orderNumber || '').toLowerCase().includes(q) ||
      (o.orderType || '').toLowerCase().includes(q) ||
      (o.items || []).some(i => (i.name || '').toLowerCase().includes(q))
    );
  }

  return `
    <!-- Summary Stat Cards (matching admin gold/ember/sage tokens) -->
    <div class="stat-grid">
      <div class="stat-card gold">
        <div class="label">Total Orders</div>
        <div class="value">${orders.length}</div>
        <div class="sub">Total spent: $${formatCurrency(totalSpent)}</div>
      </div>
      <div class="stat-card ember">
        <div class="label">Active Deliveries</div>
        <div class="value">${activeOrders.length}</div>
        <div class="sub">${activeOrders.length > 0 ? 'Live in kitchen / on the way' : 'No active orders right now'}</div>
      </div>
      <div class="stat-card sage">
        <div class="label">Table Bookings</div>
        <div class="value">${reservationsCount}</div>
        <div class="sub">Reserved table visits</div>
      </div>
      <div class="stat-card gold">
        <div class="label">Complaints &amp; Inquiries</div>
        <div class="value">${complaintsCount}</div>
        <div class="sub">Customer support tickets</div>
      </div>
    </div>

    <!-- Orders Panel -->
    <div class="panel">
      <div class="panel-head">
        <div>
          <h3>Order History</h3>
          <p class="panel-sub">Track real-time progress, view OTP codes, and message your delivery rider</p>
        </div>
        <a href="${withBranch('/')}" class="btn-primary" style="font-size:13px;padding:8px 14px;">
          <i class="fa-solid fa-plus"></i> New Order
        </a>
      </div>
      <div class="panel-body">
        <div class="filter-tabs">
          <button class="filter-tab ${customerState.orderFilter === '' ? 'active' : ''}" onclick="setOrderFilter('')">All Orders (${orders.length})</button>
          <button class="filter-tab ${customerState.orderFilter === 'active' ? 'active' : ''}" onclick="setOrderFilter('active')">Active / In Progress (${activeOrders.length})</button>
          <button class="filter-tab ${customerState.orderFilter === 'completed' ? 'active' : ''}" onclick="setOrderFilter('completed')">Completed</button>
          <button class="filter-tab ${customerState.orderFilter === 'cancelled' ? 'active' : ''}" onclick="setOrderFilter('cancelled')">Cancelled</button>
        </div>

        ${filtered.length === 0 ? `
          <div class="empty-state">
            <i class="fa-solid fa-box-open" style="font-size:32px;color:var(--gold);margin-bottom:12px;display:block;"></i>
            <p style="font-weight:700;color:var(--ink);margin:0 0 4px;">No matching orders found</p>
            <p style="margin:0 0 16px;">Place a fresh order to enjoy artisan coffee &amp; food delivered to your door.</p>
            <a href="${withBranch('/')}" class="btn-primary"><i class="fa-solid fa-utensils"></i> Browse Menu</a>
          </div>
        ` : `
          <div class="order-grid">
            ${filtered.map(renderOrderCardHtml).join('')}
          </div>
        `}
      </div>
    </div>
  `;
}

function renderOrderCardHtml(order) {
  const items = Array.isArray(order.items) ? order.items : [];
  const placedDate = new Date(order.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const statusClass = (order.status || 'received').toLowerCase().replace(/_/g, '-');
  const statusLabel = STATUS_LABELS[order.status] || order.status;

  const isDelivery = (order.orderType || '').toLowerCase() === 'delivery';

  return `
    <article class="order-card">
      <div class="order-header">
        <div>
          <div class="order-type-tag"><i class="fa-solid ${isDelivery ? 'fa-motorcycle' : 'fa-store'} mr-1"></i>${order.orderType}</div>
          <h4 class="order-num">${order.orderNumber}</h4>
          <span style="font-size:12px;color:var(--text-muted);"><i class="fa-regular fa-clock mr-1"></i>${placedDate}</span>
        </div>
        <span class="order-badge ${statusClass}">${statusLabel}</span>
      </div>

      <div class="order-items-list">
        ${items.map(it => `<div><strong>${it.qty}x</strong> ${escapeHtml(it.name)} <span style="color:var(--text-muted);font-size:12px;">($${formatCurrency(it.price * it.qty)})</span></div>`).join('')}
      </div>

      <div class="order-total-row">
        <span>Total Amount:</span>
        <span style="font-family:'Playfair Display',serif;font-size:18px;color:var(--gold-deep);">$${formatCurrency(order.total)}</span>
      </div>

      ${order.deliveryBoyName ? `
        <div style="background:var(--paper);border-radius:10px;padding:12px 14px;margin-top:12px;border:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
          <div>
            <span style="font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--text-muted);font-weight:700;display:block;">Assigned Rider</span>
            <strong style="color:var(--ink);font-size:14px;"><i class="fa-solid fa-motorcycle text-brand-400 mr-1.5"></i>${escapeHtml(order.deliveryBoyName)}</strong>
          </div>
          ${order.deliveryBoyPhone ? `
            <a href="https://wa.me/${String(order.deliveryBoyPhone).replace(/\D/g, '').replace(/^0/, '92')}?text=${encodeURIComponent('Hello! I am the customer for order #' + order.orderNumber + '. My OTP is ' + (order.otp || ''))}" target="_blank" class="btn-whatsapp">
              <i class="fa-brands fa-whatsapp text-sm"></i> WhatsApp Rider
            </a>
          ` : ''}
        </div>
      ` : ''}

      ${order.otp && isDelivery && order.status !== 'completed' && order.status !== 'cancelled' ? `
        <div class="otp-card">
          <div class="otp-title"><i class="fa-solid fa-shield-halved mr-1"></i> Delivery OTP Code</div>
          <div class="otp-code">${escapeHtml(order.otp)}</div>
          <p class="otp-hint">Give this secret 6-digit OTP code to the rider when they arrive to complete your delivery.</p>
        </div>
      ` : ''}

      <div class="order-actions">
        <button onclick="reorderPreviousOrder('${order.orderNumber}')" class="btn-primary" style="font-size:12.5px;padding:7px 14px;">
          <i class="fa-solid fa-rotate-right"></i> Reorder Again
        </button>
        <button onclick="viewOrderTracking('${order.orderNumber}')" class="btn-ghost" style="font-size:12.5px;padding:7px 14px;">
          <i class="fa-solid fa-location-crosshairs"></i> Track Live
        </button>
        <button onclick="fileComplaintForOrder('${order.orderNumber}')" class="btn-ghost" style="font-size:12.5px;padding:7px 14px;">
          <i class="fa-regular fa-flag"></i> Support
        </button>
      </div>
    </article>
  `;
}

function setOrderFilter(filter) {
  customerState.orderFilter = filter;
  renderActiveView();
}

function viewOrderTracking(orderNumber) {
  customerState.selectedOrderNumber = orderNumber;
  customerState.dashboardView = 'tracking';
  renderPortal();
}

function fileComplaintForOrder(orderNumber) {
  customerState.selectedOrderNumber = orderNumber;
  openNewComplaintModal();
}

// ============================================
// VIEW 2: LIVE TRACKING
// ============================================
function renderTrackingViewHtml() {
  const selected = customerState.selectedOrderNumber;
  const orders = customerState.orders || [];

  return `
    <div class="panel">
      <div class="panel-head">
        <div>
          <h3>Live Order Tracking</h3>
          <p class="panel-sub">Follow your order from kitchen prep to doorstep delivery</p>
        </div>
        <button onclick="switchDashboardView('orders')" class="btn-ghost">
          <i class="fa-solid fa-arrow-left mr-1"></i> Back to Orders
        </button>
      </div>
      <div class="panel-body">
        <div style="display:flex;gap:10px;max-width:480px;margin-bottom:24px;flex-wrap:wrap;">
          <input id="trackingOrderInput" class="form-input" style="flex:1;" placeholder="Enter Order # (e.g. EB-1041)" value="${escapeHtml(selected || '')}">
          <button onclick="searchTrackingOrder()" class="btn-primary"><i class="fa-solid fa-magnifying-glass"></i> Track</button>
        </div>

        ${orders.length > 0 ? `
          <div style="display:flex;gap:6px;margin-bottom:24px;overflow-x:auto;padding-bottom:6px;align-items:center;">
            <span style="font-size:12px;font-weight:700;color:var(--text-muted);white-space:nowrap;margin-right:6px;">Your Orders:</span>
            ${orders.slice(0, 6).map(o => `
              <button onclick="viewOrderTracking('${o.orderNumber}')" class="filter-tab ${selected === o.orderNumber ? 'active' : ''}" style="padding:5px 12px;font-size:12px;">
                ${o.orderNumber} (${o.status.replace('-', ' ')})
              </button>
            `).join('')}
          </div>
        ` : ''}

        <div id="liveTrackingContainer">
          ${selected ? `<div class="empty-state"><p>Loading tracking for ${escapeHtml(selected)}…</p></div>` : `<div class="empty-state"><p>Select or enter an order number above to view real-time tracking.</p></div>`}
        </div>
      </div>
    </div>
  `;
}

async function searchTrackingOrder() {
  const input = document.getElementById('trackingOrderInput');
  const num = input?.value?.trim();
  if (!num) return;
  customerState.selectedOrderNumber = num;
  await loadLiveTrackingData(num);
}

async function loadLiveTrackingData(orderNumber) {
  const container = document.getElementById('liveTrackingContainer');
  if (!container) return;

  try {
    const order = await apiFetch(withBranch('/api/orders/mine/' + encodeURIComponent(orderNumber)), { headers: authHeaders() });
    if (!order || !order.orderNumber) throw new Error('Order not found or access denied.');

    const ot = (order.orderType || '').toLowerCase();
    let statusFlow = TRACKING_FLOW;
    if (!/deliver|delivery/.test(ot)) {
      statusFlow = ['received', 'preparing', 'ready', 'completed'];
    }
    const curStatus = order.status === 'completed' ? 'completed' : order.status;
    const statusIdx = statusFlow.indexOf(curStatus) >= 0 ? statusFlow.indexOf(curStatus) : 0;
    const isArrived = order.status === 'completed' || statusIdx === statusFlow.length - 1;

    container.innerHTML = `
      <div style="background:var(--paper-2);border-radius:14px;border:1px solid var(--border);padding:24px;">
        <div style="text-align:center;margin-bottom:20px;">
          <span style="font-size:11.5px;text-transform:uppercase;letter-spacing:.2em;color:var(--gold-deep);font-weight:800;">Real-Time Status</span>
          <h2 class="serif" style="font-size:28px;margin:4px 0 2px;color:var(--ink);">${order.orderNumber}</h2>
          <span class="order-badge ${order.status.replace(/_/g, '-')}" style="font-size:12px;">${STATUS_LABELS[order.status] || order.status}</span>
        </div>

        <!-- Animated Journey Progress -->
        <div class="order-journey">
          <div class="journey-track">
            <div class="journey-progress" style="width:${(statusIdx / (statusFlow.length - 1)) * 100}%"></div>
            <div class="journey-mover" style="left:${(statusIdx / (statusFlow.length - 1)) * 100}%">
              <div class="mover-box"><i class="fa-solid ${STATUS_ICONS[order.status] || 'fa-bag-shopping'}"></i></div>
            </div>
            ${statusFlow.map((s, i) => {
              const done = i <= statusIdx;
              const active = i === statusIdx;
              const log = Array.isArray(order.statusLog) ? order.statusLog.find(l => l.status === s) : null;
              return `
                <div class="journey-stop ${done ? 'done' : ''} ${active ? 'active' : ''}" style="left:${(i / (statusFlow.length - 1)) * 100}%">
                  <div class="stop-icon">
                    <i class="fa-solid ${done ? 'fa-check' : STATUS_ICONS[s] || 'fa-circle'}"></i>
                    ${active && s === 'preparing' ? '<span class="steam s1"></span><span class="steam s2"></span><span class="steam s3"></span>' : ''}
                  </div>
                  <span class="stop-label">${STATUS_LABELS[s] || s}</span>
                  ${log ? `<span class="stop-time">${new Date(log.time).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span>` : ''}
                </div>
              `;
            }).join('')}
          </div>
          <div style="margin-top:20px;text-align:center;">
          <button onclick="reorderPreviousOrder('${order.orderNumber}')" class="btn-primary" style="font-size:14px;padding:10px 20px;">
            <i class="fa-solid fa-rotate-right mr-1.5"></i> Reorder This Meal Again
          </button>
        </div>
      </div>
      <!-- Delivery OTP Card -->
        ${order.otp ? `
          <div class="otp-card" style="margin:20px 0;">
            <div class="otp-title"><i class="fa-solid fa-shield-halved mr-1"></i> Delivery Confirmation OTP</div>
            <div class="otp-code">${escapeHtml(order.otp)}</div>
            <p class="otp-hint">Show or read this 6-digit code to your delivery rider upon doorstep arrival.</p>
          </div>
        ` : ''}

        <!-- Rider Contact & WhatsApp -->
        ${order.deliveryBoyName ? `
          <div style="background:var(--paper);border-radius:12px;padding:16px 20px;margin-top:16px;border:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
            <div>
              <span style="font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--text-muted);font-weight:700;display:block;">Assigned Delivery Rider</span>
              <strong style="color:var(--ink);font-size:16px;"><i class="fa-solid fa-motorcycle text-brand-400 mr-2"></i>${escapeHtml(order.deliveryBoyName)}</strong>
              ${order.deliveryBoyPhone ? `<span style="color:var(--text-muted);font-size:13px;display:block;margin-top:2px;">Phone: ${escapeHtml(order.deliveryBoyPhone)}</span>` : ''}
            </div>
            ${order.deliveryBoyPhone ? `
              <div style="display:flex;gap:8px;">
                <a href="https://wa.me/${String(order.deliveryBoyPhone).replace(/\D/g, '').replace(/^0/, '92')}?text=${encodeURIComponent('Hello! I am the customer for order #' + order.orderNumber + '. My OTP is ' + (order.otp || ''))}" target="_blank" class="btn-whatsapp">
                  <i class="fa-brands fa-whatsapp text-base"></i> 1-Click WhatsApp
                </a>
                <a href="tel:${order.deliveryBoyPhone}" class="btn-ghost"><i class="fa-solid fa-phone"></i> Call</a>
              </div>
            ` : ''}
          </div>
        ` : ''}
      </div>
    `;

    // Polling for live status updates if order is in progress
    if (customerTrackingPoll) clearInterval(customerTrackingPoll);
    if (!['completed', 'cancelled'].includes(order.status)) {
      customerTrackingPoll = setInterval(async () => {
        try {
          const fresh = await apiFetch(withBranch('/api/orders/mine/' + encodeURIComponent(order.orderNumber)), { headers: authHeaders() });
          if (fresh.status !== order.status) {
            showToast(`Order ${order.orderNumber} status updated to: ${STATUS_LABELS[fresh.status] || fresh.status}`, 'info');
            loadLiveTrackingData(order.orderNumber);
          }
        } catch (_) {}
      }, 7000);
    }
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p class="text-danger">${err.message}</p></div>`;
  }
}

// ============================================
// VIEW 3: TABLE BOOKINGS
// ============================================
function renderReservationsViewHtml() {
  const reservations = customerState.reservations || [];
  const confirmed = reservations.filter(r => r.status === 'confirmed').length;
  const pending = reservations.filter(r => r.status === 'pending').length;

  return `
    <div class="stat-grid" style="grid-template-columns:repeat(3,1fr);">
      <div class="stat-card gold">
        <div class="label">Total Reservations</div>
        <div class="value">${reservations.length}</div>
        <div class="sub">Lifetime table requests</div>
      </div>
      <div class="stat-card sage">
        <div class="label">Confirmed Bookings</div>
        <div class="value">${confirmed}</div>
        <div class="sub">Ready for dining</div>
      </div>
      <div class="stat-card ember">
        <div class="label">Pending Confirmation</div>
        <div class="value">${pending}</div>
        <div class="sub">Awaiting host review</div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <div>
          <h3>Table Reservations</h3>
          <p class="panel-sub">Reserve premium dining tables and check assignment status</p>
        </div>
        <button onclick="openNewReservationModal()" class="btn-primary">
          <i class="fa-solid fa-plus"></i> Request Reservation
        </button>
      </div>
      <div class="panel-body">
        ${reservations.length === 0 ? `
          <div class="empty-state">
            <i class="fa-solid fa-chair" style="font-size:32px;color:var(--gold);margin-bottom:12px;display:block;"></i>
            <p style="font-weight:700;color:var(--ink);margin:0 0 4px;">No table bookings yet</p>
            <p style="margin:0 0 16px;">Reserve a table for your next coffee date, lunch, or family celebration.</p>
            <button onclick="openNewReservationModal()" class="btn-primary"><i class="fa-solid fa-plus"></i> Book a Table</button>
          </div>
        ` : `
          <div class="reservation-grid">
            ${(function() {
              const statusPriority = { pending: 0, confirmed: 1, completed: 2, cancelled: 3 };
              const sorted = [...reservations].sort((a, b) => {
                const pA = statusPriority[a.status] !== undefined ? statusPriority[a.status] : 99;
                const pB = statusPriority[b.status] !== undefined ? statusPriority[b.status] : 99;
                if (pA !== pB) return pA - pB;
                if (a.date !== b.date) return (a.date || '').localeCompare(b.date || '');
                return (a.time || '').localeCompare(b.time || '');
              });
              return sorted.map(r => `
                <article class="reservation-card">
                  <div class="reservation-head">
                    <div>
                      <h4 class="res-guest-name">${escapeHtml(r.guestName)}</h4>
                      <span class="res-date-time"><i class="fa-regular fa-calendar mr-1"></i>${escapeHtml(r.date)} at ${escapeHtml(r.time)} · ${r.guests} Guests</span>
                    </div>
                    <span class="order-badge ${r.status === 'confirmed' ? 'ready' : r.status === 'pending' ? 'received' : 'completed'}">${r.status}</span>
                  </div>
                  <div style="margin-top:10px;font-size:13px;color:var(--ink-3);">
                    ${r.tableNumber ? `<p style="margin:2px 0;"><i class="fa-solid fa-table mr-1.5 text-brand-400"></i><strong>Assigned Table:</strong> ${escapeHtml(r.tableNumber)}</p>` : ''}
                    ${r.notes ? `<p style="margin:4px 0;color:var(--text-muted);font-style:italic;">"${escapeHtml(r.notes)}"</p>` : ''}
                  </div>
                </article>
              `).join('');
            })()}
          </div>
        `}
      </div>
    </div>
  `;
}

// ============================================
// VIEW 4: COMPLAINTS & FEEDBACK
// ============================================
function renderComplaintsViewHtml() {
  const complaints = customerState.complaints || [];
  let filtered = complaints;
  if (customerState.complaintFilter) {
    filtered = filtered.filter(c => c.status === customerState.complaintFilter);
  }

  return `
    <div class="panel">
      <div class="panel-head">
        <div>
          <h3>Complaints &amp; Support Tickets</h3>
          <p class="panel-sub">Submit feedback, report issues, and read direct responses from restaurant managers</p>
        </div>
        <button onclick="openNewComplaintModal()" class="btn-primary">
          <i class="fa-solid fa-plus"></i> File Complaint
        </button>
      </div>
      <div class="panel-body">
        <div class="filter-tabs">
          <button class="filter-tab ${customerState.complaintFilter === '' ? 'active' : ''}" onclick="setComplaintFilter('')">All (${complaints.length})</button>
          <button class="filter-tab ${customerState.complaintFilter === 'new' ? 'active' : ''}" onclick="setComplaintFilter('new')">New</button>
          <button class="filter-tab ${customerState.complaintFilter === 'in-progress' ? 'active' : ''}" onclick="setComplaintFilter('in-progress')">In Progress</button>
          <button class="filter-tab ${customerState.complaintFilter === 'resolved' ? 'active' : ''}" onclick="setComplaintFilter('resolved')">Resolved</button>
        </div>

        ${filtered.length === 0 ? `
          <div class="empty-state">
            <i class="fa-solid fa-check-circle" style="font-size:32px;color:var(--sage);margin-bottom:12px;display:block;"></i>
            <p style="font-weight:700;color:var(--ink);margin:0 0 4px;">No support tickets</p>
            <p style="margin:0 0 16px;">Everything is running smoothly! If you ever have a concern, let us know here.</p>
          </div>
        ` : `
          <div class="complaints-list">
            ${filtered.map(c => `
              <article class="complaint-card status-${c.status}">
                <div class="complaint-top">
                  <h4 class="complaint-subject">${escapeHtml(c.subject)}</h4>
                  <span class="complaint-badge ${c.status}">${c.status.replace('-', ' ')}</span>
                </div>
                ${c.orderNumber ? `<p style="font-size:12px;color:var(--text-muted);margin:0 0 6px;">Order Ref: <strong>${escapeHtml(c.orderNumber)}</strong></p>` : ''}
                <p class="complaint-msg">${escapeHtml(c.message)}</p>
                ${c.adminNote ? `
                  <div class="admin-reply-box">
                    <strong style="color:var(--gold-deep);display:block;margin-bottom:3px;"><i class="fa-solid fa-reply mr-1"></i> Management Response:</strong>
                    ${escapeHtml(c.adminNote)}
                  </div>
                ` : `
                  <p style="font-size:12px;color:var(--text-muted);font-style:italic;margin-top:6px;"><i class="fa-regular fa-clock mr-1"></i> Awaiting manager review</p>
                `}
              </article>
            `).join('')}
          </div>
        `}
      </div>
    </div>
  `;
}

function setComplaintFilter(filter) {
  customerState.complaintFilter = filter;
  renderActiveView();
}

// ============================================
// VIEW 5: RESTAURANT MENU
// ============================================
function renderMenuViewHtml() {
  return `
    <div class="panel">
      <div class="panel-head">
        <div>
          <h3>Ember &amp; Brew Menu</h3>
          <p class="panel-sub">Browse artisan single-origin coffee, food, and pastries</p>
        </div>
        <a href="${withBranch('/')}" class="btn-primary">
          <i class="fa-solid fa-cart-shopping"></i> Go to Full Menu &amp; Order
        </a>
      </div>
      <div class="panel-body text-center" style="padding:48px 24px;">
        <i class="fa-solid fa-mug-hot" style="font-size:48px;color:var(--gold);margin-bottom:16px;display:block;"></i>
        <h3 class="serif" style="font-size:24px;margin:0 0 8px;">Explore Our Fresh Handcrafted Menu</h3>
        <p style="color:var(--text-muted);max-width:540px;margin:0 auto 24px;line-height:1.6;">
          Order ahead, customize your dishes with delicious add-ons, and have freshly roasted coffee delivered straight to your door.
        </p>
        <a href="${withBranch('/')}" class="btn-primary" style="font-size:15px;padding:12px 24px;">
          <i class="fa-solid fa-utensils"></i> Open Full Menu &amp; Cart
        </a>
      </div>
    </div>
  `;
}

// ============================================
// MODAL CONTROLLERS
// ============================================
function openNewReservationModal() {
  const mb = document.getElementById('reservationModalBackdrop');
  if (mb) {
    mb.removeAttribute('hidden');
    const form = document.getElementById('modalReservationForm');
    if (form) {
      const today = new Date().toISOString().split('T')[0];
      if (form.date) {
        form.date.min = today;
        if (!form.date.value) form.date.value = today;
      }
      if (form.time && !form.time.value) {
        const nextHour = new Date(Date.now() + 60 * 60 * 1000);
        form.time.value = String(nextHour.getHours()).padStart(2, '0') + ':00';
      }
    }
  }
}

function closeNewReservationModal() {
  const mb = document.getElementById('reservationModalBackdrop');
  if (mb) mb.setAttribute('hidden', '');
}

function openNewComplaintModal() {
  const mb = document.getElementById('complaintModalBackdrop');
  if (mb) mb.removeAttribute('hidden');
}

function closeNewComplaintModal() {
  const mb = document.getElementById('complaintModalBackdrop');
  if (mb) mb.setAttribute('hidden', '');
}

// ============================================
// EVENT HANDLERS & DATA LOADING
// ============================================
function switchDashboardView(viewName) {
  customerState.dashboardView = viewName;
  renderPortal();
  closeMobileSidebar();
}

function closeMobileSidebar() {
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('sidebarOverlay')?.classList.remove('open');
}

function onGlobalSearch(query) {
  customerState.searchQuery = query;
  renderActiveView();
}

function renderActiveView() {
  const vc = document.getElementById('view-container');
  if (vc) vc.innerHTML = renderCurrentViewHtml();
  if (customerState.dashboardView === 'tracking' && customerState.selectedOrderNumber) {
    loadLiveTrackingData(customerState.selectedOrderNumber);
  }
}

async function loadCustomerData() {
  try {
    const [orders, complaints, reservations] = await Promise.all([
      apiFetch(withBranch('/api/orders/mine/list'), { headers: authHeaders() }),
      apiFetch(withBranch('/api/complaints/mine/list'), { headers: authHeaders() }),
      apiFetch(withBranch('/api/reservations/mine/list'), { headers: authHeaders() })
    ]);
    customerState.orders = Array.isArray(orders) ? orders : [];
    customerState.complaints = Array.isArray(complaints) ? complaints : [];
    customerState.reservations = Array.isArray(reservations) ? reservations : [];
    customerState.dataLoaded = true;
    renderActiveView();
  } catch (err) {
    if (err.message.toLowerCase().includes('token') || err.message.toLowerCase().includes('account')) {
      clearSession();
      renderPortal();
      showToast('Session expired. Please sign in again.', 'error');
    }
  }
}

function bindDashboardEvents() {
  // Mobile sidebar toggle
  const toggle = document.getElementById('menuToggle');
  const overlay = document.getElementById('sidebarOverlay');
  const sidebar = document.getElementById('sidebar');

  if (toggle && sidebar && overlay) {
    toggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      overlay.classList.toggle('open');
    });
    overlay.addEventListener('click', () => {
      sidebar.classList.remove('open');
      overlay.classList.remove('open');
    });
  }

  // Sidebar navigation items
  document.querySelectorAll('.sidebar [data-view]').forEach(btn => {
    btn.addEventListener('click', e => {
      const v = e.currentTarget.dataset.view;
      switchDashboardView(v);
    });
  });

  // Logout button
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      clearSession();
      renderPortal();
      showToast('Signed out successfully.', 'info');
    });
  }

  // Reservation Form submit
  const resForm = document.getElementById('modalReservationForm');
  if (resForm) {
    resForm.addEventListener('submit', async e => {
      e.preventDefault();
      const form = e.target;
      const guestName = form.guestName.value.trim();
      const phone = form.phone.value.trim();
      const date = form.date.value;
      const time = form.time.value;
      const guests = Number(form.guests.value);
      const notes = form.notes.value.trim();
      const errEl = document.getElementById('modal-error-reservation');
      if (errEl) errEl.textContent = '';

      if (!isValidCustomerPhone(phone)) {
        if (errEl) errEl.textContent = 'Enter a valid phone number (e.g. 03206551696).';
        return;
      }

      const bookingDt = parseReservationDateTime(date, time);
      if (!bookingDt || bookingDt.getTime() <= Date.now()) {
        if (errEl) errEl.textContent = 'Please choose a future reservation time. The selected time has already passed.';
        return;
      }

      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true; btn.textContent = 'Submitting…';

      try {
        await apiFetch('/api/reservations', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ guestName, email: customerState.customer?.email || '', phone, date, time, guests, notes, branchId: getBranchId() || undefined })
        });
        showToast('Table reservation request sent! Host will confirm shortly.', 'success');
        closeNewReservationModal();
        await loadCustomerData();
      } catch (err) {
        if (errEl) errEl.textContent = err.message;
      } finally {
        btn.disabled = false; btn.textContent = 'Submit Request';
      }
    });
  }

  // Complaint Form submit
  const compForm = document.getElementById('modalComplaintForm');
  if (compForm) {
    compForm.addEventListener('submit', async e => {
      e.preventDefault();
      const form = e.target;
      const orderNumber = form.orderNumber.value.trim();
      const subject = form.subject.value;
      const message = form.message.value.trim();
      const errEl = document.getElementById('modal-error-complaint');
      if (errEl) errEl.textContent = '';

      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true; btn.textContent = 'Sending…';

      try {
        await apiFetch('/api/complaints', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ orderNumber, subject, message })
        });
        showToast('Support ticket filed. Manager response will appear here.', 'success');
        closeNewComplaintModal();
        await loadCustomerData();
      } catch (err) {
        if (errEl) errEl.textContent = err.message;
      } finally {
        btn.disabled = false; btn.textContent = 'Send to Management';
      }
    });
  }

  // Initial load tracking if on tracking view
  if (customerState.dashboardView === 'tracking' && customerState.selectedOrderNumber) {
    loadLiveTrackingData(customerState.selectedOrderNumber);
  }
}

// ============================================
// TOAST NOTIFICATIONS
// ============================================

function reorderPreviousOrder(orderNumber) {
  const order = (customerState.orders || []).find(o => o.orderNumber === orderNumber);
  if (!order || !Array.isArray(order.items) || order.items.length === 0) {
    showToast('Could not load items for this order.', 'error');
    return;
  }
  const cartLines = order.items.map(it => ({
    item: {
      id: it.menuItem || it.id || it._id || '',
      name: it.name,
      price: Number(it.price) || 0,
      desc: it.description || '',
      cat: it.category || 'Special',
      img: it.image || ''
    },
    qty: Math.max(1, Number(it.qty) || 1),
    addons: Array.isArray(it.addons) ? it.addons : [],
    addonSignature: Array.isArray(it.addons) ? it.addons.map(a => a.name).sort().join('|') : ''
  }));

  localStorage.setItem('eb_cart', JSON.stringify(cartLines));
  localStorage.setItem('eb_return_to_checkout', '1');
  showToast(`Reordering ${orderNumber}! Taking you to checkout…`, 'success');
  setTimeout(() => {
    window.location.href = withBranch('/index.html?view=checkout');
  }, 400);
}

function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast show ${type}`;
  setTimeout(() => {
    toast.className = 'toast';
  }, 3200);
}
