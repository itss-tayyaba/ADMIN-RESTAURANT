const customerState = {
  token: localStorage.getItem('eb_customer_token'),
  customer: JSON.parse(localStorage.getItem('eb_customer') || 'null'),
  orders: [],
  complaints: [],
  dashboardView: 'orders',
  selectedOrderNumber: null,
  authMode: 'login'
};

const STATUS_LABELS = {
  received: 'Order received',
  preparing: 'Preparing',
  ready: 'Ready',
  'out-for-delivery': 'Out for delivery',
  delivered: 'Delivered',
  completed: 'Completed',
  cancelled: 'Cancelled'
};
const STATUS_ICONS = {
  received: 'fa-receipt',
  preparing: 'fa-utensils',
  ready: 'fa-box-open',
  'out-for-delivery': 'fa-motorcycle',
  delivered: 'fa-check-circle',
  completed: 'fa-gift',
  cancelled: 'fa-ban'
};
const TRACKING_FLOW = ['received', 'preparing', 'ready', 'out-for-delivery', 'delivered', 'completed'];

let customerTrackingPoll = null;

window.addEventListener('DOMContentLoaded', () => {
  initPortal();
});

function apiFetch(url, options = {}) {
  return fetch(url, options).then(async res => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Server error');
    }
    return data;
  });
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
  customerState.dashboardView = 'orders';
  customerState.selectedOrderNumber = null;
  customerState.authMode = 'login';
  // Remove stored session and any remembered credential keys
  localStorage.removeItem('eb_customer_token');
  localStorage.removeItem('eb_customer');
  localStorage.removeItem('eb_customer_identifier');
  localStorage.removeItem('eb_customer_password');
  // Clear visible auth inputs (if the auth form is present)
  setTimeout(() => {
    const authInputs = document.querySelectorAll('#auth-forms input');
    authInputs.forEach(i => { i.value = ''; i.autocomplete = 'off'; i.removeAttribute('autofocus'); });
  }, 40);
}

function initPortal() {
  renderPortal();
}

function renderPortal() {
  const main = document.getElementById('portal-main');
  main.innerHTML = customerState.customer ? renderDashboardHtml() : renderAuthHtml();
  updateTopNav();
  if (customerState.customer) {
    bindDashboardEvents();
    if (!customerState.orders.length || !customerState.complaints.length) {
      loadCustomerData();
    } else {
      renderDashboardViewData();
    }
    if (customerState.dashboardView === 'tracking') {
      renderTracking(customerState.selectedOrderNumber);
    }
  } else {
    bindAuthEvents();
  }
}

function updateTopNav() {
  const nav = document.getElementById('site-nav');
  const shell = document.getElementById('portal-shell');
  const welcome = document.getElementById('nav-welcome');
  const logoutButton = document.getElementById('nav-logout-button');
  if (!welcome || !logoutButton) return;
  if (customerState.customer) {
    if (nav) nav.classList.remove('hidden');
    if (shell) shell.classList.add('max-w-7xl', 'mx-auto', 'px-6', 'py-10');
    const firstName = customerState.customer.name ? customerState.customer.name.split(' ')[0] : 'Guest';
    welcome.textContent = `Welcome back, ${firstName}`;
    logoutButton.classList.remove('hidden');
  } else {
    if (nav) nav.classList.add('hidden');
    if (shell) shell.classList.remove('max-w-7xl', 'mx-auto', 'px-6', 'py-10');
    welcome.textContent = 'Customer Portal';
    logoutButton.classList.add('hidden');
  }
}

function renderDashboardViewData() {
  if (document.getElementById('order-section')) {
    renderOrders();
  }
  if (document.getElementById('complaint-section')) {
    renderComplaints();
  }
}

function renderAuthHtml() {
  return `
    <div class="auth-body">
      <div class="auth-wrap">
        <div class="auth-card">
          <div class="auth-brand">
            <span class="dot"></span>
            <span class="name">Ember <em>&amp;</em> Brew</span>
          </div>
          <p class="auth-sub">Sign in to track orders, view delivery rider details, and submit complaints.</p>
          <div class="auth-tabs">
            <button id="auth-login-tab" class="auth-tab active">Sign In</button>
            <button id="auth-register-tab" class="auth-tab">Create Account</button>
          </div>
          <div id="auth-forms"></div>
        </div>
        <p class="auth-foot">Ember &amp; Brew Customer Portal</p>
      </div>
    </div>
  `;
}

function renderLoginForm() {
  return `
    <form id="login-form" class="space-y-4" autocomplete="off">
      <div>
        <input name="identifier" class="form-input" placeholder="Email or phone number" autocomplete="off" value="">
        <div class="field-error" id="error-identifier"></div>
      </div>
      <div>
        <input type="password" name="password" class="form-input" placeholder="Password" autocomplete="off" value="">
        <div class="field-error" id="error-password"></div>
      </div>
      <div class="field-error" id="error-login"></div>
      <button type="submit" class="form-button fullwidth">Sign In</button>
    </form>
  `;
}

function renderRegisterForm() {
  return `
    <form id="register-form" class="space-y-4" autocomplete="off">
      <div>
        <input name="name" class="form-input" placeholder="Full name" autocomplete="off" value="">
        <div class="field-error" id="error-name"></div>
      </div>
      <div>
        <input name="phone" class="form-input" placeholder="Phone number" autocomplete="off" value="" inputmode="numeric" maxlength="11" pattern="\d{11}">
        <div class="field-error" id="error-phone"></div>
      </div>
      <div>
        <input name="email" type="email" class="form-input" placeholder="Email (optional)" autocomplete="off" value="">
        <div class="field-error" id="error-email"></div>
      </div>
      <div>
        <input name="password" type="password" class="form-input" placeholder="Password (min 6 characters)" autocomplete="off" value="">
        <div class="field-error" id="error-password"></div>
      </div>
      <div class="field-error" id="error-register"></div>
      <button type="submit" class="form-button fullwidth">Create Account</button>
    </form>
  `;
}

function bindAuthEvents() {
  const authForms = document.getElementById('auth-forms');
  const loginTab = document.getElementById('auth-login-tab');
  const registerTab = document.getElementById('auth-register-tab');

  loginTab.addEventListener('click', () => switchAuthMode('login'));
  registerTab.addEventListener('click', () => switchAuthMode('register'));
  switchAuthMode(customerState.authMode);
}

function sanitizePhoneInput(el) {
  el.addEventListener('input', () => {
    const cursorFromEnd = el.value.length - el.selectionStart;
    let v = el.value;
    // auto-correct common lookalike characters (O/o -> 0, l/I -> 1)
    v = v.replace(/[oO]/g, '0').replace(/[lI]/g, '1');
    // strip anything that still isn't a digit
    v = v.replace(/\D/g, '').slice(0, 11);
    el.value = v;
    const pos = Math.max(0, v.length - cursorFromEnd);
    el.setSelectionRange(pos, pos);
  });
}

function switchAuthMode(mode) {
  customerState.authMode = mode;
  document.getElementById('auth-login-tab').classList.toggle('active', mode === 'login');
  document.getElementById('auth-register-tab').classList.toggle('active', mode === 'register');
  const authForms = document.getElementById('auth-forms');
  authForms.innerHTML = mode === 'login' ? renderLoginForm() : renderRegisterForm();

  if (mode === 'login') {
    document.getElementById('login-form').addEventListener('submit', handleLogin);
  } else {
    document.getElementById('register-form').addEventListener('submit', handleRegister);
    const phoneInput = document.querySelector('#register-form input[name="phone"]');
    if (phoneInput) sanitizePhoneInput(phoneInput);
  }
  // Ensure fields aren't autofilled and are empty after rendering
  setTimeout(() => {
    const inputs = authForms.querySelectorAll('input');
    inputs.forEach(i => { i.value = ''; i.autocomplete = 'off'; });
  }, 40);
}

function showFieldError(fieldId, message) {
  const el = document.getElementById(fieldId);
  if (el) el.textContent = message || '';
}

function clearAuthErrors() {
  document.querySelectorAll('.field-error').forEach(el => el.textContent = '');
}

async function handleLogin(event) {
  event.preventDefault();
  clearAuthErrors();
  const form = event.target;
  const identifier = form.identifier.value.trim();
  const password = form.password.value;
  let valid = true;

  if (!identifier) { showFieldError('error-identifier', 'Please enter email or phone.'); valid = false; }
  if (!password) { showFieldError('error-password', 'Please enter your password.'); valid = false; }
  if (!valid) return;

  const button = form.querySelector('button[type="submit"]');
  button.disabled = true; button.textContent = 'Signing in…';

  try {
    const data = await apiFetch('/api/customer-auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password })
    });
    saveSession(data.token, data.customer);
    renderPortal();
    showToast(`Welcome back, ${data.customer.name.split(' ')[0]}!`, 'success');
  } catch (err) {
    showFieldError('error-login', err.message);
  } finally {
    button.disabled = false; button.textContent = 'Sign In';
  }
}

async function handleRegister(event) {
  event.preventDefault();
  clearAuthErrors();
  const form = event.target;
  const name = form.name.value.trim();
  const phone = form.phone.value.trim();
  const email = form.email.value.trim();
  const password = form.password.value;
  let valid = true;

  if (name.length < 2) { showFieldError('error-name', 'Please enter your name.'); valid = false; }
  if (!/^\d{11}$/.test(phone)) { showFieldError('error-phone', 'Phone number must be exactly 11 digits.'); valid = false; }
  if (password.length < 6) { showFieldError('error-password', 'Use at least 6 characters.'); valid = false; }
  if (!valid) return;

  const button = form.querySelector('button[type="submit"]');
  button.disabled = true; button.textContent = 'Creating account…';

  try {
    const data = await apiFetch('/api/customer-auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone, email, password })
    });
    saveSession(data.token, data.customer);
    renderPortal();
    showToast(`Welcome, ${data.customer.name.split(' ')[0]}!`, 'success');
  } catch (err) {
    showFieldError('error-register', err.message);
  } finally {
    button.disabled = false; button.textContent = 'Create Account';
  }
}

function renderDashboardHtml() {
  return `
    <div class="customer-app">
      <aside class="customer-sidebar">
        <div class="sidebar-brand">
          <span class="dot"></span>
          <span class="title">Ember <em>&amp;</em> Brew</span>
        </div>
        <div class="sidebar-menu">
          <button class="sidebar-item ${customerState.dashboardView === 'orders' ? 'active' : ''}" data-view="orders">My Orders</button>
          <button class="sidebar-item ${customerState.dashboardView === 'menu' ? 'active' : ''}" data-view="menu">View Menu</button>
          <button class="sidebar-item ${customerState.dashboardView === 'tracking' ? 'active' : ''}" data-view="tracking">Track Order</button>
          <button class="sidebar-item ${customerState.dashboardView === 'complaints' ? 'active' : ''}" data-view="complaints">My Complaints</button>
        </div>
        <div class="sidebar-foot">
          <p class="sidebar-note">Use the order list to open live tracking. Your complaint history and menu access are all here too.</p>
        </div>
      </aside>
      <div class="customer-main">
        <section class="customer-content">
          <div class="dashboard-summary">
            <div class="summary-card">
              <div class="label">Signed in as</div>
              <div class="value">${customerState.customer.email || customerState.customer.phone}</div>
              <p class="sub">Your customer account information.</p>
            </div>
            <div class="summary-card">
              <div class="label">Orders</div>
              <div class="value">${customerState.orders.length}</div>
              <p class="sub">Open the list below to track any active order.</p>
            </div>
            <div class="summary-card">
              <div class="label">Complaints</div>
              <div class="value">${customerState.complaints.length}</div>
              <p class="sub">Check status or file a new complaint.</p>
            </div>
          </div>
          <div id="dashboard-pane">${renderDashboardPaneHtml()}</div>
        </section>
      </div>
    </div>
  `;
}

function renderDashboardPaneHtml() {
  if (customerState.dashboardView === 'complaints') {
    return `
      <div class="portal-card">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <p class="text-xs uppercase tracking-[.4em] text-muted">Your Complaints</p>
            <h2 class="text-2xl font-semibold">Complaint history</h2>
          </div>
          <button onclick="openComplaintForm()" class="link-button">New complaint</button>
        </div>
        <div id="complaint-section"></div>
      </div>
    `;
  }

  if (customerState.dashboardView === 'menu') {
    return `
      <div class="portal-card">
        <p class="text-xs uppercase tracking-[.4em] text-muted">View Menu</p>
        <h2 class="text-2xl font-semibold mb-4">Browse our full menu</h2>
        <p class="text-muted mb-6">Head back to the main site to choose food, add to cart, and place a fresh order.</p>
        <a href="/" class="link-button">Open Menu</a>
      </div>
    `;
  }

  if (customerState.dashboardView === 'tracking') {
    return `
      <div class="portal-card mb-6">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p class="text-xs uppercase tracking-[.4em] text-muted">Track Order</p>
            <h2 class="text-2xl font-semibold">Enter an order number</h2>
            <p class="text-muted mt-2">Use your order number to view live status and delivery progress.</p>
          </div>
        </div>
        <form id="tracking-form" class="mt-6 grid gap-4 sm:grid-cols-[1fr_auto] items-end">
          <input name="orderNumber" class="form-input" placeholder="EB-1041" value="${customerState.selectedOrderNumber || ''}">
          <button type="submit" class="form-button fullwidth">Track Order</button>
        </form>
      </div>
      <div id="tracking-panel"></div>
    `;
  }

  return `
    <div class="portal-card mb-6">
      <div class="flex flex-wrap gap-3 items-center justify-between">
        <div>
          <p class="text-xs uppercase tracking-[.4em] text-muted">My Orders</p>
          <h2 class="text-2xl font-semibold">Order history</h2>
        </div>
        <span class="text-sm text-muted">Select any order to open tracking.</span>
      </div>
    </div>
    <div id="order-section"></div>
    <div id="tracking-panel"></div>
  `;
}

function bindDashboardEvents() {
  const navLogout = document.getElementById('nav-logout-button');
  if (navLogout) {
    navLogout.addEventListener('click', () => {
      clearSession();
      renderPortal();
    });
  }

  const localLogout = document.getElementById('logout-button');
  if (localLogout) {
    localLogout.addEventListener('click', () => {
      clearSession();
      renderPortal();
    });
  }

  document.querySelectorAll('.customer-sidebar [data-view]').forEach(button => {
    button.addEventListener('click', event => {
      customerState.dashboardView = event.currentTarget.dataset.view;
      if (customerState.dashboardView !== 'tracking') {
        customerState.selectedOrderNumber = null;
      }
      renderPortal();
    });
  });

  const yourComplaintBtn = document.getElementById('your-complaint-btn');
  if (yourComplaintBtn) {
    yourComplaintBtn.addEventListener('click', () => {
      customerState.dashboardView = 'complaints';
      customerState.selectedOrderNumber = null;
      renderPortal();
    });
  }

  const trackingForm = document.getElementById('tracking-form');
  if (trackingForm) {
    trackingForm.addEventListener('submit', event => {
      event.preventDefault();
      const orderNumber = trackingForm.orderNumber.value.trim();
      if (!orderNumber) return;
      customerState.selectedOrderNumber = orderNumber;
      renderTracking(orderNumber);
    });
  }
}

async function loadCustomerData() {
  try {
    const [orders, complaints] = await Promise.all([
      apiFetch('/api/orders/mine/list', { headers: authHeaders() }),
      apiFetch('/api/complaints/mine/list', { headers: authHeaders() })
    ]);
    customerState.orders = orders;
    customerState.complaints = complaints;
    renderOrders();
    renderComplaints();
  } catch (err) {
    if (err.message.toLowerCase().includes('token') || err.message.toLowerCase().includes('account')) {
      clearSession();
      renderPortal();
      showToast('Session expired. Please sign in again.', 'error');
      return;
    }
    document.getElementById('order-section').innerHTML = `<p class="text-sm text-terra-300">${err.message}</p>`;
    document.getElementById('complaint-section').innerHTML = `<p class="text-sm text-terra-300">${err.message}</p>`;
  }
}

function renderOrders() {
  const container = document.getElementById('order-section');
  if (!container) return;
  if (customerState.orders.length === 0) {
    container.innerHTML = `
      <div class="portal-card">
        <p class="text-brand-300">You haven't placed any orders yet.</p>
        <a href="/" class="link-button mt-4">Browse the menu</a>
      </div>
    `;
    return;
  }
  container.innerHTML = `<div class="order-list">${customerState.orders.map(orderCardHtml).join('')}</div>`;
  document.querySelectorAll('.track-order-button').forEach(button => {
    button.addEventListener('click', event => {
      event.preventDefault();
      const orderNumber = event.currentTarget.dataset.order;
      customerState.selectedOrderNumber = orderNumber;
      customerState.dashboardView = 'tracking';
      renderPortal();
    });
  });
}

function orderCardHtml(order) {
  const deliveryInfo = order.deliveryBoyName ? `
    <div class="mt-4 rounded-2xl border border-brand-800 bg-brand-950/80 p-4 text-sm text-brand-300">
      <p class="text-brand-400 text-[11px] uppercase tracking-[.25em] mb-2">Delivery rider</p>
      <p class="font-semibold text-brand-100">${order.deliveryBoyName}</p>
      ${order.deliveryBoyPhone ? `<p class="text-brand-300 mt-1">${order.deliveryBoyPhone}</p>` : ''}
    </div>
  ` : '';

  return `
    <article class="order-card">
      <div class="order-header">
        <div>
          <div class="text-brand-400 text-[11px] uppercase tracking-[.25em] mb-2">${order.orderType.replace('-', ' ')}</div>
          <p class="font-semibold text-brand-100 mb-1">${order.orderNumber}</p>
          <p class="text-sm text-brand-300">${new Date(order.createdAt).toLocaleDateString()} · ${order.items.length} item${order.items.length === 1 ? '' : 's'}</p>
        </div>
        <span class="order-badge">${order.status.replace('-', ' ')}</span>
      </div>
      <div class="mt-4 text-sm text-brand-300">
        <p>${order.items.map(i => `${i.qty}x ${i.name}`).join(', ')}</p>
        <p class="mt-3"><strong>Total:</strong> $${order.total.toFixed(2)}</p>
      </div>
      ${deliveryInfo}
      <div class="mt-5 flex flex-wrap gap-3 items-center">
        <button data-order="${order.orderNumber}" class="track-order-button link-button">View Tracking</button>
        <span class="text-xs text-brand-400 uppercase tracking-[.25em]">Tap for live status</span>
      </div>
    </article>
  `;
}

function renderComplaints() {
  const container = document.getElementById('complaint-section');
  if (!container) return;
  if (customerState.complaints.length === 0) {
    container.innerHTML = `
      <div class="portal-card">
        <p class="text-brand-300">No complaints filed yet.</p>
        <button onclick="openComplaintForm()" class="link-button mt-4">File a complaint</button>
      </div>
    `;
    return;
  }
  container.innerHTML = `<div class="complaint-list">${customerState.complaints.map(complaintCardHtml).join('')}</div>`;
}

function complaintCardHtml(complaint) {
  return `
    <article class="complaint-card">
      <div class="order-header">
        <div>
          <p class="font-semibold text-brand-100">${complaint.subject}</p>
          ${complaint.orderNumber ? `<p class="text-sm text-brand-300">Order ${complaint.orderNumber}</p>` : ''}
        </div>
        <span class="complaint-status ${complaint.status}">${complaint.status.replace('-', ' ')}</span>
      </div>
      <p class="mt-4 text-sm text-brand-300">${complaint.message}</p>
      ${complaint.adminNote ? `<div class="mt-4 rounded-2xl border border-brand-800 bg-brand-950/80 p-4 text-sm text-brand-300"><p class="font-semibold text-brand-100 mb-2">Manager response</p><p>${complaint.adminNote}</p></div>` : `<p class="mt-4 text-xs text-brand-400 italic">Awaiting manager response.</p>`}
    </article>
  `;
}

function openComplaintForm() {
  const panel = document.getElementById('portal-main');
  panel.innerHTML = `
    <div class="portal-card">
      <div class="flex items-center justify-between gap-4 mb-6">
        <div>
          <p class="text-brand-400 uppercase tracking-[.35em] text-xs mb-2">Complaint</p>
          <h2 class="font-display text-2xl font-bold">Submit a complaint</h2>
        </div>
        <button onclick="renderPortal()" class="link-button">Back to dashboard</button>
      </div>
      <form id="complaint-form" class="space-y-5">
        <div>
          <label class="text-sm text-brand-300 mb-2 block">Order number (optional)</label>
          <input name="orderNumber" class="form-input" placeholder="EB-XXXXXX">
        </div>
        <div>
          <label class="text-sm text-brand-300 mb-2 block">Subject</label>
          <select name="subject" class="form-input">
            <option>Food Quality</option>
            <option>Order Accuracy</option>
            <option>Service</option>
            <option>Delivery / Wait Time</option>
            <option>Other</option>
          </select>
        </div>
        <div>
          <label class="text-sm text-brand-300 mb-2 block">Message</label>
          <textarea name="message" rows="5" class="form-input" placeholder="Describe the issue…"></textarea>
          <div class="field-error" id="error-complaint"></div>
        </div>
        <div class="flex flex-wrap gap-3 items-center">
          <button type="submit" class="form-button">Send Complaint</button>
          <button type="button" onclick="renderPortal()" class="link-button">Cancel</button>
        </div>
      </form>
    </div>
  `;
  document.getElementById('complaint-form').addEventListener('submit', handleComplaintSubmit);
}

async function handleComplaintSubmit(event) {
  event.preventDefault();
  document.getElementById('error-complaint').textContent = '';
  const form = event.target;
  const orderNumber = form.orderNumber.value.trim();
  const subject = form.subject.value;
  const message = form.message.value.trim();
  if (message.length < 5) {
    document.getElementById('error-complaint').textContent = 'Please describe the issue.';
    return;
  }
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true; button.textContent = 'Sending…';
  try {
    await apiFetch('/api/complaints', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ orderNumber, subject, message })
    });
    showToast('Complaint submitted. You can view the manager response in your dashboard.', 'success');
    await loadCustomerData();
  } catch (err) {
    document.getElementById('error-complaint').textContent = err.message;
  } finally {
    button.disabled = false; button.textContent = 'Send Complaint';
  }
}

async function renderTracking(orderNumber) {
  const panel = document.getElementById('tracking-panel');
  panel.innerHTML = `<div class="portal-card"><p class="text-muted">Loading tracking details…</p></div>`;
  try {
    const order = await apiFetch('/api/orders/' + encodeURIComponent(orderNumber));
    // Choose a tracking flow based on order type.
    // Delivery orders include the 'out-for-delivery' step; dine-in/takeaway do not.
    const ot = (order.orderType || '').toLowerCase();
    let statusFlow = TRACKING_FLOW;
    if (!/deliver|delivery|out-for-delivery/.test(ot)) {
      statusFlow = ['received', 'preparing', 'ready', 'completed'];
    }
    // If the order has a status not present in the chosen flow, append it so it renders.
    if (!statusFlow.includes(order.status)) statusFlow = statusFlow.concat(order.status);
    const statusIdx = statusFlow.indexOf(order.status);
    const isArrived = order.status === statusFlow[statusFlow.length - 1];

    panel.innerHTML = `
      <div class="portal-card">
        <button onclick="renderPortal()" class="text-brand-400 text-sm mb-6 inline-flex items-center gap-2 hover:text-brand-300 transition-colors"><i class="fa-solid fa-arrow-left text-xs"></i> Back to dashboard</button>
        <div class="text-center mb-10">
          <p class="text-xs uppercase tracking-[.3em] text-muted mb-2">Tracking</p>
          <h2 class="font-display text-3xl font-bold mb-2">${order.orderNumber}</h2>
          <p class="text-muted text-sm">${STATUS_LABELS[order.status]}</p>
        </div>
        ${order.status === 'cancelled' ? `
          <div class="text-center py-6 mb-6 bg-[#F3DFDC] border border-[#E0B8AB] rounded-2xl">
            <p class="font-semibold text-[#B54B3A]">This order was cancelled.</p>
          </div>
        ` : `
          <div class="order-journey mb-8">
            <div class="journey-track">
              <div class="journey-progress" style="width:${(statusIdx/(statusFlow.length-1))*100}%"></div>
              <div class="journey-mover ${isArrived ? 'arrived' : ''}" style="left:${(statusIdx/(statusFlow.length-1))*100}%">
                <div class="mover-box"><i class="fa-solid ${STATUS_ICONS[order.status]}"></i></div>
                <div class="mover-shadow"></div>
              </div>
              ${statusFlow.map((s, i) => {
                const cls = i < statusIdx ? 'done' : i === statusIdx ? 'active' : '';
                const icon = i < statusIdx ? '<i class="fa-solid fa-check"></i>' : `<i class="fa-solid ${STATUS_ICONS[s]}"></i>`;
                const log = Array.isArray(order.statusLog) ? order.statusLog.find(l => l.status === s) : null;
                return `
                  <div class="journey-stop ${cls}" style="left:${(i/(statusFlow.length-1))*100}%">
                    <div class="stop-icon">${icon}${cls === 'active' && s === 'preparing' ? '<span class="steam s1"></span><span class="steam s2"></span><span class="steam s3"></span>' : ''}</div>
                    <span class="stop-label">${STATUS_LABELS[s]}</span>
                    ${log ? `<span class="stop-time">${new Date(log.time).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span>` : ''}
                  </div>
                `;
              }).join('')}
            </div>
            ${order.status === 'completed' ? `
              <div class="celebrate">
                <span class="celebrate-emoji">🎉</span>
                <p class="celebrate-text">Order complete!</p>
                <p class="celebrate-sub">Enjoy your meal, ${order.customerName ? order.customerName.split(' ')[0] : 'Customer'}!</p>
              </div>
            ` : ''}
          </div>
        `}
        <div class="grid gap-4 md:grid-cols-2">
          <div class="summary-card">
            <div class="label">Order type</div>
            <div class="value capitalize">${order.orderType}</div>
          </div>
          <div class="summary-card">
            <div class="label">Total</div>
            <div class="value">$${order.total.toFixed(2)}</div>
          </div>
        </div>
        ${order.deliveryBoyName ? `
          <div class="portal-card mt-6">
            <p class="text-xs uppercase tracking-[.3em] text-muted mb-2">Delivery rider</p>
            <p class="font-semibold text-xl mb-2">${order.deliveryBoyName}</p>
            ${order.deliveryBoyPhone ? `<a href="tel:${order.deliveryBoyPhone}" class="link-button">Call rider</a>` : ''}
          </div>
        ` : ''}
      </div>
    `;

    if (customerTrackingPoll) clearInterval(customerTrackingPoll);
    if (!['completed', 'cancelled'].includes(order.status)) {
      customerTrackingPoll = setInterval(async () => {
        try {
          const fresh = await apiFetch('/api/orders/' + encodeURIComponent(order.orderNumber));
          if (fresh.status !== order.status) {
            if (fresh.status === 'ready') showToast(`Order ${order.orderNumber} is ready!`, 'info');
            if (fresh.status === 'completed') showToast(`Order ${order.orderNumber} completed. Enjoy!`, 'success');
            renderTracking(order.orderNumber);
          }
        } catch (err) {
          // ignore polling errors silently
        }
      }, 8000);
    }
  } catch (err) {
    panel.innerHTML = `
      <div class="portal-card text-center">
        <p class="text-muted mb-4">${err.message}</p>
        <button onclick="renderPortal()" class="link-button">Back to dashboard</button>
      </div>
    `;
  }
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<i class="fa-solid ${type === 'success' ? 'fa-circle-check' : type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-info'} toast-icon"></i><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}
