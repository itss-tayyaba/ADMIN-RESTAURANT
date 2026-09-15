(function () {
  const token = localStorage.getItem('eb_admin_token');
  const user = JSON.parse(localStorage.getItem('eb_admin_user') || 'null');

  if (!token || !user || user.role !== 'superadmin') {
    window.location.href = '/admin/login';
    return;
  }

  const content = document.getElementById('content');
  const pageTitle = document.getElementById('pageTitle');
  const breadcrumb = document.getElementById('breadcrumb');
  const scopePill = document.getElementById('scopePill');
  const userNameLabel = document.getElementById('userNameLabel');
  const userAvatar = document.getElementById('userAvatar');
  const tenantFilterSelect = document.getElementById('tenantFilterSelect');
  const superModal = document.getElementById('superModal');
  const superModalContent = document.getElementById('superModalContent');

  userNameLabel.textContent = user.username || 'Superadmin';
  userAvatar.textContent = (user.username || 'S').charAt(0).toUpperCase();

  let currentView = 'tenants';
  let selectedTenantId = '';
  let cachedTenants = [];

  document.getElementById('logoutBtn').addEventListener('click', () => {
    localStorage.removeItem('eb_admin_token');
    localStorage.removeItem('eb_admin_user');
    window.location.href = '/admin/login';
  });

  const money = (n, symbol) => (symbol || 'Rs ') + Number(n || 0).toFixed(2);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

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

  function statCard(label, value, cls) {
    return '<div class="stat-card ' + (cls || '') + '"><div class="label">' + esc(label) + '</div><div class="value">' + value + '</div></div>';
  }

  function badge(status) {
    return '<span class="badge ' + esc(status) + '">' + esc((status || '').replace(/-/g, ' ')) + '</span>';
  }

  function closeModal() {
    superModal.classList.add('hidden');
    superModalContent.innerHTML = '';
  }
  superModal.addEventListener('click', (e) => {
    if (e.target === superModal) closeModal();
  });

  // Nav item switching
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentView = btn.dataset.view;
      if (currentView === 'tenants') renderTenants();
      else if (currentView === 'branches') renderBranches();
      else if (currentView === 'analytics') renderAnalytics();
    });
  });

  // Load tenant filter options
  async function loadTenantFilter() {
    try {
      const data = await api('/api/tenants');
      cachedTenants = data.tenants || [];
      tenantFilterSelect.innerHTML = '<option value="">🌐 All Restaurants (Global)</option>' +
        cachedTenants.map(t => '<option value="' + t._id + '" ' + (selectedTenantId === t._id ? 'selected' : '') + '>' + esc(t.name) + '</option>').join('');
    } catch (_) {}
  }

  tenantFilterSelect.addEventListener('change', (e) => {
    selectedTenantId = e.target.value;
    if (currentView === 'tenants') renderTenants();
    else if (currentView === 'branches') renderBranches();
    else if (currentView === 'analytics') renderAnalytics();
  });

  // ================================================================
  // 1. TENANTS VIEW (Restaurant Brands Management)
  // ================================================================
  async function renderTenants() {
    pageTitle.textContent = 'Restaurant Brands (Tenants)';
    breadcrumb.textContent = 'SaaS Multi-Tenant Management';
    scopePill.textContent = selectedTenantId ? 'Filtered by Tenant' : 'Platform Superadmin';
    content.innerHTML = '<div class="loading">Loading restaurant brands…</div>';

    let data;
    try {
      data = await api('/api/tenants');
      cachedTenants = data.tenants || [];
    } catch (err) {
      content.innerHTML = '<div class="error-state">' + esc(err.message) + '</div>';
      return;
    }

    let tenants = cachedTenants;
    if (selectedTenantId) {
      tenants = tenants.filter(t => t._id === selectedTenantId);
    }

    const totalBranches = tenants.reduce((s, t) => s + (t.stats?.branchCount || 0), 0);
    const totalOrders = tenants.reduce((s, t) => s + (t.stats?.orderCount || 0), 0);
    const totalStaff = tenants.reduce((s, t) => s + (t.stats?.adminCount || 0), 0);

    const statsHtml = '<div class="stat-grid">' +
      statCard('Total Brands', tenants.length, 'gold') +
      statCard('Total Branches', totalBranches, 'ember') +
      statCard('Total Orders', totalOrders, 'sage') +
      statCard('Active Staff', totalStaff, 'gold') +
      '</div>';

    const cardsHtml = tenants.length
      ? tenants.map(t => {
          const themeColor = t.theme?.primaryColor || '#D4A853';
          return '<div class="tenant-card">' +
            '<div class="tenant-card-header">' +
              '<img src="' + esc(t.logo || '/images/app-logo.png') + '" alt="' + esc(t.name) + '" class="tenant-logo" style="border-color:' + themeColor + ';">' +
              '<div class="tenant-title-wrap">' +
                '<h3 class="tenant-title">' + esc(t.name) + '</h3>' +
                '<span class="tenant-slug-badge">/r/' + esc(t.slug) + '</span>' +
              '</div>' +
              '<span class="badge ' + (t.status === 'active' ? 'ready' : 'cancelled') + '">' + esc(t.status) + '</span>' +
            '</div>' +
            '<p style="font-size:12.5px;color:var(--text-muted);margin:0;line-height:1.4;">' +
              esc(t.tagline || t.description || 'Artisan Culinary & Kitchen') +
            '</p>' +
            '<div class="tenant-stats-row">' +
              '<div class="tenant-stat-item"><strong>' + (t.stats?.branchCount || 0) + '</strong><span>Branches</span></div>' +
              '<div class="tenant-stat-item"><strong>' + (t.stats?.menuCount || 0) + '</strong><span>Dishes</span></div>' +
              '<div class="tenant-stat-item"><strong>' + (t.stats?.orderCount || 0) + '</strong><span>Orders</span></div>' +
            '</div>' +
            '<div class="tenant-actions">' +
              '<a href="/r/' + encodeURIComponent(t.slug) + '" target="_blank" class="btn-brand-outline" title="Open Customer Web App"><i class="fa-solid fa-arrow-up-right-from-square"></i> Storefront</a>' +
              '<button class="btn-brand-outline view-branches-btn" data-tenant-id="' + t._id + '"><i class="fa-solid fa-map-pin"></i> Branches</button>' +
              '<button class="btn-brand-primary edit-tenant-btn" data-tenant-id="' + t._id + '"><i class="fa-solid fa-pen-to-square"></i> Manage</button>' +
            '</div>' +
          '</div>';
        }).join('')
      : '<div class="empty-state">No restaurant brands found.</div>';

    content.innerHTML = statsHtml +
      '<div class="panel">' +
        '<div class="panel-head">' +
          '<h3>Registered Restaurant Brands (' + tenants.length + ')</h3>' +
          '<button class="btn-ghost" id="openAddTenantModal"><i class="fa-solid fa-plus"></i> Add Restaurant Brand</button>' +
        '</div>' +
        '<div class="panel-body">' +
          '<div class="tenant-grid">' + cardsHtml + '</div>' +
        '</div>' +
      '</div>';

    document.getElementById('openAddTenantModal').addEventListener('click', openCreateTenantModal);
    
    content.querySelectorAll('.view-branches-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedTenantId = btn.dataset.tenantId;
        tenantFilterSelect.value = selectedTenantId;
        document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === 'branches'));
        currentView = 'branches';
        renderBranches();
      });
    });

    content.querySelectorAll('.edit-tenant-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tenant = cachedTenants.find(t => t._id === btn.dataset.tenantId);
        if (tenant) openEditTenantModal(tenant);
      });
    });
  }

  // Create Tenant Modal
  function openCreateTenantModal() {
    superModalContent.innerHTML = '<div class="modal-head">' +
        '<h2><i class="fa-solid fa-store" style="color:var(--gold);"></i> Onboard New Restaurant Brand</h2>' +
        '<button class="modal-close-btn" onclick="document.getElementById(\\'superModal\\').classList.add(\\'hidden\\')">&times;</button>' +
      '</div>' +
      '<form id="createTenantForm">' +
        '<div class="modal-grid-2">' +
          '<label class="input-label">Brand Name *<input name="name" id="newTenantName" placeholder="e.g. Bella Italia" required></label>' +
          '<label class="input-label">Unique Brand Slug *<input name="slug" id="newTenantSlug" placeholder="e.g. bella-italia" required></label>' +
        '</div>' +
        '<label class="input-label">Tagline / Slogan<input name="tagline" placeholder="e.g. Authentic Wood-Fired Pizza & Pasta"></label>' +
        '<div class="modal-grid-2">' +
          '<label class="input-label">Owner Name<input name="ownerName" placeholder="e.g. Marco Rossi"></label>' +
          '<label class="input-label">Owner Email<input name="ownerEmail" type="email" placeholder="owner@restaurant.com"></label>' +
        '</div>' +
        '<div class="modal-grid-2">' +
          '<label class="input-label">Currency (ISO)<input name="currency" placeholder="PKR / USD / GBP" value="PKR"></label>' +
          '<label class="input-label">Currency Symbol<input name="currencySymbol" placeholder="Rs / $ / £" value="Rs"></label>' +
        '</div>' +
        '<div class="modal-grid-2">' +
          '<label class="input-label">Primary Brand Color<input name="primaryColor" type="color" value="#D4A853" style="height:42px;padding:2px;cursor:pointer;"></label>' +
          '<label class="input-label">Logo URL / Path<input name="logo" placeholder="/images/app-logo.png" value="/images/app-logo.png"></label>' +
        '</div>' +
        '<div style="border-top:1px solid var(--border);margin:14px 0 10px;padding-top:12px;">' +
          '<h4 style="margin:0 0 10px;font-size:13px;color:var(--ink);">Initial Branch &amp; Admin User (Optional)</h4>' +
          '<div class="modal-grid-2">' +
            '<label class="input-label">Initial Branch Name<input name="initialBranchName" placeholder="e.g. Bella Italia — Main"></label>' +
            '<label class="input-label">Branch City<input name="initialBranchCity" placeholder="e.g. Lahore / London" value="Lahore"></label>' +
          '</div>' +
          '<div class="modal-grid-2">' +
            '<label class="input-label">Admin Login Username<input name="adminUsername" placeholder="e.g. bella_admin"></label>' +
            '<label class="input-label">Admin Password<input name="adminPassword" type="password" minlength="6" placeholder="min. 6 characters"></label>' +
          '</div>' +
        '</div>' +
        '<p id="tenantModalError" style="color:var(--danger);font-size:12px;margin:8px 0;" hidden></p>' +
        '<button type="submit" class="btn-brand-primary" style="width:100%;padding:12px;margin-top:6px;"><i class="fa-solid fa-plus"></i> Create Restaurant Brand</button>' +
      '</form>';

    superModal.classList.remove('hidden');

    const nameInput = document.getElementById('newTenantName');
    const slugInput = document.getElementById('newTenantSlug');
    nameInput.addEventListener('input', () => {
      slugInput.value = nameInput.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    });

    document.getElementById('createTenantForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const errEl = document.getElementById('tenantModalError');
      errEl.hidden = true;
      const formData = new FormData(e.target);
      const values = Object.fromEntries(formData.entries());

      try {
        await api('/api/tenants', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...values,
            theme: { primaryColor: values.primaryColor }
          })
        });
        closeModal();
        await loadTenantFilter();
        renderTenants();
      } catch (err) {
        errEl.textContent = err.message;
        errEl.hidden = false;
      }
    });
  }

  // Edit Tenant Modal
  function openEditTenantModal(tenant) {
    superModalContent.innerHTML = '<div class="modal-head">' +
        '<h2>Manage: ' + esc(tenant.name) + '</h2>' +
        '<button class="modal-close-btn" onclick="document.getElementById(\\'superModal\\').classList.add(\\'hidden\\')">&times;</button>' +
      '</div>' +
      '<form id="editTenantForm">' +
        '<label class="input-label">Brand Name *<input name="name" value="' + esc(tenant.name) + '" required></label>' +
        '<label class="input-label">Tagline<input name="tagline" value="' + esc(tenant.tagline || '') + '"></label>' +
        '<div class="modal-grid-2">' +
          '<label class="input-label">Owner Name<input name="ownerName" value="' + esc(tenant.ownerName || '') + '"></label>' +
          '<label class="input-label">Owner Email<input name="ownerEmail" value="' + esc(tenant.ownerEmail || '') + '"></label>' +
        '</div>' +
        '<div class="modal-grid-2">' +
          '<label class="input-label">Primary Brand Color<input name="primaryColor" type="color" value="' + (tenant.theme?.primaryColor || '#D4A853') + '" style="height:42px;padding:2px;cursor:pointer;"></label>' +
          '<label class="input-label">Status<select name="status">' +
            '<option value="active" ' + (tenant.status === 'active' ? 'selected' : '') + '>Active</option>' +
            '<option value="trial" ' + (tenant.status === 'trial' ? 'selected' : '') + '>Trial</option>' +
            '<option value="suspended" ' + (tenant.status === 'suspended' ? 'selected' : '') + '>Suspended</option>' +
          '</select></label>' +
        '</div>' +
        '<p id="editModalError" style="color:var(--danger);font-size:12px;margin:8px 0;" hidden></p>' +
        '<button type="submit" class="btn-brand-primary" style="width:100%;padding:12px;margin-top:8px;">Save Changes</button>' +
      '</form>';

    superModal.classList.remove('hidden');

    document.getElementById('editTenantForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const errEl = document.getElementById('editModalError');
      errEl.hidden = true;
      const values = Object.fromEntries(new FormData(e.target).entries());

      try {
        await api('/api/tenants/' + tenant._id, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: values.name,
            tagline: values.tagline,
            ownerName: values.ownerName,
            ownerEmail: values.ownerEmail,
            status: values.status,
            theme: { ...(tenant.theme || {}), primaryColor: values.primaryColor }
          })
        });
        closeModal();
        await loadTenantFilter();
        renderTenants();
      } catch (err) {
        errEl.textContent = err.message;
        errEl.hidden = false;
      }
    });
  }

  // ================================================================
  // 2. BRANCHES VIEW
  // ================================================================
  async function renderBranches() {
    pageTitle.textContent = 'Branches';
    breadcrumb.textContent = selectedTenantId ? 'Filtered by selected restaurant brand' : 'All platform branches';
    scopePill.textContent = selectedTenantId ? 'Scoped Tenant' : 'All Branches';
    content.innerHTML = '<div class="loading">Loading branches…</div>';

    let data;
    try {
      const query = selectedTenantId ? '?tenantId=' + selectedTenantId : '';
      data = await api('/api/branches' + query);
    } catch (err) {
      content.innerHTML = '<div class="error-state">' + esc(err.message) + '</div>';
      return;
    }

    const { branches, combined } = data;

    const statsHtml = '<div class="stat-grid">' +
      statCard('Total Orders', combined?.totalOrders || 0, 'ember') +
      statCard("Today's Orders", combined?.todayOrders || 0, 'sage') +
      statCard('Pending Orders', combined?.pendingOrders || 0, 'gold') +
      statCard('Active Riders', combined?.activeRiders || 0, 'ember') +
      '</div>';

    const cardsHtml = (branches || []).length
      ? branches.map(b => '<div class="branch-card" data-id="' + b._id + '">' +
          '<div class="branch-card-head">' +
            '<h3>' + esc(b.name) + '</h3>' +
            '<span class="branch-badge ' + (b.isActive ? '' : 'inactive') + '">' + (b.isActive ? 'Active' : 'Offline') + '</span>' +
          '</div>' +
          '<p class="loc">' + esc(b.city) + ', ' + esc(b.country) + ' · ' + esc(b.currencySymbol || '') + esc(b.currency || '') + (b.tenant?.name ? ' · ' + esc(b.tenant.name) : '') + '</p>' +
          '<div class="branch-mini-stats">' +
            '<div><strong>' + money(b.stats?.totalRevenue, b.currencySymbol) + '</strong>Total revenue</div>' +
            '<div><strong>' + (b.stats?.todayOrders || 0) + '</strong>Orders today</div>' +
            '<div><strong>' + (b.stats?.pendingOrders || 0) + '</strong>Pending now</div>' +
            '<div><strong>' + (b.stats?.activeRiders || 0) + '</strong>Active riders</div>' +
          '</div>' +
          '<div class="branch-card-foot">View branch details →</div>' +
        '</div>').join('')
      : '<div class="empty-state">No branches found.</div>';

    content.innerHTML = statsHtml +
      '<div class="panel">' +
        '<div class="panel-head">' +
          '<h3>Branches (' + (branches || []).length + ')</h3>' +
          '<button class="btn-ghost" id="showBranchForm">+ Add Branch</button>' +
        '</div>' +
        '<div class="panel-body">' +
          '<form id="branchForm" class="setup-form hidden">' +
            '<select name="tenantId" required>' +
              '<option value="">Select Restaurant Brand *</option>' +
              cachedTenants.map(t => '<option value="' + t._id + '" ' + (selectedTenantId === t._id ? 'selected' : '') + '>' + esc(t.name) + '</option>').join('') +
            '</select>' +
            '<input name="name" placeholder="Branch name (e.g. London West End)" required>' +
            '<input name="code" placeholder="Unique code (e.g. uk-westend)" required>' +
            '<input name="country" placeholder="Country" required><input name="countryCode" placeholder="Country code (GB)" maxlength="2" required>' +
            '<input name="city" placeholder="City" required><input name="currency" placeholder="Currency (GBP)" maxlength="3" required>' +
            '<input name="currencySymbol" placeholder="Symbol (£)" required><input name="timezone" placeholder="Timezone (Europe/London)" required>' +
            '<input name="taxRate" type="number" min="0" max="1" step="0.01" placeholder="Tax rate (0.08)" value="0.08">' +
            '<button class="btn-ghost" type="submit">Create branch</button><p class="form-note" id="branchFormNote"></p>' +
          '</form>' +
          '<div class="branch-grid">' + cardsHtml + '</div>' +
        '</div>' +
      '</div>';

    content.querySelectorAll('.branch-card').forEach(card => {
      card.addEventListener('click', () => renderBranchDetail(card.dataset.id));
    });
    document.getElementById('showBranchForm').addEventListener('click', () => document.getElementById('branchForm').classList.toggle('hidden'));
    document.getElementById('branchForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const note = document.getElementById('branchFormNote');
      const values = Object.fromEntries(new FormData(form).entries());
      try {
        await api('/api/branches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
        renderBranches();
      } catch (err) { note.textContent = err.message; }
    });
  }

  // Branch detail view
  async function renderBranchDetail(branchId) {
    content.innerHTML = '<div class="loading">Loading branch…</div>';
    breadcrumb.innerHTML = '<button id="backBtn">← All Branches</button>';

    let branch, stats, riders, orders, staff;
    try {
      [branch, stats, riders, orders, staff] = await Promise.all([
        api('/api/branches/' + branchId),
        api('/api/orders/stats/summary?branchId=' + branchId),
        api('/api/delivery/riders?branchId=' + branchId),
        api('/api/orders?branchId=' + branchId),
        api('/api/branches/' + branchId + '/staff')
      ]);
    } catch (err) {
      content.innerHTML = '<div class="error-state">' + esc(err.message) + '</div>';
      return;
    }

    pageTitle.textContent = branch.name;
    scopePill.textContent = 'Scoped — ' + branch.name;
    document.getElementById('backBtn').addEventListener('click', renderBranches);

    const sym = branch.currencySymbol || 'Rs ';

    const statsHtml = '<div class="stat-grid">' +
      statCard('Revenue', money(stats.totalRevenue, sym), 'gold') +
      statCard('Total Orders', stats.totalOrders, 'ember') +
      statCard("Today's Orders", stats.todayOrders, 'sage') +
      statCard('Pending Orders', stats.pendingCount, 'gold') +
      '</div>';

    const recentOrders = orders.slice(0, 15);
    content.innerHTML = statsHtml +
      '<div class="panel">' +
        '<div class="panel-head">' +
          '<h3>Public Branch Settings</h3>' +
          '<a class="btn-ghost" href="/order/' + encodeURIComponent(branch.code) + '" target="_blank" style="text-decoration:none;">Open customer page →</a>' +
        '</div>' +
        '<div class="panel-body">' +
          '<p class="form-note">Status: <strong>' + (branch.isActive ? 'Active' : 'Inactive') + '</strong></p>' +
        '</div>' +
      '</div>' +
      '<div class="panel">' +
        '<div class="panel-head"><h3>Branch Team</h3></div>' +
        '<div class="panel-body">' +
          '<div class="table-scroll"><table><thead><tr><th>Role</th><th>Name</th><th>Username</th></tr></thead><tbody>' +
            (staff.length ? staff.map(member => '<tr><td>' + esc(member.role) + '</td><td>' + esc(member.name || '—') + '</td><td>' + esc(member.username) + '</td></tr>').join('') : '<tr><td colspan="3" class="empty-state">No staff assigned yet.</td></tr>') +
          '</tbody></table></div>' +
        '</div>' +
      '</div>' +
      '<div class="panel">' +
        '<div class="panel-head"><h3>Recent Orders</h3></div>' +
        '<div class="panel-body">' +
          '<div class="table-scroll"><table>' +
            '<thead><tr><th>Order</th><th>Customer</th><th>Type</th><th>Total</th><th>Status</th></tr></thead>' +
            '<tbody>' +
              (recentOrders.length ? recentOrders.map(o => '<tr>' +
                  '<td>' + esc(o.orderNumber) + '</td>' +
                  '<td>' + esc(o.customerName) + '</td>' +
                  '<td>' + esc(o.orderType) + '</td>' +
                  '<td>' + money(o.total, sym) + '</td>' +
                  '<td>' + badge(o.status) + '</td>' +
                '</tr>').join('') : '<tr><td colspan="5" class="empty-state">No orders yet for this branch.</td></tr>') +
            '</tbody>' +
          '</table></div>' +
        '</div>' +
      '</div>';
  }

  // ================================================================
  // 3. ANALYTICS VIEW
  // ================================================================
  async function renderAnalytics() {
    pageTitle.textContent = 'Platform Analytics & SaaS Health';
    breadcrumb.textContent = 'Cross-Tenant Intelligence';
    scopePill.textContent = 'SaaS Global';
    content.innerHTML = '<div class="loading">Loading analytics…</div>';

    let data;
    try {
      data = await api('/api/tenants');
      cachedTenants = data.tenants || [];
    } catch (err) {
      content.innerHTML = '<div class="error-state">' + esc(err.message) + '</div>';
      return;
    }

    const totalBrands = cachedTenants.length;
    const totalBranches = cachedTenants.reduce((s, t) => s + (t.stats?.branchCount || 0), 0);
    const totalOrders = cachedTenants.reduce((s, t) => s + (t.stats?.orderCount || 0), 0);
    const totalStaff = cachedTenants.reduce((s, t) => s + (t.stats?.adminCount || 0), 0);

    content.innerHTML = '<div class="stat-grid">' +
        statCard('Total Restaurants', totalBrands, 'gold') +
        statCard('Total Branches', totalBranches, 'ember') +
        statCard('All Orders Processed', totalOrders, 'sage') +
        statCard('Platform Staff', totalStaff, 'gold') +
      '</div>' +
      '<div class="panel">' +
        '<div class="panel-head"><h3>Multi-Tenant Architecture Status</h3></div>' +
        '<div class="panel-body">' +
          '<p style="font-size:14px;line-height:1.6;color:var(--text);">' +
            '✅ <strong>Database Isolation</strong>: All collections (Branches, Menus, Orders, Staff, Tables, Reservations) are strictly partitioned by <code>tenantId</code>.<br>' +
            '✅ <strong>Custom Branding</strong>: Each tenant can define its own brand colors, logos, slogans, and currency.<br>' +
            '✅ <strong>Seamless Routing</strong>: Each tenant has dedicated storefront routing via <code>/r/:tenantSlug</code> or query parameter <code>?tenant=:tenantSlug</code>.' +
          '</p>' +
        '</div>' +
      '</div>';
  }

  // Initial load
  loadTenantFilter();
  renderTenants();
})();
