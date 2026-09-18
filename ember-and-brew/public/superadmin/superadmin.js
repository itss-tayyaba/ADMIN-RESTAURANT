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

  // Create Branch Modal Elements
  const createBranchModal = document.getElementById('createBranchModal');
  const createBranchForm = document.getElementById('createBranchForm');
  const branchTenantId = document.getElementById('branchTenantId');
  const branchName = document.getElementById('branchName');
  const branchCode = document.getElementById('branchCode');
  const branchCity = document.getElementById('branchCity');
  const branchCountry = document.getElementById('branchCountry');
  const branchCurrency = document.getElementById('branchCurrency');
  const branchCurrencySymbol = document.getElementById('branchCurrencySymbol');
  const branchTimezone = document.getElementById('branchTimezone');
  const branchTaxRate = document.getElementById('branchTaxRate');
  const branchAddress = document.getElementById('branchAddress');
  const branchPhone = document.getElementById('branchPhone');
  const branchDeliveryZones = document.getElementById('branchDeliveryZones');
  const branchDeliveryRadiusKm = document.getElementById('branchDeliveryRadiusKm');
  const createBranchError = document.getElementById('createBranchError');
  const submitCreateBranchBtn = document.getElementById('submitCreateBranchBtn');
  const closeCreateBranchModal = document.getElementById('closeCreateBranchModal');
  const cancelCreateBranchBtn = document.getElementById('cancelCreateBranchBtn');

  // Reset Password Modal Elements
  const resetPasswordModal = document.getElementById('resetPasswordModal');
  const resetPwdHeading = document.getElementById('resetPwdHeading');
  const resetPwdSub = document.getElementById('resetPwdSub');
  const resetPwdConfirmState = document.getElementById('resetPwdConfirmState');
  const resetPwdDisplayState = document.getElementById('resetPwdDisplayState');
  const resetTargetUsername = document.getElementById('resetTargetUsername');
  const resetTargetRole = document.getElementById('resetTargetRole');
  const resetTargetTenant = document.getElementById('resetTargetTenant');
  const resetTargetBranch = document.getElementById('resetTargetBranch');
  const resetTargetUserId = document.getElementById('resetTargetUserId');
  const resetPwdError = document.getElementById('resetPwdError');
  const cancelResetPwdBtn = document.getElementById('cancelResetPwdBtn');
  const confirmResetPwdBtn = document.getElementById('confirmResetPwdBtn');
  const dispResetUsername = document.getElementById('dispResetUsername');
  const dispResetTempPwd = document.getElementById('dispResetTempPwd');
  const copyResetTempPwdBtn = document.getElementById('copyResetTempPwdBtn');
  const closeResetDisplayBtn = document.getElementById('closeResetDisplayBtn');

  // Create Admin Modal Elements
  const createAdminModal = document.getElementById('createAdminModal');
  const closeCreateAdminModal = document.getElementById('closeCreateAdminModal');
  const cancelCreateAdminBtn = document.getElementById('cancelCreateAdminBtn');
  const createAdminForm = document.getElementById('createAdminForm');
  const newAdminTenantSelect = document.getElementById('newAdminTenantSelect');
  const newAdminBranchSelect = document.getElementById('newAdminBranchSelect');
  const newAdminUsername = document.getElementById('newAdminUsername');
  const newAdminRole = document.getElementById('newAdminRole');
  const newAdminName = document.getElementById('newAdminName');
  const newAdminEmail = document.getElementById('newAdminEmail');
  const createAdminError = document.getElementById('createAdminError');
  const submitCreateAdminBtn = document.getElementById('submitCreateAdminBtn');

  // Audit Logs Modal Elements
  const auditLogsModal = document.getElementById('auditLogsModal');
  const closeAuditLogsModal = document.getElementById('closeAuditLogsModal');
  const dismissAuditLogsBtn = document.getElementById('dismissAuditLogsBtn');
  const auditLogsBody = document.getElementById('auditLogsBody');

  // Country Defaults Mapping
  const COUNTRY_DEFAULTS = {
    'Pakistan': { countryCode: 'PK', currency: 'PKR', symbol: 'Rs', tz: 'Asia/Karachi', taxRate: 0.08 },
    'Australia': { countryCode: 'AU', currency: 'AUD', symbol: 'A$', tz: 'Australia/Sydney', taxRate: 0.10 },
    'United Kingdom': { countryCode: 'GB', currency: 'GBP', symbol: '£', tz: 'Europe/London', taxRate: 0.20 },
    'United States': { countryCode: 'US', currency: 'USD', symbol: '$', tz: 'America/New_York', taxRate: 0.08 },
    'United Arab Emirates': { countryCode: 'AE', currency: 'AED', symbol: 'AED', tz: 'Asia/Dubai', taxRate: 0.05 },
    'Canada': { countryCode: 'CA', currency: 'CAD', symbol: 'C$', tz: 'America/Toronto', taxRate: 0.13 },
    'Germany': { countryCode: 'DE', currency: 'EUR', symbol: '€', tz: 'Europe/Berlin', taxRate: 0.19 },
    'Saudi Arabia': { countryCode: 'SA', currency: 'SAR', symbol: 'SAR', tz: 'Asia/Riyadh', taxRate: 0.15 },
    'Qatar': { countryCode: 'QA', currency: 'QAR', symbol: 'QAR', tz: 'Asia/Qatar', taxRate: 0.00 },
    'Singapore': { countryCode: 'SG', currency: 'SGD', symbol: 'S$', tz: 'Asia/Singapore', taxRate: 0.09 }
  };
  const countryDefaults = COUNTRY_DEFAULTS;

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
  let cachedCredentials = [];
  let credFilter = 'all';
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

  function formatDateTime(dt) {
    if (!dt) return '—';
    try {
      const d = new Date(dt);
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) +
        ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    } catch (_) {
      return '—';
    }
  }

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
    else if (currentView === 'credentials') renderCredentials();
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
                '<button class="btn-action-icon add-branch-tenant-btn" data-id="' + t._id + '" title="Add Branch to ' + esc(t.name) + '"><i class="fa-solid fa-code-branch"></i></button>' +
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
            '<button class="btn-primary-action" id="openCreateBranchFromTenantsBtn" style="background:linear-gradient(135deg,var(--ember),var(--ember-light));margin-right:8px;"><i class="fa-solid fa-code-branch"></i> Add Branch</button>' +
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

    // Hook + Add Branch button from Tenants panel
    const openBranchFromTenantsBtn = document.getElementById('openCreateBranchFromTenantsBtn');
    if (openBranchFromTenantsBtn) {
      openBranchFromTenantsBtn.addEventListener('click', () => openCreateBranchModalHandler());
    }

    // Hook Add Branch quick buttons per tenant
    content.querySelectorAll('.add-branch-tenant-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        openCreateBranchModalHandler(btn.dataset.id);
      });
    });

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
          '<div class="panel-head-actions">' +
            '<button class="btn-primary-action" id="dashAddBranchBtn" style="background:linear-gradient(135deg,var(--ember),var(--ember-light));margin-right:8px;"><i class="fa-solid fa-code-branch"></i> Add Branch</button>' +
            '<button class="btn-primary-action" id="dashAddTenantBtn"><i class="fa-solid fa-plus"></i> Add Restaurant</button>' +
          '</div>' +
        '</div>' +
        '<div class="table-scroll">' +
          '<table class="data-table">' +
            '<thead><tr><th>Restaurant</th><th>Country</th><th>Branches</th><th>Orders</th><th>Status</th></tr></thead>' +
            '<tbody>' + (tenantsSummary || '<tr><td colspan="5" class="empty-state">No tenants yet.</td></tr>') + '</tbody>' +
          '</table>' +
        '</div>' +
      '</div>';

    document.getElementById('dashAddTenantBtn').addEventListener('click', openCreateTenantModalHandler);
    const dashBranchBtn = document.getElementById('dashAddBranchBtn');
    if (dashBranchBtn) {
      dashBranchBtn.addEventListener('click', () => openCreateBranchModalHandler());
    }
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
        '<div class="panel-head-actions">' +
          '<button class="btn-primary-action" id="openCreateBranchBtn"><i class="fa-solid fa-plus"></i> Add Branch</button>' +
        '</div>' +
      '</div>' +
      '<div class="table-scroll">' +
        '<table class="data-table">' +
          '<thead><tr><th>Branch</th><th>Restaurant Brand</th><th>Location</th><th>Currency</th><th>Status</th><th>Storefront</th></tr></thead>' +
          '<tbody>' + rowsHtml + '</tbody>' +
        '</table>' +
      '</div>' +
    '</div>';

    const addBranchBtn = document.getElementById('openCreateBranchBtn');
    if (addBranchBtn) {
      addBranchBtn.addEventListener('click', () => openCreateBranchModalHandler());
    }
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
  // 4b. CREDENTIALS & ACCESS MANAGEMENT VIEW
  // ================================================================
  async function renderCredentials() {
    pageTitle.textContent = 'Credentials & Access Management';
    breadcrumb.textContent = 'Multi-Tenant Staff & Branch Credentials';
    scopePill.textContent = 'Platform Superadmin';
    content.innerHTML = '<div class="loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading credentials…</div>';

    try {
      const data = await api('/api/credentials');
      cachedCredentials = data.credentials || [];
    } catch (err) {
      content.innerHTML = '<div class="error-state">' + esc(err.message) + '</div>';
      return;
    }

    const total = cachedCredentials.length;
    const activeCount = cachedCredentials.filter(c => c.active && c.accountStatus === 'active').length;
    const suspendedCount = cachedCredentials.filter(c => !c.active || c.accountStatus !== 'active').length;
    const tempCount = cachedCredentials.filter(c => Boolean(c.passwordSecurity?.mustChangePassword)).length;
    const expiredCount = cachedCredentials.filter(c => Boolean(c.trial?.isExpired)).length;

    // Filter by tab
    let list = cachedCredentials;
    if (credFilter === 'active') {
      list = list.filter(c => c.active && c.accountStatus === 'active');
    } else if (credFilter === 'suspended') {
      list = list.filter(c => !c.active || c.accountStatus !== 'active');
    } else if (credFilter === 'temporary') {
      list = list.filter(c => Boolean(c.passwordSecurity?.mustChangePassword));
    } else if (credFilter === 'expired') {
      list = list.filter(c => Boolean(c.trial?.isExpired));
    }

    // Filter by search query
    if (currentSearchTerm) {
      list = list.filter(c =>
        (c.username || '').toLowerCase().includes(currentSearchTerm) ||
        (c.name || '').toLowerCase().includes(currentSearchTerm) ||
        (c.email || '').toLowerCase().includes(currentSearchTerm) ||
        (c.role || '').toLowerCase().includes(currentSearchTerm) ||
        (c.tenant?.name || '').toLowerCase().includes(currentSearchTerm) ||
        (c.tenant?.slug || '').toLowerCase().includes(currentSearchTerm) ||
        (c.branch?.name || '').toLowerCase().includes(currentSearchTerm) ||
        (c.branch?.code || '').toLowerCase().includes(currentSearchTerm)
      );
    }

    const statsHtml = '<div class="stat-grid">' +
      statCard('Total Staff Accounts', total, 'gold', 'All branch & tenant accounts') +
      statCard('Active Logins', activeCount, 'sage', 'Operational credentials') +
      statCard('Suspended Accounts', suspendedCount, 'ember', 'Logins disabled') +
      statCard('Temporary Passwords', tempCount, 'blue', 'Must change on login') +
      statCard('Expired Trials', expiredCount, 'danger', 'Tenants needing upgrade') +
      '</div>';

    const filterTabsHtml = '<div class="cred-filter-tabs">' +
      '<button class="cred-filter-tab ' + (credFilter === 'all' ? 'active' : '') + '" data-tab="all">' +
        'All <span class="badge-count">' + total + '</span>' +
      '</button>' +
      '<button class="cred-filter-tab ' + (credFilter === 'active' ? 'active' : '') + '" data-tab="active">' +
        '<i class="fa-solid fa-circle-check" style="color:var(--sage);font-size:11px;"></i> Active <span class="badge-count">' + activeCount + '</span>' +
      '</button>' +
      '<button class="cred-filter-tab ' + (credFilter === 'suspended' ? 'active' : '') + '" data-tab="suspended">' +
        '<i class="fa-solid fa-ban" style="color:var(--danger);font-size:11px;"></i> Suspended <span class="badge-count">' + suspendedCount + '</span>' +
      '</button>' +
      '<button class="cred-filter-tab ' + (credFilter === 'temporary' ? 'active' : '') + '" data-tab="temporary">' +
        '<i class="fa-solid fa-key" style="color:var(--gold);font-size:11px;"></i> Temporary Passwords <span class="badge-count">' + tempCount + '</span>' +
      '</button>' +
      '<button class="cred-filter-tab ' + (credFilter === 'expired' ? 'active' : '') + '" data-tab="expired">' +
        '<i class="fa-solid fa-clock" style="color:var(--danger);font-size:11px;"></i> Expired Trials <span class="badge-count">' + expiredCount + '</span>' +
      '</button>' +
    '</div>';

    const rowsHtml = list.length
      ? list.map(c => {
          const tenantDisplay = c.tenant
            ? '<div class="restaurant-meta"><strong>' + esc(c.tenant.name) + '</strong><br><small><a href="/r/' + encodeURIComponent(c.tenant.slug) + '" target="_blank" style="color:var(--gold);text-decoration:none;">/r/' + esc(c.tenant.slug) + '</a></small></div>'
            : '<span style="color:var(--text-dim);">Global Platform</span>';

          const branchDisplay = c.branch
            ? '<strong>' + esc(c.branch.name) + '</strong><br><span class="branch-code-pill">' + esc(c.branch.code) + '</span>'
            : '<em style="color:var(--text-dim);">All Branches</em>';

          const accountDisplay = '<strong>' + esc(c.username) + '</strong>' +
            (c.name && c.name !== c.username ? ' <small style="color:var(--text-muted);">(' + esc(c.name) + ')</small>' : '') +
            '<br><small style="color:var(--text-muted);">' + esc(c.email || 'No email') + '</small>' +
            '<div style="margin-top:4px;">' + roleBadge(c.role) + '</div>';

          const isAccountActive = c.active && c.accountStatus === 'active';
          const accountStatusBadge = isAccountActive
            ? '<span class="badge active"><i class="fa-solid fa-check"></i> Active</span>'
            : '<span class="badge suspended"><i class="fa-solid fa-ban"></i> Suspended</span>';

          let trialBadge = '';
          if (c.trial?.isExpired) {
            trialBadge = '<span class="renew-pill danger"><i class="fa-solid fa-clock"></i> Expired</span>';
          } else if (c.trial?.status === 'in_trial') {
            const left = c.trial.daysLeft != null ? c.trial.daysLeft + 'd left' : 'Active';
            trialBadge = '<span class="renew-pill warning"><i class="fa-solid fa-stopwatch"></i> Trial (' + left + ')</span>';
          } else if (c.trial?.status === 'active_paid') {
            trialBadge = '<span class="renew-pill ok"><i class="fa-solid fa-circle-check"></i> Paid (' + esc(c.trial.plan) + ')</span>';
          } else {
            trialBadge = '<span class="renew-pill ok"><i class="fa-solid fa-shield"></i> Active</span>';
          }

          const mustChange = Boolean(c.passwordSecurity?.mustChangePassword);
          const pwdBadge = mustChange
            ? '<span class="badge temporary" title="Must change password upon login"><i class="fa-solid fa-triangle-exclamation"></i> Temporary</span>'
            : '<span class="badge changed" title="Permanent password set"><i class="fa-solid fa-lock"></i> Changed</span>';

          const lastPwdHtml = '<div><strong>' + formatDateTime(c.passwordSecurity?.lastPasswordChange) + '</strong>' +
            '<span class="changed-by-tag">by ' + esc(c.passwordSecurity?.passwordChangedBy || (mustChange ? 'Superadmin' : 'Branch Admin')) + '</span></div>';

          const resetBtn = '<button type="button" class="btn-action-pill reset-pwd-btn" ' +
            'data-id="' + c._id + '" ' +
            'data-username="' + esc(c.username) + '" ' +
            'data-role="' + esc(c.role) + '" ' +
            'data-tenant="' + esc(c.tenant?.name || 'Platform') + '" ' +
            'data-branch="' + esc(c.branch?.name || 'All Branches') + '" ' +
            'title="Generate new temporary password">' +
            '<i class="fa-solid fa-key"></i> Reset' +
            '</button>';

          const toggleBtn = isAccountActive
            ? '<button type="button" class="btn-action-pill btn-danger-pill toggle-status-btn" ' +
                'data-id="' + c._id + '" ' +
                'data-action="suspend" ' +
                'data-username="' + esc(c.username) + '" ' +
                'title="Suspend account access">' +
                '<i class="fa-solid fa-ban"></i> Suspend' +
              '</button>'
            : '<button type="button" class="btn-action-pill btn-success-pill toggle-status-btn" ' +
                'data-id="' + c._id + '" ' +
                'data-action="reactivate" ' +
                'data-username="' + esc(c.username) + '" ' +
                'title="Reactivate account access">' +
                '<i class="fa-solid fa-check"></i> Reactivate' +
              '</button>';

          return '<tr>' +
            '<td>' + tenantDisplay + '</td>' +
            '<td>' + branchDisplay + '</td>' +
            '<td>' + accountDisplay + '</td>' +
            '<td>' + accountStatusBadge + '</td>' +
            '<td>' + trialBadge + '</td>' +
            '<td>' + pwdBadge + '</td>' +
            '<td>' + lastPwdHtml + '</td>' +
            '<td><div class="table-actions" style="gap:6px;">' + resetBtn + toggleBtn + '</div></td>' +
          '</tr>';
        }).join('')
      : '<tr><td colspan="8" class="empty-state">No credentials found for this filter.</td></tr>';

    content.innerHTML = statsHtml +
      filterTabsHtml +
      '<div class="panel">' +
        '<div class="panel-head">' +
          '<h3>Credentials &amp; Access Control (' + list.length + ')</h3>' +
          '<div class="panel-head-actions">' +
            '<button class="btn-primary-action" id="openAuditLogsBtn" style="background:linear-gradient(135deg,#38342F,#1D1B18);margin-right:8px;"><i class="fa-solid fa-shield-halved"></i> Audit Trail</button>' +
            '<button class="btn-primary-action" id="openCreateAdminBtn"><i class="fa-solid fa-user-plus"></i> Add Branch Admin</button>' +
          '</div>' +
        '</div>' +
        '<div class="table-scroll">' +
          '<table class="data-table">' +
            '<thead>' +
              '<tr>' +
                '<th>Restaurant</th>' +
                '<th>Branch</th>' +
                '<th>Admin Account</th>' +
                '<th>Account Status</th>' +
                '<th>Trial Status</th>' +
                '<th>Password Status</th>' +
                '<th>Last Password Change</th>' +
                '<th>Actions</th>' +
              '</tr>' +
            '</thead>' +
            '<tbody>' + rowsHtml + '</tbody>' +
          '</table>' +
        '</div>' +
      '</div>';

    // Hook up filter tab clicks
    content.querySelectorAll('.cred-filter-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        credFilter = btn.dataset.tab;
        renderCredentials();
      });
    });

    // Hook up Reset Password buttons
    content.querySelectorAll('.reset-pwd-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        resetTargetUserId.value = btn.dataset.id;
        resetTargetUsername.textContent = btn.dataset.username;
        resetTargetRole.textContent = btn.dataset.role;
        resetTargetTenant.textContent = btn.dataset.tenant;
        resetTargetBranch.textContent = btn.dataset.branch;

        resetPwdHeading.textContent = 'Reset Admin Password';
        resetPwdSub.textContent = 'Generate a new secure temporary password for this account.';
        resetPwdConfirmState.classList.remove('hidden');
        resetPwdDisplayState.classList.add('hidden');
        resetPwdError.hidden = true;
        resetPwdError.textContent = '';

        resetPasswordModal.classList.remove('hidden');
      });
    });

    // Hook up Suspend / Reactivate buttons
    content.querySelectorAll('.toggle-status-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const uId = btn.dataset.id;
        const act = btn.dataset.action;
        const uName = btn.dataset.username;

        const verb = act === 'suspend' ? 'suspend' : 'reactivate';
        const msg = 'Are you sure you want to ' + verb + ' the account for "@' + uName + '"?\n\n' +
          (act === 'suspend' ? 'The user will not be able to log in. No restaurant or branch data will be deleted.' : 'The user will regain login access.');

        if (!confirm(msg)) return;

        try {
          const res = await api('/api/credentials/toggle-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: uId, action: act, scope: 'user' })
          });
          showToast(res.message || ('Account ' + verb + 'ed successfully!'));
          renderCredentials();
        } catch (err) {
          showToast('Error: ' + err.message);
        }
      });
    });

    // Hook up Add Branch Admin opener
    const openCreateAdminBtn = document.getElementById('openCreateAdminBtn');
    if (openCreateAdminBtn) {
      openCreateAdminBtn.addEventListener('click', () => {
        openCreateAdminModalHandler();
      });
    }

    // Hook up Audit Trail opener
    const openAuditLogsBtn = document.getElementById('openAuditLogsBtn');
    if (openAuditLogsBtn) {
      openAuditLogsBtn.addEventListener('click', () => {
        openAuditLogsModalHandler();
      });
    }
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

  // ================================================================
  // CREATE BRANCH MODAL WORKFLOW
  // ================================================================
  async function openCreateBranchModalHandler(preselectedTenantId) {
    if (!createBranchModal) return;
    createBranchForm.reset();
    createBranchError.hidden = true;
    createBranchError.textContent = '';

    // Ensure cachedTenants is loaded
    if (!cachedTenants || cachedTenants.length === 0) {
      try {
        const data = await api('/api/tenants');
        cachedTenants = data.tenants || [];
      } catch (_) {}
    }

    if (branchTenantId) {
      branchTenantId.innerHTML = cachedTenants.map(t => {
        const isSelected = preselectedTenantId
          ? (t._id === preselectedTenantId)
          : (t.slug === 'ember-and-brew');
        return '<option value="' + t._id + '"' + (isSelected ? ' selected' : '') + '>' + esc(t.name) + ' (/r/' + esc(t.slug) + ')</option>';
      }).join('');
    }

    // Set defaults
    if (branchCountry) branchCountry.value = 'Pakistan';
    const def = COUNTRY_DEFAULTS['Pakistan'] || { currency: 'PKR', symbol: 'Rs', tz: 'Asia/Karachi', taxRate: 0.08 };
    if (branchCurrency) branchCurrency.value = def.currency;
    if (branchCurrencySymbol) branchCurrencySymbol.value = def.symbol;
    if (branchTimezone) branchTimezone.value = def.tz;
    if (branchTaxRate) branchTaxRate.value = def.taxRate;
    if (branchDeliveryRadiusKm) branchDeliveryRadiusKm.value = 5;

    createBranchModal.classList.remove('hidden');
    if (branchName) branchName.focus();
  }

  function closeCreateBranchModalHandler() {
    if (createBranchModal) createBranchModal.classList.add('hidden');
  }

  if (closeCreateBranchModal) closeCreateBranchModal.addEventListener('click', closeCreateBranchModalHandler);
  if (cancelCreateBranchBtn) cancelCreateBranchBtn.addEventListener('click', closeCreateBranchModalHandler);

  // Auto-generate branch code from branch name
  if (branchName && branchCode) {
    branchName.addEventListener('input', () => {
      const raw = branchName.value;
      branchCode.value = raw
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    });
  }

  // Country change auto-sets currency, symbol, tax rate, and timezone
  if (branchCountry) {
    branchCountry.addEventListener('change', () => {
      const selected = branchCountry.value;
      const def = COUNTRY_DEFAULTS[selected] || { currency: 'PKR', symbol: 'Rs', tz: 'Asia/Karachi', taxRate: 0.08, countryCode: 'PK' };
      if (branchCurrency) branchCurrency.value = def.currency;
      if (branchCurrencySymbol) branchCurrencySymbol.value = def.symbol;
      if (branchTimezone) branchTimezone.value = def.tz;
      if (branchTaxRate) branchTaxRate.value = def.taxRate;
    });
  }

  // Handle Create Branch Form Submit
  if (createBranchForm) {
    createBranchForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      createBranchError.hidden = true;
      createBranchError.textContent = '';

      const origText = submitCreateBranchBtn.innerHTML;
      submitCreateBranchBtn.disabled = true;
      submitCreateBranchBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creating Branch…';

      const selectedCountry = branchCountry.value;
      const def = COUNTRY_DEFAULTS[selectedCountry] || { countryCode: 'PK' };
      const zonesRaw = branchDeliveryZones ? branchDeliveryZones.value : '';
      const deliveryZones = zonesRaw.split(',').map(s => s.trim()).filter(Boolean);

      try {
        const payload = {
          tenantId: branchTenantId.value,
          name: branchName.value.trim(),
          code: branchCode.value.trim().toLowerCase(),
          city: branchCity.value.trim(),
          country: selectedCountry,
          countryCode: def.countryCode || 'PK',
          currency: branchCurrency.value.trim().toUpperCase(),
          currencySymbol: branchCurrencySymbol.value.trim(),
          timezone: branchTimezone.value.trim(),
          taxRate: parseFloat(branchTaxRate.value) || 0,
          address: branchAddress ? branchAddress.value.trim() : '',
          phone: branchPhone ? branchPhone.value.trim() : '',
          deliveryZones,
          deliveryRadiusKm: parseFloat(branchDeliveryRadiusKm ? branchDeliveryRadiusKm.value : 5) || 5,
          paymentMethods: ['Cash on delivery', 'Card']
        };

        const res = await api('/api/branches', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        closeCreateBranchModalHandler();
        showToast('Branch "' + (res.name || payload.name) + '" created successfully!');

        // Refresh views
        if (currentView === 'branches') renderBranches();
        else if (currentView === 'tenants') renderTenants();
        else renderCurrentView();
      } catch (err) {
        createBranchError.textContent = err.message;
        createBranchError.hidden = false;
      } finally {
        submitCreateBranchBtn.disabled = false;
        submitCreateBranchBtn.innerHTML = origText;
      }
    });
  }

  // ================================================================
  // RESET PASSWORD MODAL WORKFLOW
  // ================================================================
  function closeResetPasswordModalHandler() {
    if (resetPasswordModal) resetPasswordModal.classList.add('hidden');
  }

  if (cancelResetPwdBtn) cancelResetPwdBtn.addEventListener('click', closeResetPasswordModalHandler);
  if (closeResetDisplayBtn) {
    closeResetDisplayBtn.addEventListener('click', () => {
      closeResetPasswordModalHandler();
      if (currentView === 'credentials') renderCredentials();
    });
  }

  if (copyResetTempPwdBtn) {
    copyResetTempPwdBtn.addEventListener('click', async () => {
      const pwd = dispResetTempPwd.textContent;
      if (!pwd || pwd === '—') return;
      try {
        await navigator.clipboard.writeText(pwd);
        showToast('Temporary password copied to clipboard!');
      } catch (_) {
        showToast('Password: ' + pwd);
      }
    });
  }

  if (confirmResetPwdBtn) {
    confirmResetPwdBtn.addEventListener('click', async () => {
      const uId = resetTargetUserId.value;
      if (!uId) return;

      const origText = confirmResetPwdBtn.innerHTML;
      confirmResetPwdBtn.disabled = true;
      confirmResetPwdBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating…';
      resetPwdError.hidden = true;
      resetPwdError.textContent = '';

      try {
        const res = await api('/api/credentials/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: uId })
        });

        // Switch to display state
        resetPwdConfirmState.classList.add('hidden');
        resetPwdDisplayState.classList.remove('hidden');
        dispResetUsername.textContent = res.username || resetTargetUsername.textContent;
        dispResetTempPwd.textContent = res.tempPassword;

        showToast('Temporary password generated successfully!');
      } catch (err) {
        resetPwdError.textContent = err.message;
        resetPwdError.hidden = false;
      } finally {
        confirmResetPwdBtn.disabled = false;
        confirmResetPwdBtn.innerHTML = origText;
      }
    });
  }

  // ================================================================
  // CREATE BRANCH ADMIN MODAL WORKFLOW
  // ================================================================
  async function openCreateAdminModalHandler() {
    if (!createAdminModal) return;
    createAdminForm.reset();
    createAdminError.hidden = true;
    createAdminError.textContent = '';

    await populateAdminTenantSelect();
    createAdminModal.classList.remove('hidden');
    if (newAdminUsername) newAdminUsername.focus();
  }

  function closeCreateAdminModalHandler() {
    if (createAdminModal) createAdminModal.classList.add('hidden');
  }

  if (closeCreateAdminModal) closeCreateAdminModal.addEventListener('click', closeCreateAdminModalHandler);
  if (cancelCreateAdminBtn) cancelCreateAdminBtn.addEventListener('click', closeCreateAdminModalHandler);

  async function populateAdminTenantSelect() {
    if (!cachedTenants || !cachedTenants.length) {
      try {
        const data = await api('/api/tenants');
        cachedTenants = data.tenants || [];
      } catch (_) {}
    }

    if (newAdminTenantSelect) {
      newAdminTenantSelect.innerHTML = '<option value="">-- Select Restaurant Tenant --</option>' +
        cachedTenants.map(t => '<option value="' + t._id + '">' + esc(t.name) + ' (/r/' + esc(t.slug) + ')</option>').join('');
    }
    if (newAdminBranchSelect) {
      newAdminBranchSelect.innerHTML = '<option value="">-- All / Primary Branch --</option>';
    }
  }

  if (newAdminTenantSelect) {
    newAdminTenantSelect.addEventListener('change', async () => {
      const tId = newAdminTenantSelect.value;
      if (!tId) {
        newAdminBranchSelect.innerHTML = '<option value="">-- All / Primary Branch --</option>';
        return;
      }
      newAdminBranchSelect.innerHTML = '<option value="">Loading branches…</option>';
      try {
        const data = await api('/api/branches?tenantId=' + encodeURIComponent(tId));
        const branches = data.branches || [];
        if (!branches.length) {
          newAdminBranchSelect.innerHTML = '<option value="">-- Primary / Single Branch --</option>';
        } else {
          newAdminBranchSelect.innerHTML = '<option value="">-- All Branches / Global --</option>' +
            branches.map(b => '<option value="' + b._id + '">' + esc(b.name) + ' (' + esc(b.code) + ')' + '</option>').join('');
        }
      } catch (_) {
        newAdminBranchSelect.innerHTML = '<option value="">-- All / Primary Branch --</option>';
      }
    });
  }

  if (createAdminForm) {
    createAdminForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      createAdminError.hidden = true;
      createAdminError.textContent = '';

      const origText = submitCreateAdminBtn.innerHTML;
      submitCreateAdminBtn.disabled = true;
      submitCreateAdminBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creating Account…';

      try {
        const payload = {
          tenantId: newAdminTenantSelect.value,
          branchId: newAdminBranchSelect.value || null,
          username: newAdminUsername.value.trim(),
          name: newAdminName.value.trim(),
          email: newAdminEmail.value.trim(),
          role: newAdminRole.value
        };

        const res = await api('/api/credentials/create-admin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        closeCreateAdminModalHandler();

        // Show the temporary password using the reset display modal
        resetPwdHeading.textContent = 'Admin Account Created!';
        resetPwdSub.textContent = 'A secure temporary password has been generated for @' + esc(res.user.username) + '.';
        resetPwdConfirmState.classList.add('hidden');
        resetPwdDisplayState.classList.remove('hidden');
        dispResetUsername.textContent = res.user.username;
        dispResetTempPwd.textContent = res.tempPassword;
        resetPasswordModal.classList.remove('hidden');

        showToast('Admin account "@' + res.user.username + '" created successfully!');
      } catch (err) {
        createAdminError.textContent = err.message;
        createAdminError.hidden = false;
      } finally {
        submitCreateAdminBtn.disabled = false;
        submitCreateAdminBtn.innerHTML = origText;
      }
    });
  }

  // ================================================================
  // AUDIT LOGS MODAL WORKFLOW
  // ================================================================
  function openAuditLogsModalHandler() {
    if (!auditLogsModal) return;
    auditLogsModal.classList.remove('hidden');
    loadAuditLogs();
  }

  function closeAuditLogsModalHandler() {
    if (auditLogsModal) auditLogsModal.classList.add('hidden');
  }

  if (closeAuditLogsModal) closeAuditLogsModal.addEventListener('click', closeAuditLogsModalHandler);
  if (dismissAuditLogsBtn) dismissAuditLogsBtn.addEventListener('click', closeAuditLogsModalHandler);

  async function loadAuditLogs() {
    if (!auditLogsBody) return;
    auditLogsBody.innerHTML = '<tr><td colspan="6" class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i> Loading security audit trail…</td></tr>';

    try {
      const data = await api('/api/credentials/audit-logs');
      const logs = data.auditLogs || [];

      if (!logs.length) {
        auditLogsBody.innerHTML = '<tr><td colspan="6" class="empty-state">No audit trail records logged yet.</td></tr>';
        return;
      }

      auditLogsBody.innerHTML = logs.map(l => {
        const actionTag = (l.action || 'default').toLowerCase();
        const actionLabel = (l.action || '').replace(/_/g, ' ');

        const restaurantBranch = [l.tenantName, l.branchName].filter(Boolean).join(' / ') || 'Platform Root';
        const actor = esc(l.performedBy || 'Superadmin') +
          '<br><small style="color:var(--text-muted);">' + esc(l.performedByRole || 'superadmin') + '</small>';

        return '<tr>' +
          '<td><small style="white-space:nowrap;color:var(--text-muted);">' + formatDateTime(l.createdAt) + '</small></td>' +
          '<td><span class="audit-badge ' + esc(actionTag) + '">' + esc(actionLabel) + '</span></td>' +
          '<td><code>@' + esc(l.targetUsername || '—') + '</code></td>' +
          '<td><strong>' + esc(restaurantBranch) + '</strong></td>' +
          '<td>' + actor + '</td>' +
          '<td><small style="line-height:1.4;display:block;">' + esc(l.details || '—') + '</small></td>' +
        '</tr>';
      }).join('');
    } catch (err) {
      auditLogsBody.innerHTML = '<tr><td colspan="6" class="empty-state" style="color:var(--danger);"><i class="fa-solid fa-triangle-exclamation"></i> ' + esc(err.message) + '</td></tr>';
    }
  }

  // Initial render
  renderTenants();
})();
