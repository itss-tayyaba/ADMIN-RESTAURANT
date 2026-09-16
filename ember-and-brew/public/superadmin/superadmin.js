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

  // Manage Subscription Modal
  const manageSubscriptionModal = document.getElementById('manageSubscriptionModal');
  const manageSubscriptionForm = document.getElementById('manageSubscriptionForm');
  const subModalSubtitle = document.getElementById('subModalSubtitle');
  const subTenantId = document.getElementById('subTenantId');
  const subSelectedPlan = document.getElementById('subSelectedPlan');
  const subBillingCycle = document.getElementById('subBillingCycle');
  const subStatus = document.getElementById('subStatus');
  const subExpiresAt = document.getElementById('subExpiresAt');
  const subNotes = document.getElementById('subNotes');
  const manageSubError = document.getElementById('manageSubError');
  const closeManageSubModal = document.getElementById('closeManageSubModal');
  const cancelManageSubBtn = document.getElementById('cancelManageSubBtn');
  const chipExtend30 = document.getElementById('chipExtend30');
  const chipExtend90 = document.getElementById('chipExtend90');
  const chipExtend365 = document.getElementById('chipExtend365');
  const planSelectGrid = document.getElementById('planSelectGrid');

  // Subscription filters state
  let subPlanFilter = 'all';
  let subStatusFilter = 'all';

  const TIER_META = {
    starter: {
      name: 'Starter',
      priceMonthly: 49,
      priceAnnual: 490,
      icon: 'fa-bolt',
      tagline: 'Single-branch essentials',
      features: [
        '1 Main Branch Location',
        'Up to 500 Orders / month',
        'Storefront & Table QR Ordering',
        '1 Chef & Rider Staff Account',
        'Standard Email Support'
      ]
    },
    pro: {
      name: 'Pro',
      priceMonthly: 99,
      priceAnnual: 990,
      icon: 'fa-star',
      tagline: 'Multi-branch growth engine',
      features: [
        'Up to 3 Active Branches',
        'Unlimited Orders & Menu Items',
        'Live Kitchen Display System (KDS)',
        'Delivery Rider Dispatch Engine',
        'Advanced Revenue Analytics',
        'Priority 24/7 Support'
      ]
    },
    enterprise: {
      name: 'Enterprise',
      priceMonthly: 199,
      priceAnnual: 1990,
      icon: 'fa-crown',
      tagline: 'Global multi-brand platform',
      features: [
        'Unlimited Branches Nationwide',
        'Multi-Currency & Regional Taxes',
        'Custom Domain & Brand White-Label',
        'Dedicated Account Manager',
        'Custom POS Integrations',
        '99.9% High-Availability SLA'
      ]
    }
  };

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
  // 6. SUBSCRIPTIONS VIEW — Real SaaS Subscription Management Center
  // ================================================================
  async function renderSubscriptions() {
    pageTitle.textContent = 'Subscriptions';
    breadcrumb.textContent = 'SaaS Subscription Tiers, Billing Cycles & Revenue Operations';
    scopePill.textContent = 'Platform Superadmin';
    content.innerHTML = '<div class="loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading SaaS subscription data…</div>';

    try {
      const data = await api('/api/tenants');
      cachedTenants = data.tenants || [];
    } catch (err) {
      content.innerHTML = '<div class="error-state">' + esc(err.message) + '</div>';
      return;
    }

    const totalTenants = cachedTenants.length;
    let totalMRR = 0;
    let activeSubCount = 0;
    let trialSubCount = 0;
    let suspendedSubCount = 0;
    let expiringSoonCount = 0;
    const tierCounts = { starter: 0, pro: 0, enterprise: 0 };

    const now = Date.now();
    cachedTenants.forEach(t => {
      const plan = t.plan && TIER_META[t.plan] ? t.plan : 'pro';
      const cycle = t.billingCycle === 'annual' ? 'annual' : 'monthly';
      const tierDef = TIER_META[plan];
      const monthlyRate = cycle === 'annual' ? (tierDef.priceAnnual / 12) : tierDef.priceMonthly;

      tierCounts[plan] = (tierCounts[plan] || 0) + 1;

      if (t.status === 'active') {
        activeSubCount++;
        totalMRR += monthlyRate;
      } else if (t.status === 'trial') {
        trialSubCount++;
      } else if (t.status === 'suspended') {
        suspendedSubCount++;
      }

      if (t.subscriptionExpiresAt && t.status !== 'suspended') {
        const daysLeft = Math.ceil((new Date(t.subscriptionExpiresAt) - now) / (1000 * 60 * 60 * 24));
        if (daysLeft <= 7 && daysLeft >= 0) {
          expiringSoonCount++;
        }
      }
    });

    const totalARR = totalMRR * 12;

    // Filter list
    let list = cachedTenants;
    if (subPlanFilter !== 'all') {
      list = list.filter(t => (t.plan || 'pro') === subPlanFilter);
    }
    if (subStatusFilter !== 'all') {
      if (subStatusFilter === 'active') {
        list = list.filter(t => t.status === 'active');
      } else if (subStatusFilter === 'trial') {
        list = list.filter(t => t.status === 'trial');
      } else if (subStatusFilter === 'suspended') {
        list = list.filter(t => t.status === 'suspended');
      } else if (subStatusFilter === 'expiring') {
        list = list.filter(t => {
          if (!t.subscriptionExpiresAt || t.status === 'suspended') return false;
          const daysLeft = Math.ceil((new Date(t.subscriptionExpiresAt) - now) / (1000 * 60 * 60 * 24));
          return daysLeft <= 7;
        });
      }
    }
    if (currentSearchTerm) {
      list = list.filter(t =>
        (t.name || '').toLowerCase().includes(currentSearchTerm) ||
        (t.slug || '').toLowerCase().includes(currentSearchTerm) ||
        (t.ownerName || '').toLowerCase().includes(currentSearchTerm) ||
        (t.ownerEmail || '').toLowerCase().includes(currentSearchTerm)
      );
    }

    // 1. TOP STATS
    const statsHtml = '<div class="stat-grid">' +
      statCard('Monthly Recurring Revenue (MRR)', '$' + Number(totalMRR).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), 'gold', 'ARR: $' + Number(totalARR).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' /yr') +
      statCard('Active Paying Subscriptions', activeSubCount + ' / ' + totalTenants, 'sage', Math.round((activeSubCount / (totalTenants || 1)) * 100) + '% paying conversion rate') +
      statCard('In Evaluation / Trial', trialSubCount, 'blue', '14-day full onboarding trials') +
      statCard('Expiring Soon (<7 Days)', expiringSoonCount, expiringSoonCount > 0 ? 'ember' : 'sage', expiringSoonCount > 0 ? 'Urgent renewal outreach needed' : 'All subscriptions current') +
      statCard('Suspended / Churned', suspendedSubCount, suspendedSubCount > 0 ? 'danger' : '', suspendedSubCount > 0 ? 'Accounts locked from dashboard' : 'Zero suspended accounts') +
      '</div>';

    // 2. PRICING TIERS SHOWCASE
    const tiersHtml = '<div class="tier-grid">' +
      ['starter', 'pro', 'enterprise'].map(key => {
        const tier = TIER_META[key];
        const count = tierCounts[key] || 0;
        const pct = Math.round((count / (totalTenants || 1)) * 100);
        const isFeatured = key === 'pro';

        return '<div class="tier-card' + (isFeatured ? ' featured' : '') + '">' +
          (isFeatured ? '<div class="tier-popular-tag">MOST POPULAR</div>' : '') +
          '<div class="tier-head">' +
            '<div class="tier-name"><i class="fa-solid ' + tier.icon + '" style="margin-right:8px;color:' + (isFeatured ? 'var(--gold)' : 'var(--text-muted)') + ';"></i>' + esc(tier.name) + '</div>' +
            '<span class="tier-tenants-pill">' + count + ' ' + (count === 1 ? 'Restaurant' : 'Restaurants') + ' (' + pct + '%)</span>' +
          '</div>' +
          '<div style="font-size:12px;color:var(--text-muted);margin-bottom:14px;">' + esc(tier.tagline) + '</div>' +
          '<div class="tier-price-wrap">' +
            '<span class="tier-price">$' + tier.priceMonthly + '</span>' +
            '<span class="tier-cycle">/ month</span>' +
            '<span class="tier-annual-note">or $' + tier.priceAnnual + ' / yr</span>' +
          '</div>' +
          '<ul class="tier-features">' +
            tier.features.map(f => '<li><i class="fa-solid fa-circle-check"></i> ' + esc(f) + '</li>').join('') +
          '</ul>' +
        '</div>';
      }).join('') +
      '</div>';

    // 3. FILTER BAR
    const filterBarHtml = '<div class="sub-filter-bar">' +
      '<div class="sub-filter-tabs" id="planFilterTabs">' +
        '<span style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-right:4px;">Plan:</span>' +
        '<button class="sub-filter-btn' + (subPlanFilter === 'all' ? ' active' : '') + '" data-plan="all">All Plans</button>' +
        '<button class="sub-filter-btn' + (subPlanFilter === 'starter' ? ' active' : '') + '" data-plan="starter">Starter <span class="count-badge">' + (tierCounts.starter || 0) + '</span></button>' +
        '<button class="sub-filter-btn' + (subPlanFilter === 'pro' ? ' active' : '') + '" data-plan="pro">Pro ★ <span class="count-badge">' + (tierCounts.pro || 0) + '</span></button>' +
        '<button class="sub-filter-btn' + (subPlanFilter === 'enterprise' ? ' active' : '') + '" data-plan="enterprise">Enterprise <span class="count-badge">' + (tierCounts.enterprise || 0) + '</span></button>' +
      '</div>' +
      '<div class="sub-filter-tabs" id="statusFilterTabs">' +
        '<span style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-right:4px;">Status:</span>' +
        '<button class="sub-filter-btn' + (subStatusFilter === 'all' ? ' active' : '') + '" data-status="all">All (' + totalTenants + ')</button>' +
        '<button class="sub-filter-btn' + (subStatusFilter === 'active' ? ' active' : '') + '" data-status="active">Active <span class="count-badge">' + activeSubCount + '</span></button>' +
        '<button class="sub-filter-btn' + (subStatusFilter === 'trial' ? ' active' : '') + '" data-status="trial">In Trial <span class="count-badge">' + trialSubCount + '</span></button>' +
        '<button class="sub-filter-btn' + (subStatusFilter === 'expiring' ? ' active' : '') + '" data-status="expiring">Expiring Soon <span class="count-badge" style="background:#FDEEEC;color:#B33927;">' + expiringSoonCount + '</span></button>' +
        '<button class="sub-filter-btn' + (subStatusFilter === 'suspended' ? ' active' : '') + '" data-status="suspended">Suspended <span class="count-badge">' + suspendedSubCount + '</span></button>' +
      '</div>' +
    '</div>';

    // 4. TABLE ROWS
    const rowsHtml = list.length
      ? list.map(t => {
          const planKey = t.plan && TIER_META[t.plan] ? t.plan : 'pro';
          const tierDef = TIER_META[planKey];
          const cycle = t.billingCycle === 'annual' ? 'annual' : 'monthly';
          const rateText = cycle === 'annual'
            ? '$' + tierDef.priceAnnual + ' <small style="color:var(--text-muted);">/yr</small>'
            : '$' + tierDef.priceMonthly + ' <small style="color:var(--text-muted);">/mo</small>';

          let renewPillHtml = '';
          let dateFormatted = 'Perpetual';

          if (t.subscriptionExpiresAt) {
            const expDate = new Date(t.subscriptionExpiresAt);
            dateFormatted = expDate.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
            const daysLeft = Math.ceil((expDate - now) / (1000 * 60 * 60 * 24));

            if (t.status === 'suspended') {
              renewPillHtml = '<span class="renew-pill danger"><i class="fa-solid fa-lock"></i> Suspended</span>';
            } else if (daysLeft < 0) {
              renewPillHtml = '<span class="renew-pill expired"><i class="fa-solid fa-triangle-exclamation"></i> Expired ' + Math.abs(daysLeft) + 'd ago</span>';
            } else if (daysLeft <= 3) {
              renewPillHtml = '<span class="renew-pill danger"><i class="fa-solid fa-clock"></i> ' + daysLeft + 'd left</span>';
            } else if (daysLeft <= 7) {
              renewPillHtml = '<span class="renew-pill warning"><i class="fa-solid fa-clock"></i> ' + daysLeft + 'd left</span>';
            } else {
              renewPillHtml = '<span class="renew-pill ok"><i class="fa-solid fa-check"></i> ' + daysLeft + 'd left</span>';
            }
          } else {
            renewPillHtml = '<span class="renew-pill ok"><i class="fa-solid fa-infinity"></i> Active</span>';
          }

          const ownerName = t.ownerName || (t.ownerUser ? t.ownerUser.name : '—');
          const ownerEmail = t.ownerEmail || (t.ownerUser ? t.ownerUser.email : '—');

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
                '<strong>' + esc(ownerName) + '</strong>' +
                '<span>' + esc(ownerEmail) + '</span>' +
              '</div>' +
            '</td>' +
            '<td>' +
              '<span class="badge ' + esc(planKey) + '" style="text-transform:capitalize;font-weight:700;">' +
                '<i class="fa-solid ' + tierDef.icon + '" style="margin-right:4px;"></i>' + esc(planKey) +
              '</span>' +
            '</td>' +
            '<td>' +
              '<span style="text-transform:capitalize;font-weight:600;">' + esc(cycle) + '</span>' +
              (cycle === 'annual' ? ' <span class="renew-pill ok" style="font-size:10px;padding:2px 6px;">Save 17%</span>' : '') +
            '</td>' +
            '<td><strong>' + rateText + '</strong></td>' +
            '<td>' +
              '<div style="font-size:13px;font-weight:600;color:var(--ink);">' + esc(dateFormatted) + '</div>' +
              '<div style="margin-top:3px;">' + renewPillHtml + '</div>' +
            '</td>' +
            '<td>' + statusBadge(t.status) + '</td>' +
            '<td>' +
              (t.subscriptionNotes
                ? '<span title="' + esc(t.subscriptionNotes) + '" style="font-size:11.5px;color:var(--text-muted);display:inline-block;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"><i class="fa-regular fa-note-sticky"></i> ' + esc(t.subscriptionNotes) + '</span>'
                : '<span style="color:var(--text-dim);font-size:12px;">—</span>') +
            '</td>' +
            '<td>' +
              '<div class="table-actions">' +
                '<button class="btn-action-icon manage-sub-btn" data-id="' + t._id + '" title="Manage Subscription" style="color:var(--gold-deep);"><i class="fa-solid fa-sliders"></i></button>' +
                '<button class="btn-action-icon extend-sub-btn" data-id="' + t._id + '" title="Quick Extend +30 Days"><i class="fa-solid fa-calendar-plus"></i></button>' +
                (t.status === 'suspended'
                  ? '<button class="btn-action-icon activate-sub-btn" data-id="' + t._id + '" title="Activate Subscription" style="color:var(--sage);"><i class="fa-solid fa-play"></i></button>'
                  : '<button class="btn-action-icon suspend-sub-btn" data-id="' + t._id + '" title="Suspend Restaurant" style="color:var(--danger);"><i class="fa-solid fa-pause"></i></button>') +
              '</div>' +
            '</td>' +
          '</tr>';
        }).join('')
      : '<tr><td colspan="9" class="empty-state">No restaurant subscriptions found matching your filters.</td></tr>';

    const tableHtml = '<div class="panel">' +
      '<div class="panel-head">' +
        '<h3>Restaurant Subscriptions Directory (' + list.length + ')</h3>' +
        '<div class="panel-head-actions">' +
          '<span style="font-size:12.5px;color:var(--text-muted);">' + activeSubCount + ' Paying Restaurants · $' + Number(totalMRR).toFixed(2) + ' MRR</span>' +
        '</div>' +
      '</div>' +
      '<div class="table-scroll">' +
        '<table class="data-table">' +
          '<thead>' +
            '<tr>' +
              '<th>Restaurant Brand</th>' +
              '<th>Owner Contact</th>' +
              '<th>Tier</th>' +
              '<th>Billing Cycle</th>' +
              '<th>Rate</th>' +
              '<th>Renews / Expires</th>' +
              '<th>Status</th>' +
              '<th>Admin Notes</th>' +
              '<th>Manage</th>' +
            '</tr>' +
          '</thead>' +
          '<tbody>' + rowsHtml + '</tbody>' +
        '</table>' +
      '</div>' +
    '</div>';

    content.innerHTML = statsHtml + tiersHtml + filterBarHtml + tableHtml;

    // 5. ATTACH EVENT LISTENERS
    // Plan Filter Buttons
    content.querySelectorAll('#planFilterTabs .sub-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        subPlanFilter = btn.dataset.plan;
        renderSubscriptions();
      });
    });

    // Status Filter Buttons
    content.querySelectorAll('#statusFilterTabs .sub-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        subStatusFilter = btn.dataset.status;
        renderSubscriptions();
      });
    });

    // Manage Subscription button click -> opens modal
    content.querySelectorAll('.manage-sub-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tenant = cachedTenants.find(t => t._id === btn.dataset.id);
        if (tenant) openManageSubscriptionModal(tenant);
      });
    });

    // Quick Extend 30 Days
    content.querySelectorAll('.extend-sub-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await api('/api/tenants/' + btn.dataset.id + '/subscription', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ extendMonths: 1 })
          });
          showToast('Extended subscription by 30 days (+1 Month).');
          renderSubscriptions();
        } catch (err) { alert(err.message); }
      });
    });

    // Suspend Subscription
    content.querySelectorAll('.suspend-sub-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Are you sure you want to suspend this restaurant? The admin and ordering portals will be locked.')) return;
        try {
          await api('/api/tenants/' + btn.dataset.id + '/subscription', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'suspended' })
          });
          showToast('Restaurant subscription suspended.');
          renderSubscriptions();
        } catch (err) { alert(err.message); }
      });
    });

    // Activate Subscription
    content.querySelectorAll('.activate-sub-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await api('/api/tenants/' + btn.dataset.id + '/subscription', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'active' })
          });
          showToast('Restaurant subscription activated.');
          renderSubscriptions();
        } catch (err) { alert(err.message); }
      });
    });
  }

  // ================================================================
  // MANAGE SUBSCRIPTION MODAL WORKFLOW
  // ================================================================
  function openManageSubscriptionModal(tenant) {
    if (!manageSubscriptionModal) return;
    subTenantId.value = tenant._id;
    subModalSubtitle.textContent = 'Managing SaaS Subscription for ' + tenant.name;

    const plan = tenant.plan && TIER_META[tenant.plan] ? tenant.plan : 'pro';
    subSelectedPlan.value = plan;

    // Highlight plan card
    if (planSelectGrid) {
      planSelectGrid.querySelectorAll('.plan-select-card').forEach(card => {
        card.classList.toggle('selected', card.dataset.plan === plan);
      });
    }

    subBillingCycle.value = tenant.billingCycle || 'monthly';
    subStatus.value = tenant.status || 'active';
    subNotes.value = tenant.subscriptionNotes || '';
    manageSubError.hidden = true;
    manageSubError.textContent = '';

    // Set expiry date in input
    if (tenant.subscriptionExpiresAt) {
      const d = new Date(tenant.subscriptionExpiresAt);
      subExpiresAt.value = d.toISOString().slice(0, 10);
    } else {
      const defaultDate = new Date();
      defaultDate.setDate(defaultDate.getDate() + 30);
      subExpiresAt.value = defaultDate.toISOString().slice(0, 10);
    }

    manageSubscriptionModal.classList.remove('hidden');
  }

  function closeManageSubscriptionModal() {
    if (manageSubscriptionModal) manageSubscriptionModal.classList.add('hidden');
  }

  if (closeManageSubModal) closeManageSubModal.addEventListener('click', closeManageSubscriptionModal);
  if (cancelManageSubBtn) cancelManageSubBtn.addEventListener('click', closeManageSubscriptionModal);

  // Plan select cards interaction
  if (planSelectGrid) {
    planSelectGrid.querySelectorAll('.plan-select-card').forEach(card => {
      card.addEventListener('click', () => {
        planSelectGrid.querySelectorAll('.plan-select-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        subSelectedPlan.value = card.dataset.plan;
      });
    });
  }

  // Quick extension chips
  function addDaysToExpiryInput(days) {
    let base = new Date();
    if (subExpiresAt.value) {
      const current = new Date(subExpiresAt.value + 'T00:00:00');
      if (!isNaN(current.getTime()) && current > base) {
        base = current;
      }
    }
    base.setDate(base.getDate() + days);
    subExpiresAt.value = base.toISOString().slice(0, 10);
  }

  if (chipExtend30) chipExtend30.addEventListener('click', () => addDaysToExpiryInput(30));
  if (chipExtend90) chipExtend90.addEventListener('click', () => addDaysToExpiryInput(90));
  if (chipExtend365) chipExtend365.addEventListener('click', () => addDaysToExpiryInput(365));

  // Handle Manage Subscription Form Submit
  if (manageSubscriptionForm) {
    manageSubscriptionForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      manageSubError.hidden = true;
      manageSubError.textContent = '';

      const submitBtn = document.getElementById('saveManageSubBtn');
      const origText = submitBtn.innerHTML;
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…';

      try {
        const id = subTenantId.value;
        await api('/api/tenants/' + id + '/subscription', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            plan: subSelectedPlan.value,
            billingCycle: subBillingCycle.value,
            status: subStatus.value,
            customExpiresAt: subExpiresAt.value ? new Date(subExpiresAt.value + 'T23:59:59').toISOString() : undefined,
            subscriptionNotes: subNotes.value
          })
        });

        closeManageSubscriptionModal();
        showToast('Subscription updated successfully!');
        renderSubscriptions();
      } catch (err) {
        manageSubError.textContent = err.message;
        manageSubError.hidden = false;
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = origText;
      }
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
