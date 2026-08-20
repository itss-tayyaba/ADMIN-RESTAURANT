(function () {
  const token = localStorage.getItem('eb_admin_token');
  const user = JSON.parse(localStorage.getItem('eb_admin_user') || 'null');

  // Same trust model as admin.js/kitchen.js/delivery.js: no valid token,
  // or wrong role, bounce to the shared login page.
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

  userNameLabel.textContent = user.username || 'Superadmin';
  userAvatar.textContent = (user.username || 'S').charAt(0).toUpperCase();

  document.getElementById('logoutBtn').addEventListener('click', () => {
    localStorage.removeItem('eb_admin_token');
    localStorage.removeItem('eb_admin_user');
    window.location.href = '/admin/login';
  });

  // Every branch has its own currencySymbol (e.g. "Rs" for PKR, "£" for
  // GBP) — money() always needs that symbol passed in rather than assuming
  // "$", since branches don't share a currency.
  const money = (n, symbol) => `${symbol || ''}${Number(n || 0).toFixed(2)}`;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  async function api(path) {
    const res = await fetch(path, { headers: { Authorization: 'Bearer ' + token } });
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
    return `<div class="stat-card ${cls || ''}"><div class="label">${esc(label)}</div><div class="value">${value}</div></div>`;
  }

  function badge(status) {
    return `<span class="badge ${esc(status)}">${esc((status || '').replace(/-/g, ' '))}</span>`;
  }

  // ---------------- Overview: all branches ----------------
  async function renderOverview() {
    pageTitle.textContent = 'All Branches';
    breadcrumb.textContent = '';
    scopePill.textContent = 'Combined — all branches';
    content.innerHTML = '<div class="loading">Loading branches…</div>';

    let data;
    try {
      data = await api('/api/branches');
    } catch (err) {
      content.innerHTML = `<div class="error-state">${esc(err.message)}</div>`;
      return;
    }

    const { branches, combined } = data;

    // No "Combined Revenue" card — branches can run in different
    // currencies, so a single summed revenue number would be meaningless.
    // Order/rider counts are currency-agnostic and stay combined.
    const statsHtml = `
      <div class="stat-grid">
        ${statCard('Total Orders', combined.totalOrders, 'ember')}
        ${statCard("Today's Orders", combined.todayOrders, 'sage')}
        ${statCard('Pending Orders', combined.pendingOrders, 'gold')}
        ${statCard('Active Riders', combined.activeRiders, 'ember')}
      </div>`;

    const cardsHtml = branches.length
      ? branches.map(b => `
        <div class="branch-card" data-id="${b._id}">
          <div class="branch-card-head">
            <h3>${esc(b.name)}</h3>
            <span class="branch-badge ${b.isActive ? '' : 'inactive'}">${b.isActive ? 'Active' : 'Offline'}</span>
          </div>
          <p class="loc">${esc(b.city)}, ${esc(b.country)} · ${esc(b.currencySymbol || '')}${esc(b.currency || '')}</p>
          <div class="branch-mini-stats">
            <div><strong>${money(b.stats.totalRevenue, b.currencySymbol)}</strong>Total revenue</div>
            <div><strong>${b.stats.todayOrders}</strong>Orders today</div>
            <div><strong>${b.stats.pendingOrders}</strong>Pending now</div>
            <div><strong>${b.stats.activeRiders}</strong>Active riders</div>
          </div>
          <div class="branch-card-foot">View branch →</div>
        </div>
      `).join('')
      : '<div class="empty-state">No branches yet.</div>';

    content.innerHTML = `
      ${statsHtml}
      <div class="panel">
        <div class="panel-head"><h3>Branches (${branches.length})</h3></div>
        <div class="panel-body">
          <div class="branch-grid">${cardsHtml}</div>
        </div>
      </div>
    `;

    content.querySelectorAll('.branch-card').forEach(card => {
      card.addEventListener('click', () => renderBranchDetail(card.dataset.id));
    });
  }

  // ---------------- Branch detail ----------------
  async function renderBranchDetail(branchId) {
    content.innerHTML = '<div class="loading">Loading branch…</div>';
    breadcrumb.innerHTML = `<button id="backBtn">← All Branches</button>`;

    let branch, stats, riders, orders;
    try {
      [branch, stats, riders, orders] = await Promise.all([
        api(`/api/branches/${branchId}`),
        api(`/api/orders/stats/summary?branchId=${branchId}`),
        api(`/api/delivery/riders?branchId=${branchId}`),
        api(`/api/orders?branchId=${branchId}`)
      ]);
    } catch (err) {
      content.innerHTML = `<div class="error-state">${esc(err.message)}</div>`;
      return;
    }

    pageTitle.textContent = branch.name;
    scopePill.textContent = `Scoped — ${branch.name}`;
    document.getElementById('backBtn').addEventListener('click', renderOverview);

    // This branch's own currency — every money figure below is in it.
    const sym = branch.currencySymbol || '';

    const statsHtml = `
      <div class="stat-grid">
        ${statCard('Revenue', money(stats.totalRevenue, sym), 'gold')}
        ${statCard('Total Orders', stats.totalOrders, 'ember')}
        ${statCard("Today's Orders", stats.todayOrders, 'sage')}
        ${statCard('Pending Orders', stats.pendingCount, 'gold')}
      </div>`;

    const popularHtml = (stats.popularDishes || []).length
      ? `<div class="panel">
          <div class="panel-head"><h3>Popular Dishes</h3></div>
          <div class="panel-body">
            <div class="table-scroll"><table>
              <thead><tr><th>Dish</th><th>Qty Sold</th></tr></thead>
              <tbody>${stats.popularDishes.map(d => `<tr><td>${esc(d.name)}</td><td>${d.qty}</td></tr>`).join('')}</tbody>
            </table></div>
          </div>
        </div>`
      : '';

    const ridersHtml = `
      <div class="panel">
        <div class="panel-head">
          <h3>Riders (${riders.riders.length})</h3>
          <a class="btn-ghost" href="/admin?branchId=${encodeURIComponent(branchId)}" style="text-decoration:none;">Open full admin view →</a>
        </div>
        <div class="panel-body">
          <div class="table-scroll"><table>
            <thead><tr><th>Name</th><th>Region</th><th>Active Orders</th><th>Status</th></tr></thead>
            <tbody>
              ${riders.riders.length ? riders.riders.map(r => `
                <tr>
                  <td>${esc(r.name || r.username)}</td>
                  <td>${esc(r.region || '—')}</td>
                  <td>${r.activeOrders}/${riders.maxActiveOrders}</td>
                  <td>${r.active ? '🟢 Active' : '⚪ Inactive'}</td>
                </tr>`).join('') : '<tr><td colspan="4" class="empty-state">No riders in this branch yet.</td></tr>'}
            </tbody>
          </table></div>
        </div>
      </div>`;

    const recentOrders = orders.slice(0, 15);
    const ordersHtml = `
      <div class="panel">
        <div class="panel-head"><h3>Recent Orders</h3></div>
        <div class="panel-body">
          <div class="table-scroll"><table>
            <thead><tr><th>Order</th><th>Customer</th><th>Type</th><th>Total</th><th>Status</th></tr></thead>
            <tbody>
              ${recentOrders.length ? recentOrders.map(o => `
                <tr>
                  <td>${esc(o.orderNumber)}</td>
                  <td>${esc(o.customerName)}</td>
                  <td>${esc(o.orderType)}</td>
                  <td>${money(o.total, sym)}</td>
                  <td>${badge(o.status)}</td>
                </tr>`).join('') : '<tr><td colspan="5" class="empty-state">No orders yet for this branch.</td></tr>'}
            </tbody>
          </table></div>
        </div>
      </div>`;

    content.innerHTML = `
      ${statsHtml}
      ${popularHtml}
      ${ridersHtml}
      ${ordersHtml}
    `;
  }

  renderOverview();
})();