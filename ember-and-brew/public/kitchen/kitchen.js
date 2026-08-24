// =====================================
// API
// =====================================

const API = "/api/kitchen";
const MENU_API = "/api/menu";

const token = localStorage.getItem("eb_admin_token");
const user = JSON.parse(localStorage.getItem("eb_admin_user") || "null");

// =====================================
// Check Login & Role
// =====================================

if (!token) {
  window.location.href = "/admin/login.html";
} else if (!user || user.role !== "chef") {
  if (user && user.role === "admin") window.location.href = "/admin";
  else if (user && user.role === "delivery") window.location.href = "/delivery";
  else window.location.href = "/admin/login.html";
}

// =====================================
// Elements
// =====================================

const $ = sel => document.querySelector(sel);
const grid = $('#order-grid');
const emptyState = $('#empty-state');
const logoutBtn = document.getElementById("logoutBtn");
const stationPillsEl = document.getElementById('station-pills');

// =====================================
// State
// =====================================

let orders = [];
let activeStation = 'all';
let soundOn = localStorage.getItem('eb_kitchen_sound') !== 'off';
let knownIds = new Set();       // ids we've already announced
let firstLoad = true;
let expandedIds = new Set();    // details panels currently open
let pendingActionIds = new Set(); // orders mid-request (disable buttons)

// menu item name (lowercased) -> category, built from the live menu
let itemCategoryMap = {};
// station/category list, built from the live menu ("All" + real categories)
let stationList = [];

// per-order checklist: orderId -> Set of item indices marked done (kitchen-side only)
let itemChecks = {};

// orders the chef has physically handed off & dismissed from the board,
// persisted so a refresh doesn't bring them back while they're still "ready"
let dismissedIds = new Set(JSON.parse(localStorage.getItem('eb_kitchen_dismissed') || '[]'));

$('#btn-sound').classList.toggle('active', soundOn);

// =====================================
// Helpers
// =====================================

function escapeHtml(str) {
  if (str === undefined || str === null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function slugify(str) {
  return String(str).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function saveDismissed() {
  localStorage.setItem('eb_kitchen_dismissed', JSON.stringify([...dismissedIds]));
}

function formatElapsed(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function getUrgency(o) {
  if (o.status === 'ready') return 'ready';
  const elapsed = Date.now() - new Date(o.createdAt).getTime();
  if (elapsed > 12 * 60 * 1000) return 'late';
  if (elapsed > 7 * 60 * 1000) return 'warn';
  return 'ok';
}

function typeLabel(t) {
  if (t === 'dine-in') return 'Dine-in';
  if (t === 'takeaway') return 'Takeaway';
  if (t === 'delivery') return 'Delivery';
  return t || 'Order';
}

// categories present in a given order (based on the live menu)
function getOrderCategories(o) {
  const cats = new Set();
  (o.items || []).forEach(it => {
    const cat = itemCategoryMap[(it.name || '').trim().toLowerCase()] || 'Other';
    cats.add(cat);
  });
  return cats;
}

// =====================================
// Menu / station setup
// =====================================

async function loadMenuStations() {
  try {
    const res = await fetch(MENU_API);
    const items = await res.json();
    if (!Array.isArray(items)) return;

    itemCategoryMap = {};
    const cats = new Set();
    items.forEach(it => {
      if (!it.name || !it.category) return;
      itemCategoryMap[it.name.trim().toLowerCase()] = it.category;
      cats.add(it.category);
    });

    stationList = [...cats].sort();
    renderStationPills();
  } catch (err) {
    console.error('Failed to load menu categories', err);
  }
}

function renderStationPills() {
  if (!stationPillsEl) return;
  const html = ['<button class="station-pill active" data-station="all">All <span class="count" id="cnt-all">0</span></button>'];
  stationList.forEach(cat => {
    const slug = slugify(cat);
    html.push(`<button class="station-pill" data-station="${escapeHtml(cat)}">${escapeHtml(cat)} <span class="count" id="cnt-${slug}">0</span></button>`);
  });
  stationPillsEl.innerHTML = html.join('');

  stationPillsEl.querySelectorAll('.station-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      stationPillsEl.querySelectorAll('.station-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeStation = btn.dataset.station;
      renderOrders();
    });
  });
}

// =====================================
// Load Orders
// =====================================

let ordersLoadInFlight = false;

async function loadOrders(silent) {
  // A slow request plus the 5-second timer/socket event used to create
  // overlapping responses, which repainted the board repeatedly.
  if (ordersLoadInFlight) return;
  ordersLoadInFlight = true;
  try {
    setSyncing(true);
    const res = await fetch(`${API}/orders`, { headers: { Authorization: 'Bearer ' + token } });

    if (res.status === 401 || res.status === 403) {
      alert("Session expired.");
      localStorage.clear();
      window.location.href = "/admin/login.html";
      return;
    }

    const data = await res.json();
    if (!data.success) {
      if (!silent) showToast(data.message || 'Failed to load orders', true);
      return;
    }

    handleNewArrivals(data.orders);
    orders = data.orders;
    cleanupLocalState();
    renderOrders();
  } catch (err) {
    console.error(err);
    if (!silent) showToast('Connection error', true);
  } finally {
    ordersLoadInFlight = false;
    setSyncing(false);
  }
}

function setSyncing(on) {
  const el = document.getElementById('sync-indicator');
  if (el) el.classList.toggle('syncing', on);
}

// Detect newly admin-approved kitchen tickets since last load -> toast + sound
function handleNewArrivals(newOrders) {
  const newIds = new Set(newOrders.map(o => o._id));

  if (!firstLoad) {
    newOrders.forEach(o => {
      if (['pending_kitchen', 'received'].includes(o.status) && !knownIds.has(o._id)) {
        showToast(`New ticket #${o.orderNumber}`);
        playNewOrderBeep();
      }
    });
  }

  knownIds = newIds;
  firstLoad = false;
}

// drop checklist/dismissed state for orders that are no longer on the board
// (bumped further along by the kitchen, or moved on by admin/delivery)
function cleanupLocalState() {
  const liveIds = new Set(orders.map(o => o._id));
  Object.keys(itemChecks).forEach(id => { if (!liveIds.has(id)) delete itemChecks[id]; });
  let dismissedChanged = false;
  [...dismissedIds].forEach(id => {
    const o = orders.find(x => x._id === id);
    if (!o || o.status !== 'ready') { dismissedIds.delete(id); dismissedChanged = true; }
  });
  if (dismissedChanged) saveDismissed();
}

// =====================================
// Render
// =====================================

function renderOrders() {
  let filtered = orders.filter(o => !dismissedIds.has(o._id));

  if (activeStation !== 'all') {
    filtered = filtered.filter(o => getOrderCategories(o).has(activeStation));
  }

  filtered.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  grid.innerHTML = '';
  if (filtered.length === 0) {
    emptyState.classList.remove('hidden');
  } else {
    emptyState.classList.add('hidden');
    filtered.forEach(o => grid.appendChild(buildCard(o)));
  }

  updateStats();
  updateStationCounts();
}

function buildCard(o) {
  const card = document.createElement('article');
  card.className = 'order-card';
  card.dataset.id = o._id;
  card.dataset.status = o.status;

  const urgency = getUrgency(o);
  if (urgency === 'late' && o.status !== 'ready') card.classList.add('late');

  const stripe = document.createElement('div');
  stripe.className = 'order-stripe';
  card.appendChild(stripe);

  const tag = document.createElement('div');
  tag.className = 'status-tag';
  tag.textContent = o.status;
  card.appendChild(tag);

  // Head
  const head = document.createElement('div');
  head.className = 'order-head';

  const left = document.createElement('div');
  const num = document.createElement('div');
  num.className = 'order-num';
  num.textContent = '#' + o.orderNumber;
  const meta = document.createElement('div');
  meta.className = 'order-meta';
  meta.innerHTML = `<strong>${escapeHtml(typeLabel(o.orderType))}</strong> · ${escapeHtml(o.customerName || '—')}<br>${escapeHtml(o.customerPhone || '')}`;
  left.appendChild(num);
  left.appendChild(meta);
  head.appendChild(left);

  const right = document.createElement('div');
  right.className = 'order-timer';
  const badge = document.createElement('div');
  badge.className = 'timer-badge';
  if (urgency === 'late') badge.classList.add('late');
  else if (urgency === 'warn') badge.classList.add('warn');
  else if (urgency === 'ready') badge.classList.add('ready');
  badge.dataset.createdAt = new Date(o.createdAt).getTime();
  badge.dataset.status = o.status;
  badge.textContent = formatElapsed(Date.now() - new Date(o.createdAt).getTime());
  const lbl = document.createElement('div');
  lbl.className = 'timer-label';
  lbl.textContent = o.status === 'ready' ? 'Ready' : (urgency === 'late' ? 'Late!' : 'Elapsed');
  right.appendChild(badge);
  right.appendChild(lbl);
  head.appendChild(right);
  card.appendChild(head);

  // Items — checkable once the ticket is being prepared
  const checkable = o.status === 'preparing';
  if (!itemChecks[o._id]) itemChecks[o._id] = new Set();
  if (o.status === 'ready') {
    // everything is done once a ticket is marked ready
    (o.items || []).forEach((_, idx) => itemChecks[o._id].add(idx));
  }
  const doneSet = itemChecks[o._id];

  const itemsEl = document.createElement('div');
  itemsEl.className = 'order-items';
  (o.items || []).forEach((it, idx) => {
    const isDone = doneSet.has(idx);
    const row = document.createElement('div');
    row.className = 'item-row' + (isDone ? ' done' : '') + (checkable ? ' checkable' : '');
    row.innerHTML = `
      <div class="qty">${it.qty}×</div>
      <div class="item-name">${escapeHtml(it.name)}</div>
      <div class="check"><i class="fa-solid fa-check"></i></div>
    `;
    if (checkable) row.addEventListener('click', () => toggleItemCheck(o._id, idx));
    itemsEl.appendChild(row);
  });
  card.appendChild(itemsEl);

  // Progress bar while preparing
  if (o.status === 'preparing') {
    const total = (o.items || []).length || 1;
    const doneN = doneSet.size;
    const pct = Math.round((doneN / total) * 100);
    const pbar = document.createElement('div');
    pbar.className = 'progress-bar';
    pbar.innerHTML = `<div class="progress-fill" style="width: ${pct}%"></div>`;
    card.appendChild(pbar);
  }

  // Notes
  if (o.notes) {
    const notes = document.createElement('div');
    notes.className = 'order-notes';
    notes.innerHTML = `<div class="note-label">Note</div><div class="note-text">${escapeHtml(o.notes)}</div>`;
    card.appendChild(notes);
  }

  // Details toggle
  const toggle = document.createElement('div');
  toggle.className = 'details-toggle';
  toggle.textContent = expandedIds.has(o._id) ? '▲ Hide full details' : '▼ Show full details';
  toggle.addEventListener('click', () => {
    if (expandedIds.has(o._id)) expandedIds.delete(o._id);
    else expandedIds.add(o._id);
    renderOrders();
  });
  card.appendChild(toggle);

  if (expandedIds.has(o._id)) {
    const panel = document.createElement('div');
    panel.className = 'details-panel';
    const allItems = (o.items || []).map(i => `${i.qty}× ${escapeHtml(i.name)}`).join('<br>');
    panel.innerHTML = `
      <strong>All items</strong><br>${allItems || '—'}<br><br>
      <strong>Delivery address</strong><br>${escapeHtml(o.deliveryAddress || '—')}
    `;
    card.appendChild(panel);
  }

  // Footer
  const foot = document.createElement('div');
  foot.className = 'order-foot';

  const busy = pendingActionIds.has(o._id);

  if (o.status === 'preparing') {
    const total = (o.items || []).length || 1;
    const doneN = doneSet.size;
    const stat = document.createElement('div');
    stat.className = 'progress-text';
    stat.innerHTML = `<strong>${doneN}</strong>/${total} items done`;
    foot.appendChild(stat);
  } else {
    const total = document.createElement('div');
    total.className = 'order-total';
    total.textContent = '$' + Number(o.total || 0).toFixed(2);
    foot.appendChild(total);
  }

  const btn = document.createElement('button');

  if (o.status === 'pending_kitchen' || o.status === 'received') {
    btn.className = 'btn-action primary';
    btn.innerHTML = busy ? `<i class="fa-solid fa-spinner spin"></i> Starting…` : `<i class="fa-solid fa-fire"></i> Start Preparing`;
    btn.disabled = busy;
    btn.addEventListener('click', () => acceptOrder(o._id));
  } else if (o.status === 'preparing') {
    const allDone = (o.items || []).length > 0 && doneSet.size >= (o.items || []).length;
    btn.className = 'btn-action ready-action';
    btn.innerHTML = busy ? `<i class="fa-solid fa-spinner spin"></i> Updating…` : `<i class="fa-solid fa-check"></i> Ready For Service`;
    btn.disabled = busy || !allDone;
    if (!allDone && !busy) btn.title = 'Check off every item first';
    btn.addEventListener('click', () => readyOrder(o._id));
  } else if (o.status === 'ready') {
    btn.className = 'btn-action bump';
    btn.innerHTML = `<i class="fa-solid fa-check-double"></i> BUMP — Served`;
    btn.addEventListener('click', () => bumpOrder(o._id));
  } else {
    btn.className = 'btn-action waiting';
    btn.innerHTML = `<i class="fa-solid fa-hourglass-half"></i> Awaiting Admin Approval`;
    btn.disabled = true;
  }
  foot.appendChild(btn);
  card.appendChild(foot);

  return card;
}

// =====================================
// Actions
// =====================================

function toggleItemCheck(orderId, idx) {
  if (!itemChecks[orderId]) itemChecks[orderId] = new Set();
  const set = itemChecks[orderId];
  if (set.has(idx)) set.delete(idx);
  else set.add(idx);
  renderOrders();
}

async function acceptOrder(id) {
  pendingActionIds.add(id);
  renderOrders();
  try {
    const res = await fetch(`${API}/${id}/accept`, { method: "PUT", headers: { Authorization: 'Bearer ' + token } });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.message || "Unable to update order.", true);
      return;
    }
    await loadOrders(true);
  } catch (err) {
    console.error(err);
    showToast("Server error.", true);
  } finally {
    pendingActionIds.delete(id);
    renderOrders();
  }
}

async function readyOrder(id) {
  pendingActionIds.add(id);
  renderOrders();
  try {
    const res = await fetch(`${API}/${id}/prepared`, { method: "PUT", headers: { Authorization: 'Bearer ' + token } });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.message || "Unable to update order.", true);
      return;
    }
    playReadyChime();
    await loadOrders(true);
  } catch (err) {
    console.error(err);
    showToast("Server error.", true);
  } finally {
    pendingActionIds.delete(id);
    renderOrders();
  }
}

// Dismiss a ready ticket from the board once it's been physically handed off.
// (There's no further kitchen-side status to move to — admin/delivery takes
// it from here — so this is a local "bump", same as clearing it from the rail.)
function bumpOrder(id) {
  const card = grid.querySelector(`[data-id="${id}"]`);
  const finish = () => {
    dismissedIds.add(id);
    saveDismissed();
    renderOrders();
  };
  if (card) {
    card.classList.add('bumping');
    setTimeout(finish, 380);
  } else {
    finish();
  }
}

function bumpAllReady() {
  const readyOrders = orders.filter(o => o.status === 'ready' && !dismissedIds.has(o._id));
  if (!readyOrders.length) return;
  readyOrders.forEach(o => {
    const card = grid.querySelector(`[data-id="${o._id}"]`);
    if (card) card.classList.add('bumping');
  });
  setTimeout(() => {
    readyOrders.forEach(o => dismissedIds.add(o._id));
    saveDismissed();
    renderOrders();
  }, 380);
}

// =====================================
// Stats + counters
// =====================================

function updateStats() {
  const visible = orders.filter(o => !dismissedIds.has(o._id));
  const pending = visible.filter(o => ['pending_kitchen', 'received'].includes(o.status)).length;
  const preparing = visible.filter(o => o.status === 'preparing').length;
  const ready = visible.filter(o => o.status === 'ready').length;
  const late = visible.filter(o => getUrgency(o) === 'late').length;

  $('#stat-pending').textContent = pending;
  $('#stat-preparing').textContent = preparing;
  $('#stat-ready').textContent = ready;
  $('#stat-late').textContent = late;

  if (visible.length) {
    const avgMs = visible.reduce((s, o) => s + (Date.now() - new Date(o.createdAt).getTime()), 0) / visible.length;
    $('#stat-avg').textContent = Math.max(0, Math.floor(avgMs / 60000)) + 'm';
  } else {
    $('#stat-avg').textContent = '0m';
  }

  const bumpAllBtn = document.getElementById('btn-bump-all');
  if (bumpAllBtn) bumpAllBtn.disabled = ready === 0;
}

function updateStationCounts() {
  const visible = orders.filter(o => !dismissedIds.has(o._id));
  const counts = { all: visible.length };
  stationList.forEach(cat => { counts[cat] = 0; });
  visible.forEach(o => {
    getOrderCategories(o).forEach(cat => {
      if (counts[cat] !== undefined) counts[cat]++;
    });
  });
  const allEl = document.getElementById('cnt-all');
  if (allEl) allEl.textContent = counts.all;
  stationList.forEach(cat => {
    const el = document.getElementById('cnt-' + slugify(cat));
    if (el) el.textContent = counts[cat] || 0;
  });
}

// =====================================
// Live timers — update every second without full re-render
// =====================================

function tickTimers() {
  document.querySelectorAll('.timer-badge').forEach(el => {
    const status = el.dataset.status;
    const createdAt = Number(el.dataset.createdAt);
    if (!createdAt) return;
    const elapsed = Date.now() - createdAt;
    const urgency = status === 'ready' ? 'ready' : (elapsed > 12 * 60 * 1000 ? 'late' : (elapsed > 7 * 60 * 1000 ? 'warn' : 'ok'));

    el.textContent = formatElapsed(elapsed);
    el.classList.remove('warn', 'late', 'ready');
    if (urgency === 'late') el.classList.add('late');
    else if (urgency === 'warn') el.classList.add('warn');
    else if (urgency === 'ready') el.classList.add('ready');

    const card = el.closest('.order-card');
    if (card) {
      if (urgency === 'late' && status !== 'ready') card.classList.add('late');
      else card.classList.remove('late');
    }
  });
  updateStats();
}

// =====================================
// Clock
// =====================================

function tickClock() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  $('#clock').textContent = `${hh}:${mm}:${ss}`;
  const days = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  $('#clock-date').textContent = `${days[now.getDay()]} · ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
}

// =====================================
// Toast
// =====================================

function showToast(text, isError) {
  const c = $('#toast-container');
  const t = document.createElement('div');
  t.className = 'toast' + (isError ? ' error' : '');
  t.innerHTML = `
    <div class="dot" style="${isError ? 'background:var(--red);box-shadow:0 0 12px var(--red)' : ''}"></div>
    <div>
      <div style="font-size:10px;letter-spacing:0.2em;color:var(--muted);text-transform:uppercase">${isError ? 'Alert' : 'Incoming'}</div>
      <div style="font-weight:700;font-size:14px;margin-top:2px">${escapeHtml(text)}</div>
    </div>
  `;
  c.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

// =====================================
// Sound — AudioContext beeps, no external files
// =====================================

let audioCtx;
function getCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}
function beep(freq, duration, type = 'sine', vol = 0.2) {
  if (!soundOn) return;
  try {
    const ctx = getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (e) { /* ignore */ }
}
function playNewOrderBeep() {
  beep(880, 0.15, 'sine', 0.18);
  setTimeout(() => beep(1175, 0.22, 'sine', 0.18), 160);
}
function playReadyChime() {
  beep(523, 0.12, 'triangle', 0.2);
  setTimeout(() => beep(659, 0.12, 'triangle', 0.2), 130);
  setTimeout(() => beep(784, 0.2, 'triangle', 0.22), 260);
}

// =====================================
// Wire up nav bar
// =====================================

$('#btn-sound').addEventListener('click', () => {
  soundOn = !soundOn;
  localStorage.setItem('eb_kitchen_sound', soundOn ? 'on' : 'off');
  $('#btn-sound').classList.toggle('active', soundOn);
  $('#btn-sound').innerHTML = soundOn ? '<i class="fa-solid fa-volume-high"></i>' : '<i class="fa-solid fa-volume-xmark"></i>';
  if (soundOn) beep(660, 0.1, 'sine', 0.15);
});

$('#btn-fullscreen').addEventListener('click', () => {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
  else document.exitFullscreen?.();
});

document.getElementById('btn-bump-all').addEventListener('click', bumpAllReady);

logoutBtn.addEventListener("click", () => {
  if (!confirm("Are you sure you want to logout?")) return;
  localStorage.removeItem("eb_admin_token");
  localStorage.removeItem("eb_admin_user");
  window.location.href = "/admin/login.html";
});

// =====================================
// Real-time socket updates
// =====================================

let socket = null;
try {
  if (typeof io !== 'undefined') {
    socket = io();
    socket.on('connect', () => console.log('kitchen socket connected', socket.id));
    socket.on('order:update', () => loadOrders(true));
  }
} catch (e) { console.warn('socket init failed', e); }

// =====================================
// Init
// =====================================

tickClock();
setInterval(tickClock, 1000);
setInterval(tickTimers, 1000);
loadMenuStations().then(() => loadOrders());
setInterval(() => {
  if (document.visibilityState === 'visible') loadOrders(true);
}, 15000);
