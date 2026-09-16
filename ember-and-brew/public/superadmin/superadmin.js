(function () {
  const token = localStorage.getItem('eb_admin_token');
  const user = JSON.parse(localStorage.getItem('eb_admin_user') || 'null');

  if (!token || !user || user.role !== 'superadmin') {
    window.location.href = '/admin/login';
    return;
  }

  // DOM Elements
  const content = document.getElementById('content');
  const pageTitle = document.getElementById('pageTitle');
  const breadcrumb = document.getElementById('breadcrumb');
  const scopePill = document.getElementById('scopePill');
  const userNameLabel = document.getElementById('userNameLabel');
  const userAvatar = document.getElementById('userAvatar');
  const globalSearchInput = document.getElementById('globalSearchInput');
  const toastNotification = document.getElementById('toastNotification');

  // Modals
  const createTenantModal = document.getElementById('createTenantModal');
  const createTenantForm = document.getElementById('createTenantForm');
  const newTenantName = document.getElementById('newTenantName');
  const newTenantSlug = document.getElementById('newTenantSlug');
  const newTenantCountry = document.getElementById('newTenantCountry');
  const newTenantCurrency = document.getElementById('newTenantCurrency');
  const newTenantTimezone = document.getElementById('newTenantTimezone');
  const createTenantError = document.getElementById('createTenantError');
  const submitCreateTenantBtn = document.getElementById('submitCreateTenantBtn');
  const closeCreateTenantModal = document.getElementById('closeCreateTenantModal');
  const cancelCreateTenantBtn = document.getElementById('cancelCreateTenantBtn');
  const toggleAdvTenantDetails = document.getElementById('toggleAdvTenantDetails');
  const advTenantDetails = document.getElementById('advTenantDetails');

  // Credentials Modal
  const credentialsModal = document.getElementById('credentialsModal');
  const credRestaurantName = document.getElementById('credRestaurantName');
  const credStorefrontUrl = document.getElementById('credStorefrontUrl');
  const credLoginUrl = document.getElementById('credLoginUrl');
  const credUsername = document.getElementById('credUsername');
  const credPassword = document.getElementById('credPassword');
  const copyUsernameBtn = document.getElementById('copyUsernameBtn');
  const copyPasswordBtn = document.getElementById('copyPasswordBtn');
  const copyAllCredentialsBtn = document.getElementById('copyAllCredentialsBtn');
  const closeCredentialsModalBtn = document.getElementById('closeCredentialsModalBtn');

  // Edit Tenant Modal
  const editTenantModal = document.getElementById('editTenantModal');
  const editTenantForm = document.getElementById('editTenantForm');
  const closeEditTenantModal = document.getElementById('closeEditTenantModal');
  const cancelEditTenantBtn = document.getElementById('cancelEditTenantBtn');

  // State
  let currentView = 'tenants';
  let cachedTenants = [];
  let cachedBranches = [];
  let cachedUsers = [];
  let cachedOrders = [];
  let currentSearchTerm = '';
  let activeCredentialsText = '';

  // Setup user details
  if (userNameLabel) userNameLabel.textContent = user.username || 'Superadmin';
  if (userAvatar) userAvatar.textContent = (user.username || 'S').charAt(0).toUpperCase();

  // Logout handler
  document.getElementById('logoutBtn').addEventListener('click', () => {
    localStorage.removeItem('eb_admin_token');
    localStorage.removeItem('eb_admin_user');
    window.location.href = '/admin/login';
  });

  // Utilities
  const money = (n, symbol) => (symbol || 'Rs ') + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function showToast(msg) {
    if (!toastNotification) return;
    toastNotification.textContent = msg;
    toastNotification.classList.remove('hidden');
    setTimeout(() => {
      toastNotification.classList.add('hidden');
    }, 2800);
  }

  async function api(path, options = {}) {
    const headers = { Authorization: 'Bearer ' + token, ...(options.headers || {}) };
    const res = await fetch(path, { ...options, headers });
    if (res.status === 401 || res.status === 403) {
      localStorage.removeItem('eb_admin_token');
      localStorage.removeItem('eb_admin_user');
      window.location.href = '/admin/login';
      throw new Error('Session expired');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || data.message || 'Request failed');
    return data;
  }

  function statCard(label, value, cls, sub) {
    return '<div class="stat-card ' + (cls || '') + '">' +
      '<div class="label">' + esc(label) + '</div>' +
      '<div class="value">' + value + '</div>' +
      (sub ? '<div class="sub">' + esc(sub) + '</div>' : '') +
      '</div>';
  }

  function statusBadge(status) {
    const s = String(status || 'active').toLowerCase();
    return '<span class="badge ' + esc(s) + '">' + esc(s) + '</span>';
  }

  function roleBadge(role) {
    const r = String(role || 'admin').toLowerCase();
    return '<span class="badge ' + esc(r) + '">' + esc(r) + '</span>';
  }

  function planBadge(plan) {
    const p = String(plan || 'pro').toLowerCase();
    return '<span class="badge ' + esc(p) + '">' + esc(p) + '</span>';
  }

  // Country defaults mapping
  const countryDefaults = {
    'Pakistan': { currency: 'PKR', symbol: 'Rs', tz: 'Asia/Karachi' },
    'Australia': { currency: 'AUD', symbol: 'A$', tz: 'Australia/Sydney' },
    'United Kingdom': { currency: 'GBP', symbol: '£', tz: 'Europe/London' },
    'United States': { currency: 'USD', symbol: '$', tz: 'America/New_York' },
    'United Arab Emirates': { currency: 'AED', symbol: 'AED', tz: 'Asia/Dubai' },
    'Canada': { currency: 'CAD', symbol: 'C$', tz: 'America/Toronto' },
    'Germany': { currency: 'EUR', symbol: '€', tz: 'Europe/Berlin' },
    'Saudi Arabia': { currency: 'SAR', symbol: 'SAR', tz: 'Asia/Riyadh' },
    'Qatar': { currency: 'QAR', symbol: 'QAR', tz: 'Asia/Qatar' },
    'Singapore': { currency: 'SGD', symbol: 'S$', tz: 'Asia/Singapore' }
  };

  // Sidebar navigation click
  document.querySelectorAll('.sidebar-nav .nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sidebar-nav .nav-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentView = btn.dataset.view;
      if (globalSearchInput) globalSearchInput.value = '';
      currentSearchTerm = '';
      renderCurrentView();
    });
  });

  // Global search input
  if (globalSearchInput) {
    globalSearchInput.addEventListener('input', (e) => {
      currentSearchTerm = e.target.value.toLowerCase().trim();
      renderCurrentView();
    });
  }

  function renderCurrentView() {
    if (currentView === 'tenants') renderTenants();
    else if (currentView === 'dashboard') renderDashboard();
    else if (currentView === 'branches') renderBranches();
    else if (currentView === 'users') renderUsers();
    else if (currentView === 'orders') renderOrders();
    else if (currentView === 'subscriptions') renderSubscriptions();
    else if (currentView === 'settings') renderSettings();
  }

  // ================================================================
  // 1. TENANTS VIEW (The requested TENANTS Management Screen)
  // Columns: Restaurant | Owner | Country | Branches | Status | Actions
  // ================================================================
  async function renderTenants() {
    pageTitle.textContent = 'Tenants';
    breadcrumb.textContent = 'Tenant Restaurant Brands';
    scopePill.textContent = 'Platform Superadmin';
    content.innerHTML = '<div class="loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading tenants…</div>';

    try {
      const data = await api('/api/tenants');
      cachedTenants = data.tenants || [];
    } catch (err) {
      content.innerHTML = '<div class="error-state">' + esc(err.message) + '</div>';
      return;
    }

    let list = cachedTenants;
    if (currentSearchTerm) {
      list = list.filter(t =>
        (t.name || '').toLowerCase().includes(currentSearchTerm) ||
        (t.slug || '').toLowerCase().includes(currentSearchTerm) ||
        (t.ownerName || '').toLowerCase().includes(currentSearchTerm) ||
        (t.ownerEmail || '').toLowerCase().includes(currentSearchTerm) ||
        (t.country || '').toLowerCase().includes(currentSearchTerm)
      );
    }

    const totalBranches = cachedTenants.reduce((s, t) => s + (t.stats?.branchCount || 0), 0);
    const activeTenants = cachedTenants.filter(t => t.status === 'active').length;

    const statsHtml = '<div class="stat-grid">' +
      statCard('Total Restaurants', cachedTenants.length, 'gold', 'Registered brand tenants') +
      statCard('Active Tenants', activeTenants, 'sage', 'Operating restaurants') +
      statCard('Total Branches', totalBranches, 'ember', 'Physical locations') +
      statCard('SaaS Platform Tier', 'Multi-Tenant', 'blue', 'Strict database isolation') +
      '</div>';

    const rowsHtml = list.length
      ? list.map(t => {
          const ownerDisplay = t.ownerUser?.name || t.ownerName || '—';
          const ownerEmailDisplay = t.ownerUser?.email || t.ownerEmail || (t.ownerUser?.username ? '@' + t.ownerUser.username : '');
          const countryDisplay = t.country || 'Pakistan';
          const branchCount = t.stats?.branchCount || 0;
          const status = t.status || 'active';

          return '<tr>' +
            '<td>' +
              '<div class="restaurant-cell">' +
                '<img src="' + esc(t.logo || '/images/app-logo.png') + '" alt="' + esc(t.name) + '" class="restaurant-logo" onerror="this.src=\'/images/app-logo.png\'">' +
                '<div class="restaurant-meta">' +
                  '<strong>' + esc(t.name) + '</strong>' +
                  '<span>/r/' + esc(t.slug) + '</span>' +
                '</div>' +
              '</div>' +
            '</td>' +
            '<td>' +
              '<div class="owner-cell">' +
                '<strong>' + esc(ownerDisplay) + '</strong>' +
                '<span>' + esc(ownerEmailDisplay) + '</span>' +
              '</div>' +
            '</td>' +
            '<td>' +
              '<span class="country-pill"><i class="fa-solid fa-earth-americas" style="color:var(--gold);font-size:11px;"></i> ' + esc(countryDisplay) + '</span>' +
            '</td>' +
            '<td>' +
              '<span class="branches-badge"><i class="fa-solid fa-code-branch"></i> ' + branchCount + ' ' + (branchCount === 1 ? 'branch' : 'branches') + '</span>' +
            '</td>' +
            '<td>' + statusBadge(status) + '</td>' +
            '<td>' +
              '<div class="table-actions">' +
                '<a href="/r/' + encodeURIComponent(t.slug) + '" target="_blank" class="btn-action-icon" title="Open Storefront"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>' +
                '<button class="btn-action-icon edit-tenant-btn" data-id="' + t._id + '" title="Manage Tenant"><i class="fa-solid fa-pen-to-square"></i></button>' +
              '</div>' +
            '</td>' +
          '</tr>';
        }).join('')
      : '<tr><td colspan="6" class="empty-state">No restaurant tenants found.</td></tr>';

    content.innerHTML = statsHtml +
      '<div class="panel">' +
        '<div class="panel-head">' +
          '<h3>TENANTS</h3>' +
          '<div class="panel-head-actions">' +
            '<button class="btn-primary-action" id="openCreateTenantBtn"><i class="fa-solid fa-plus"></i> Add Restaurant</button>' +
          '</div>' +
        '</div>' +
        '<div class="table-scroll">' +
          '<table class="data-table">' +
            '<thead>' +
              '<tr>' +
                '<th>Restaurant</th>' +
                '<th>Owner</th>' +
                '<th>Country</th>' +
                '<th>Branches</th>' +
                '<th>Status</th>' +
                '<th>Actions</th>' +
              '</tr>' +
            '</thead>' +
            '<tbody>' + rowsHtml + '</tbody>' +
          '</table>' +
        '</div>' +
      '</div>';

    // Hook + Add Restaurant button
    document.getElementById('openCreateTenantBtn').addEventListener('click', openCreateTenantModalHandler);

    // Hook edit buttons
    content.querySelectorAll('.edit-tenant-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tenant = cachedTenants.find(t => t._id === btn.dataset.id);
        if (tenant) openEditTenantModalHandler(tenant);
      });
    });
  }

  // ================================================================
  // 2. DASHBOARD VIEW (Platform High-Level Overview)
  // ================================================================
  async function renderDashboard() {
    pageTitle.textContent = 'Dashboard';
    breadcrumb.textContent = 'Platform Cross-Tenant Overview';
    scopePill.textContent = 'Platform Superadmin';
    content.innerHTML = '<div class="loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading platform dashboard…</div>';

    try {
      const [tenantsData, branchesData] = await Promise.all([
        api('/api/tenants'),
        api('/api/branches')
      ]);
      cachedTenants = tenantsData.tenants || [];
      cachedBranches = branchesData.branches || [];
    } catch (err) {
      content.innerHTML = '<div class="error-state">' + esc(err.message) + '</div>';
      return;
    }

    const totalTenants = cachedTenants.length;
    const totalBranches = cachedBranches.length;
    const totalOrders = cachedTenants.reduce((s, t) => s + (t.stats?.orderCount || 0), 0);
    const totalStaff = cachedTenants.reduce((s, t) => s + (t.stats?.adminCount || 0), 0);

    const statsHtml = '<div class="stat-grid">' +
      statCard('Total Restaurants', totalTenants, 'gold', 'Multi-tenant brands') +
      statCard('Active Branches', totalBranches, 'ember', 'Global physical locations') +
      statCard('Platform Orders', totalOrders, 'sage', 'Processed platform-wide') +
      statCard('Staff & Users', totalStaff, 'blue', 'Restaurant admins & chefs') +
      '</div>';

    const tenantsSummary = cachedTenants.map(t => {
      return '<tr>' +
        '<td><strong>' + esc(t.name) + '</strong></td>' +
        '<td>' + esc(t.country || 'Pakistan') + '</td>' +
        '<td>' + (t.stats?.branchCount || 0) + '</td>' +
        '<td>' + (t.stats?.orderCount || 0) + '</td>' +
        '<td>' + statusBadge(t.status) + '</td>' +
        '</tr>';
    }).join('');

    content.innerHTML = statsHtml +
      '<div class="panel">' +
        '<div class="panel-head">' +
          '<h3>Restaurant Brands Directory</h3>' +
          '<button class="btn-primary-action" id="dashAddTenantBtn"><i class="fa-solid fa-plus"></i> Add Restaurant</button>' +
        '</div>' +
        '<div class="table-scroll">' +
          '<table class="data-table">' +
            '<thead><tr><th>Restaurant</th><th>Country</th><th>Branches</th><th>Orders</th><th>Status</th></tr></thead>' +
            '<tbody>' + (tenantsSummary || '<tr><td colspan="5" class="empty-state">No tenants yet.</td></tr>') + '</tbody>' +
          '</table>' +
        '</div>' +
      '</div>';

    document.getElementById('dashAddTenantBtn').addEventListener('click', openCreateTenantModalHandler);
  }

  // ================================================================
  // 3. BRANCHES VIEW
  // ================================================================
  async function renderBranches() {
    pageTitle.textContent = 'Branches';
    breadcrumb.textContent = 'All Branches Across Restaurants';
    scopePill.textContent = 'Platform Superadmin';
    content.innerHTML = '<div class="loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading branches…</div>';

    try {
      const data = await api('/api/branches');
      cachedBranches = data.branches || [];
    } catch (err) {
      content.innerHTML = '<div class="error-state">' + esc(err.message) + '</div>';
      return;
    }

    let list = cachedBranches;
    if (currentSearchTerm) {
      list = list.filter(b =>
        (b.name || '').toLowerCase().includes(currentSearchTerm) ||
        (b.code || '').toLowerCase().includes(currentSearchTerm) ||
        (b.city || '').toLowerCase().includes(currentSearchTerm) ||
        (b.country || '').toLowerCase().includes(currentSearchTerm) ||
        (b.tenantId?.name || '').toLowerCase().includes(currentSearchTerm)
      );
    }

    const rowsHtml = list.length
      ? list.map(b => {
          const tenantName = b.tenantId?.name || 'Ember & Brew';
          return '<tr>' +
            '<td><strong>' + esc(b.name) + '</strong><br><small style="color:var(--text-muted);">' + esc(b.code) + '</small></td>' +
            '<td>' + esc(tenantName) + '</td>' +
            '<td>' + esc(b.city) + ', ' + esc(b.country) + '</td>' +
            '<td>' + (b.currencySymbol || 'Rs') + ' (' + esc(b.currency || 'PKR') + ')</td>' +
            '<td>' + (b.isActive ? '<span class="badge active">Active</span>' : '<span class="badge suspended">Inactive</span>') + '</td>' +
            '<td>' +
              '<a href="/order/' + encodeURIComponent(b.code) + '" target="_blank" class="btn-action-icon" title="View Menu"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>' +
            '</td>' +
          '</tr>';
        }).join('')
      : '<tr><td colspan="6" class="empty-state">No branches found.</td></tr>';

    content.innerHTML = '<div class="panel">' +
      '<div class="panel-head">' +
        '<h3>Branches Directory (' + list.length + ')</h3>' +
      '</div>' +
      '<div class="table-scroll">' +
        '<table class="data-table">' +
          '<thead><tr><th>Branch</th><th>Restaurant Brand</th><th>Location</th><th>Currency</th><th>Status</th><th>Storefront</th></tr></thead>' +
          '<tbody>' + rowsHtml + '</tbody>' +
        '</table>' +
      '</div>' +
    '</div>';
  }

  // ================================================================
  // 4. USERS VIEW
  // ================================================================
  async function renderUsers() {
    pageTitle.textContent = 'Users';
    breadcrumb.textContent = 'Platform Staff & Owner Accounts';
    scopePill.textContent = 'Platform Superadmin';
    content.innerHTML = '<div class="loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading users…</div>';

    try {
      const data = await api('/api/tenants/users/all');
      cachedUsers = data.users || [];
    } catch (err) {
      content.innerHTML = '<div class="error-state">' + esc(err.message) + '</div>';
      return;
    }

    let list = cachedUsers;
    if (currentSearchTerm) {
      list = list.filter(u =>
        (u.name || '').toLowerCase().includes(currentSearchTerm) ||
        (u.username || '').toLowerCase().includes(currentSearchTerm) ||
        (u.email || '').toLowerCase().includes(currentSearchTerm) ||
        (u.role || '').toLowerCase().includes(currentSearchTerm) ||
        (u.tenantId?.name || '').toLowerCase().includes(currentSearchTerm)
      );
    }

    const rowsHtml = list.length
      ? list.map(u => {
          const tenantName = u.tenantId?.name || (u.role === 'superadmin' ? 'Global Platform' : '—');
          const branchName = u.branchId?.name || '—';
          return '<tr>' +
            '<td><strong>' + esc(u.name || u.username) + '</strong><br><small style="color:var(--text-muted);">' + esc(u.email || '') + '</small></td>' +
            '<td><code>' + esc(u.username) + '</code></td>' +
            '<td>' + roleBadge(u.role) + '</td>' +
            '<td>' + esc(tenantName) + '</td>' +
            '<td>' + esc(branchName) + '</td>' +
            '<td>' + (u.active !== false ? '<span class="badge active">Active</span>' : '<span class="badge suspended">Disabled</span>') + '</td>' +
          '</tr>';
        }).join('')
      : '<tr><td colspan="6" class="empty-state">No users found.</td></tr>';

    content.innerHTML = '<div class="panel">' +
      '<div class="panel-head">' +
        '<h3>Platform User Accounts (' + list.length + ')</h3>' +
      '</div>' +
      '<div class="table-scroll">' +
        '<table class="data-table">' +
          '<thead><tr><th>Name &amp; Email</th><th>Username</th><th>Role</th><th>Restaurant</th><th>Branch</th><th>Status</th></tr></thead>' +
          '<tbody>' + rowsHtml + '</tbody>' +
        '</table>' +
      '</div>' +
    '</div>';
  }

  // ================================================================
  // 5. ORDERS VIEW
  // ================================================================
  async function renderOrders() {
    pageTitle.textContent = 'Orders';
    breadcrumb.textContent = 'Cross-Tenant Orders Stream';
    scopePill.textContent = 'Platform Superadmin';
    content.innerHTML = '<div class="loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading orders…</div>';

    try {
      cachedOrders = await api('/api/orders');
    } catch (err) {
      content.innerHTML = '<div class="error-state">' + esc(err.message) + '</div>';
      return;
    }

    let list = cachedOrders;
    if (currentSearchTerm) {
      list = list.filter(o =>
        (o.orderNumber || '').toLowerCase().includes(currentSearchTerm) ||
        (o.customerName || '').toLowerCase().includes(currentSearchTerm) ||
        (o.tenantId?.name || '').toLowerCase().includes(currentSearchTerm) ||
        (o.status || '').toLowerCase().includes(currentSearchTerm)
      );
    }

    const rowsHtml = list.length
      ? list.slice(0, 50).map(o => {
          const sym = o.tenantId?.currencySymbol || 'Rs';
          return '<tr>' +
            '<td><strong>' + esc(o.orderNumber) + '</strong></td>' +
            '<td>' + esc(o.tenantId?.name || 'Ember & Brew') + '</td>' +
            '<td>' + esc(o.customerName) + '</td>' +
            '<td>' + esc(o.orderType || 'dine-in') + '</td>' +
            '<td><strong>' + money(o.total, sym + ' ') + '</strong></td>' +
            '<td>' + statusBadge(o.status) + '</td>' +
            '<td>' + new Date(o.createdAt).toLocaleDateString() + '</td>' +
          '</tr>';
        }).join('')
      : '<tr><td colspan="7" class="empty-state">No orders found.</td></tr>';

    content.innerHTML = '<div class="panel">' +
      '<div class="panel-head">' +
        '<h3>Recent Platform Orders (' + list.length + ')</h3>' +
      '</div>' +
      '<div class="table-scroll">' +
        '<table class="data-table">' +
          '<thead><tr><th>Order #</th><th>Restaurant</th><th>Customer</th><th>Type</th><th>Total</th><th>Status</th><th>Date</th></tr></thead>' +
          '<tbody>' + rowsHtml + '</tbody>' +
        '</table>' +
      '</div>' +
    '</div>';
  }

  // ================================================================
  // 6. SUBSCRIPTIONS VIEW
  // ================================================================
  async function renderSubscriptions() {
    pageTitle.textContent = 'Subscriptions';
    breadcrumb.textContent = 'SaaS Subscription Tiers & Billing';
    scopePill.textContent = 'Platform Superadmin';
    content.innerHTML = '<div class="loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading subscriptions…</div>';

    try {
      const data = await api('/api/tenants');
      cachedTenants = data.tenants || [];
    } catch (err) {
      content.innerHTML = '<div class="error-state">' + esc(err.message) + '</div>';
      return;
    }

    let list = cachedTenants;
    if (currentSearchTerm) {
      list = list.filter(t => (t.name || '').toLowerCase().includes(currentSearchTerm));
    }

    const rowsHtml = list.length
      ? list.map(t => {
          const plan = t.plan || 'pro';
          const cycle = t.billingCycle || 'monthly';
          const exp = t.subscriptionExpiresAt ? new Date(t.subscriptionExpiresAt).toLocaleDateString() : 'Active (Perpetual)';

          return '<tr>' +
            '<td><strong>' + esc(t.name) + '</strong></td>' +
            '<td>' + planBadge(plan) + '</td>' +
            '<td style="text-transform:capitalize;">' + esc(cycle) + '</td>' +
            '<td>' + esc(exp) + '</td>' +
            '<td>' + statusBadge(t.status) + '</td>' +
            '<td>' +
              '<div class="table-actions">' +
                (t.status === 'suspended'
                  ? '<button class="btn-action-icon activate-sub-btn" data-id="' + t._id + '" title="Activate Subscription" style="color:var(--sage);"><i class="fa-solid fa-check"></i></button>'
                  : '<button class="btn-action-icon suspend-sub-btn" data-id="' + t._id + '" title="Suspend Restaurant" style="color:var(--danger);"><i class="fa-solid fa-ban"></i></button>') +
                '<button class="btn-action-icon extend-sub-btn" data-id="' + t._id + '" title="Extend +1 Month"><i class="fa-solid fa-calendar-plus"></i></button>' +
              '</div>' +
            '</td>' +
          '</tr>';
        }).join('')
      : '<tr><td colspan="6" class="empty-state">No subscriptions found.</td></tr>';

    content.innerHTML = '<div class="panel">' +
      '<div class="panel-head">' +
        '<h3>Active Restaurant Subscriptions</h3>' +
      '</div>' +
      '<div class="table-scroll">' +
        '<table class="data-table">' +
          '<thead><tr><th>Restaurant</th><th>Plan</th><th>Billing Cycle</th><th>Renews / Expires</th><th>Status</th><th>Quick Actions</th></tr></thead>' +
          '<tbody>' + rowsHtml + '</tbody>' +
        '</table>' +
      '</div>' +
    '</div>';

    // Hook subscription actions
    content.querySelectorAll('.activate-sub-btn').forEach(b => {
      b.addEventListener('click', async () => {
        try {
          await api('/api/tenants/' + b.dataset.id + '/subscription', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'active' })
          });
          showToast('Subscription activated.');
          renderSubscriptions();
        } catch (err) { alert(err.message); }
      });
    });

    content.querySelectorAll('.suspend-sub-btn').forEach(b => {
      b.addEventListener('click', async () => {
        if (!confirm('Are you sure you want to suspend this restaurant?')) return;
        try {
          await api('/api/tenants/' + b.dataset.id + '/subscription', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'suspended' })
          });
          showToast('Subscription suspended.');
          renderSubscriptions();
        } catch (err) { alert(err.message); }
      });
    });

    content.querySelectorAll('.extend-sub-btn').forEach(b => {
      b.addEventListener('click', async () => {
        try {
          await api('/api/tenants/' + b.dataset.id + '/subscription', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ extendMonths: 1 })
          });
          showToast('Extended subscription by 1 month.');
          renderSubscriptions();
        } catch (err) { alert(err.message); }
      });
    });
  }

  // ================================================================
  // 7. SETTINGS VIEW
  // ================================================================
  async function renderSettings() {
    pageTitle.textContent = 'Settings';
    breadcrumb.textContent = 'Superadmin Global Platform Configuration';
    scopePill.textContent = 'Platform Superadmin';

    content.innerHTML = '<div class="panel">' +
      '<div class="panel-head"><h3>Platform System Configuration</h3></div>' +
      '<div class="panel-body" style="padding:22px;">' +
        '<div style="font-size:13.5px;line-height:1.7;color:var(--text);">' +
          '<p><strong>Multi-Tenant Architecture Status:</strong> <span style="color:var(--sage);font-weight:700;">ACTIVE &amp; OPERATIONAL</span></p>' +
          '<p>Each restaurant tenant operates as an isolated organizational entity with independent branding, branches, menu items, orders, and owner access credentials.</p>' +
          '<hr style="border:none;border-top:1px solid var(--border);margin:18px 0;">' +
          '<p><strong>Current Logged In User:</strong> <code>' + esc(user.username) + '</code> (Role: <code>' + esc(user.role) + '</code>)</p>' +
          '<p><strong>Token Status:</strong> Authenticated with 8-hour JWT Session Token.</p>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  // ================================================================
  // MODAL WORKFLOWS: Create Tenant & Credentials Display
  // ================================================================

  function openCreateTenantModalHandler() {
    createTenantForm.reset();
    createTenantError.hidden = true;
    createTenantError.textContent = '';
    newTenantCountry.value = 'Pakistan';
    newTenantCurrency.value = 'PKR';
    newTenantTimezone.value = 'Asia/Karachi';
    createTenantModal.classList.remove('hidden');
    newTenantName.focus();
  }

  function closeCreateTenantModalHandler() {
    createTenantModal.classList.add('hidden');
  }

  if (closeCreateTenantModal) closeCreateTenantModal.addEventListener('click', closeCreateTenantModalHandler);
  if (cancelCreateTenantBtn) cancelCreateTenantBtn.addEventListener('click', closeCreateTenantModalHandler);

  // Auto-derive slug from Restaurant Name
  if (newTenantName && newTenantSlug) {
    newTenantName.addEventListener('input', () => {
      const raw = newTenantName.value;
      newTenantSlug.value = raw
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    });
  }

  // Country change auto-sets currency and timezone
  if (newTenantCountry) {
    newTenantCountry.addEventListener('change', () => {
      const selected = newTenantCountry.value;
      const def = countryDefaults[selected] || { currency: 'PKR', symbol: 'Rs', tz: 'Asia/Karachi' };
      if (newTenantCurrency) newTenantCurrency.value = def.currency;
      if (newTenantTimezone) newTenantTimezone.value = def.tz;
    });
  }

  // Optional Accordion Toggle
  if (toggleAdvTenantDetails && advTenantDetails) {
    toggleAdvTenantDetails.addEventListener('click', () => {
      advTenantDetails.classList.toggle('hidden');
      const icon = document.getElementById('advChevron');
      if (icon) {
        icon.classList.toggle('fa-chevron-down');
        icon.classList.toggle('fa-chevron-up');
      }
    });
  }

  // Handle Create Tenant Form Submission
  if (createTenantForm) {
    createTenantForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      createTenantError.hidden = true;
      createTenantError.textContent = '';

      const submitBtn = document.getElementById('submitCreateTenantBtn');
      const originalText = submitBtn.innerHTML;
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creating Restaurant…';

      const formData = new FormData(createTenantForm);
      const payload = Object.fromEntries(formData.entries());

      try {
        const res = await api('/api/tenants', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: payload.name,
            slug: payload.slug,
            ownerName: payload.ownerName,
            ownerEmail: payload.ownerEmail,
            country: payload.country,
            currency: payload.currency,
            timezone: payload.timezone,
            tagline: payload.tagline || undefined,
            theme: payload.primaryColor ? { primaryColor: payload.primaryColor } : undefined
          })
        });

        // Close creation modal
        closeCreateTenantModalHandler();

        // Populate credentials modal
        const tenant = res.tenant;
        const credentials = res.credentials;

        const origin = window.location.origin;
        const storefrontUrl = origin + '/r/' + tenant.slug;
        const loginUrl = origin + '/admin/login';

        credRestaurantName.textContent = tenant.name;
        credStorefrontUrl.textContent = storefrontUrl;
        credStorefrontUrl.href = storefrontUrl;
        credLoginUrl.textContent = loginUrl;
        credLoginUrl.href = loginUrl;
        credUsername.textContent = credentials.username;
        credPassword.textContent = credentials.tempPassword;

        activeCredentialsText =
          '========================================\n' +
          '🎉 ' + tenant.name.toUpperCase() + ' — ACCESS CREDENTIALS\n' +
          '========================================\n\n' +
          '🏪 Storefront URL: ' + storefrontUrl + '\n' +
          '🔑 Admin Portal: ' + loginUrl + '\n' +
          '👤 Username: ' + credentials.username + '\n' +
          '🔒 Temporary Password: ' + credentials.tempPassword + '\n' +
          '🛡️ Role: Restaurant Owner\n\n' +
          '⚠️ Please log in and change your password upon first sign in.';

        credentialsModal.classList.remove('hidden');
        showToast('Restaurant tenant created!');

        // Refresh tenants view
        renderTenants();
      } catch (err) {
        createTenantError.textContent = err.message;
        createTenantError.hidden = false;
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
      }
    });
  }

  // Credentials copy handlers
  if (copyUsernameBtn) {
    copyUsernameBtn.addEventListener('click', () => {
      const username = credUsername.textContent;
      navigator.clipboard.writeText(username).then(() => {
        showToast('Username copied to clipboard!');
      });
    });
  }

  if (copyPasswordBtn) {
    copyPasswordBtn.addEventListener('click', () => {
      const pwd = credPassword.textContent;
      navigator.clipboard.writeText(pwd).then(() => {
        showToast('Temporary password copied to clipboard!');
      });
    });
  }

  if (copyAllCredentialsBtn) {
    copyAllCredentialsBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(activeCredentialsText).then(() => {
        showToast('All credentials copied to clipboard!');
      });
    });
  }

  if (closeCredentialsModalBtn) {
    closeCredentialsModalBtn.addEventListener('click', () => {
      credentialsModal.classList.add('hidden');
      renderTenants();
    });
  }

  // Edit Tenant Modal handlers
  function openEditTenantModalHandler(tenant) {
    document.getElementById('editTenantHeading').textContent = 'Manage ' + tenant.name;
    document.getElementById('editTenantId').value = tenant._id;
    document.getElementById('editTenantName').value = tenant.name;
    document.getElementById('editTenantStatus').value = tenant.status || 'active';
    document.getElementById('editOwnerName').value = tenant.ownerName || '';
    document.getElementById('editOwnerEmail').value = tenant.ownerEmail || '';
    document.getElementById('editTenantCountry').value = tenant.country || 'Pakistan';
    document.getElementById('editTenantPlan').value = tenant.plan || 'pro';
    document.getElementById('editTenantError').hidden = true;
    editTenantModal.classList.remove('hidden');
  }

  function closeEditTenantModalHandler() {
    editTenantModal.classList.add('hidden');
  }

  if (closeEditTenantModal) closeEditTenantModal.addEventListener('click', closeEditTenantModalHandler);
  if (cancelEditTenantBtn) cancelEditTenantBtn.addEventListener('click', closeEditTenantModalHandler);

  if (editTenantForm) {
    editTenantForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('editTenantId').value;
      const errEl = document.getElementById('editTenantError');
      errEl.hidden = true;

      try {
        await api('/api/tenants/' + id, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: document.getElementById('editTenantName').value,
            status: document.getElementById('editTenantStatus').value,
            ownerName: document.getElementById('editOwnerName').value,
            ownerEmail: document.getElementById('editOwnerEmail').value,
            country: document.getElementById('editTenantCountry').value,
            plan: document.getElementById('editTenantPlan').value
          })
        });
        closeEditTenantModalHandler();
        showToast('Restaurant updated successfully.');
        renderTenants();
      } catch (err) {
        errEl.textContent = err.message;
        errEl.hidden = false;
      }
    });
  }

  // Initial render
  renderTenants();
})();
