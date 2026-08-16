// =====================================
// API
// =====================================

const API = "/api/delivery";

const token = localStorage.getItem("eb_admin_token");
const user = JSON.parse(localStorage.getItem("eb_admin_user") || "null");

// =====================================
// Elements
// =====================================

const assignedContainer = document.getElementById("assignedOrders");
const deliveredBody = document.getElementById("deliveredBody");

const assignedCount = document.getElementById("assignedCount");
const deliveredCount = document.getElementById("deliveredCount");

const assignedBadge = document.getElementById("assignedBadge");
const deliveredBadge = document.getElementById("deliveredBadge");

const riderRegionValue = document.getElementById("riderRegionValue");
const riderCapacityLabel = document.getElementById("riderCapacityLabel");
const riderRegionLabel = document.getElementById("riderRegionLabel");
const riderNameLabel = document.getElementById("riderNameLabel");
const riderFirstName = document.getElementById("riderFirstName");
const riderAvatar = document.getElementById("riderAvatar");

const todayDate = document.getElementById("todayDate");

const logoutBtn = document.getElementById("logoutBtn");

// =====================================
// Check Login & Role
// =====================================

if (!token) {
    window.location.href = "/admin/login.html";
} else if (!user || user.role !== "delivery") {
    if (user && user.role === "admin") window.location.href = "/admin";
    else if (user && user.role === "chef") window.location.href = "/kitchen";
    else window.location.href = "/admin/login.html";
}

// =====================================
// Header basics
// =====================================

todayDate.textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

if (user && user.name) {
    const firstName = user.name.split(' ')[0];
    riderFirstName.textContent = firstName;
    riderNameLabel.textContent = user.name;
    riderAvatar.textContent = firstName.charAt(0).toUpperCase();
}

// =====================================
// Logout
// =====================================

logoutBtn.addEventListener("click", () => {

    if (!confirm("Are you sure you want to logout?")) return;

    stopLiveLocationSharing();
    localStorage.removeItem("eb_admin_token");
    localStorage.removeItem("eb_admin_user");

    window.location.href = "/admin/login.html";

});

// =====================================
// Nav — smooth scroll to section
// =====================================

document.querySelectorAll(".nav-item[data-view]").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".nav-item[data-view]").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const target = document.getElementById(btn.dataset.view);
        if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
});

// =====================================
// Live Map — Active Delivery
// Uses Leaflet + OpenStreetMap (no API key required, unlike Google Maps).
// RESTAURANT_LOCATION — the café's real pickup point. Update lat/lng here if
// the restaurant ever moves; everything else (routing, distance, ETA) is
// calculated from this point automatically.
const RESTAURANT_LOCATION = { lat: 31.4187, lng: 73.0791, label: "Ember & Brew (Pickup)" };

// OSRM (Open Source Routing Machine) — free, no API key required. Returns an
// actual road route (not a straight line) plus its real driving distance and
// duration. Falls back to a straight-line estimate if OSRM is unreachable.
const OSRM_BASE = "https://router.project-osrm.org/route/v1/driving";

let deliveryMap = null;
let customerMarker = null;
let riderMarker = null;
let routeLine = null;
let currentActiveOrderId = null;
const geocodeCache = new Map();
let liveLocationWatchId = null;
let lastLocationSentAt = 0;
// The rider's most recent GPS fix (once "Start Live Location" is on) and the
// resolved drop-off point for whichever order is currently being traced.
// Kept here so the route/ETA can be recomputed as the rider moves, instead
// of being calculated once from the restaurant's fixed address and never
// updated — which is why the rider's own distance used to freeze while the
// customer's live-updating distance kept shrinking.
let lastRiderPosition = null;
let activeDropoffPoint = null;
let activeDropoffOrder = null;

function updateLiveLocationButton() {
    const button = document.getElementById('liveLocationButton');
    if (!button) return;
    const sharing = liveLocationWatchId !== null;
    button.textContent = sharing ? 'Stop Live Location' : 'Start Live Location';
    button.classList.toggle('sharing', sharing);
}

function startLiveLocationSharing() {
    if (!navigator.geolocation) return alert('This device does not support location sharing.');
    if (liveLocationWatchId !== null) return stopLiveLocationSharing();
    liveLocationWatchId = navigator.geolocation.watchPosition(async position => {
        // Update the local rider marker + route/ETA on every fix — this is
        // cheap (no network call) and keeps the on-screen distance genuinely
        // live instead of frozen at whatever it was when the order loaded.
        lastRiderPosition = { lat: position.coords.latitude, lng: position.coords.longitude };
        refreshLiveRoute();

        const now = Date.now();
        if (now - lastLocationSentAt < 10000) return;
        lastLocationSentAt = now;
        try {
            const response = await fetch(`${API}/location`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                body: JSON.stringify({ latitude: position.coords.latitude, longitude: position.coords.longitude })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message);
        } catch (error) {
            console.warn('Live location update failed:', error.message);
        }
    }, error => {
        alert(error.code === error.PERMISSION_DENIED ? 'Location permission was denied.' : 'Could not read your location.');
        stopLiveLocationSharing();
    }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
    updateLiveLocationButton();
}

function stopLiveLocationSharing() {
    if (liveLocationWatchId !== null) navigator.geolocation.clearWatch(liveLocationWatchId);
    liveLocationWatchId = null;
    lastLocationSentAt = 0;
    lastRiderPosition = null;
    if (riderMarker) { deliveryMap?.removeLayer(riderMarker); riderMarker = null; }
    // Falls back to the restaurant's fixed address for distance/ETA again
    // now that we no longer have a live fix.
    if (activeDropoffOrder) refreshLiveRoute();
    updateLiveLocationButton();
}

function initDeliveryMap() {
    const mapEl = document.getElementById('deliveryMap');
    if (!mapEl || typeof L === 'undefined') return;

    deliveryMap = L.map('deliveryMap').setView([RESTAURANT_LOCATION.lat, RESTAURANT_LOCATION.lng], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    }).addTo(deliveryMap);

    L.marker([RESTAURANT_LOCATION.lat, RESTAURANT_LOCATION.lng])
        .addTo(deliveryMap)
        .bindPopup(RESTAURANT_LOCATION.label);
}

async function geocodeAddress(address) {
    if (!address) return null;
    if (geocodeCache.has(address)) return geocodeCache.get(address);

    try {
        const query = encodeURIComponent(`${address}, Faisalabad, Pakistan`);
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${query}`);
        const data = await res.json();

        if (!data || !data.length) {
            geocodeCache.set(address, null);
            return null;
        }

        const point = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
        geocodeCache.set(address, point);
        return point;
    } catch (err) {
        console.error("Geocoding failed:", err);
        return null;
    }
}

// Real road route between two points via OSRM. Returns
// { coords: [[lat,lng], ...], distanceKm, durationMin } or null if the
// routing service can't be reached / can't find a road route.
async function fetchRoadRoute(from, to) {
    try {
        const url = `${OSRM_BASE}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
        const res = await fetch(url);
        const data = await res.json();

        if (!data || data.code !== 'Ok' || !data.routes || !data.routes.length) return null;

        const route = data.routes[0];
        return {
            coords: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
            distanceKm: route.distance / 1000,
            durationMin: route.duration / 60
        };
    } catch (err) {
        console.error("Routing failed:", err);
        return null;
    }
}

function haversineKm(a, b) {
    const R = 6371;
    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLng = (b.lng - a.lng) * Math.PI / 180;
    const lat1 = a.lat * Math.PI / 180;
    const lat2 = b.lat * Math.PI / 180;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

async function updateActiveDeliveryMap(order) {
    const pill = document.getElementById('mapStatusPill');
    if (!deliveryMap || !pill) return;

    if (!order) {
        currentActiveOrderId = null;
        activeDropoffOrder = null;
        activeDropoffPoint = null;
        if (customerMarker) { deliveryMap.removeLayer(customerMarker); customerMarker = null; }
        if (riderMarker) { deliveryMap.removeLayer(riderMarker); riderMarker = null; }
        if (routeLine) { deliveryMap.removeLayer(routeLine); routeLine = null; }
        pill.textContent = "No active order to trace";
        deliveryMap.setView([RESTAURANT_LOCATION.lat, RESTAURANT_LOCATION.lng], 13);
        return;
    }

    // Skip re-geocoding if this order is already the one being traced
    if (order._id === currentActiveOrderId && customerMarker) return;
    currentActiveOrderId = order._id;

    pill.textContent = `Locating ${order.customerName}'s address…`;

    // Prefer the customer-confirmed GeoJSON pin over text geocoding. Text
    // geocoding can place a rider on the wrong street or neighbourhood.
    const coordinates = order.deliveryLocation?.coordinates;
    const hasSavedPin = order.deliveryLocation?.type === 'Point'
        && Array.isArray(coordinates)
        && coordinates.length === 2
        && coordinates.every(Number.isFinite);
    const point = hasSavedPin
        ? { lat: coordinates[1], lng: coordinates[0] }
        : await geocodeAddress(order.deliveryAddress || order.region || '');

    if (customerMarker) { deliveryMap.removeLayer(customerMarker); customerMarker = null; }
    if (routeLine) { deliveryMap.removeLayer(routeLine); routeLine = null; }

    if (!point) {
        activeDropoffOrder = null;
        activeDropoffPoint = null;
        pill.textContent = "This order has no usable delivery location";
        deliveryMap.setView([RESTAURANT_LOCATION.lat, RESTAURANT_LOCATION.lng], 13);
        return;
    }

    customerMarker = L.marker([point.lat, point.lng])
        .addTo(deliveryMap)
        .bindPopup(`${escapeHtml(order.customerName)} (Exact drop-off pin)`)
        .openPopup();

    // Remember these so refreshLiveRoute() can redraw the route as the
    // rider's GPS moves, without re-geocoding or re-placing this marker.
    activeDropoffOrder = order;
    activeDropoffPoint = point;

    await renderLiveRoute(order, point, true);
}

// Redraws the road route, distance/ETA pill, and rider marker using the
// rider's current live position (falling back to the restaurant's fixed
// address if live sharing isn't on yet). Called both on initial load and
// every time a fresh GPS fix comes in from startLiveLocationSharing(), so
// the rider sees the same continuously-updating distance the customer does
// — instead of a number frozen at whatever it was when the order loaded.
// `fit` only re-centers/zooms the map on the initial render; live refreshes
// leave the rider's current view alone so the map doesn't jump every ~10s.
async function renderLiveRoute(order, point, fit = false) {
    const pill = document.getElementById('mapStatusPill');
    if (!deliveryMap || !pill || !point) return;

    const origin = lastRiderPosition || RESTAURANT_LOCATION;

    if (lastRiderPosition) {
        if (!riderMarker) {
            riderMarker = L.marker([origin.lat, origin.lng], {
                icon: L.divIcon({ className: 'rider-live-marker', html: '🛵', iconSize: [28, 28] })
            }).addTo(deliveryMap).bindPopup('Your live location');
        } else {
            riderMarker.setLatLng([origin.lat, origin.lng]);
        }
    } else if (riderMarker) {
        deliveryMap.removeLayer(riderMarker);
        riderMarker = null;
    }

    if (routeLine) { deliveryMap.removeLayer(routeLine); routeLine = null; }
    pill.textContent = `#${order.orderNumber} · Finding the road route…`;

    const road = await fetchRoadRoute(origin, point);

    if (road) {
        // Real road path, following actual streets.
        routeLine = L.polyline(road.coords, { color: '#C4923A', weight: 5 }).addTo(deliveryMap);
        if (fit) deliveryMap.fitBounds(routeLine.getBounds(), { padding: [40, 40] });
        pill.textContent = `#${order.orderNumber} · ${road.distanceKm.toFixed(1)} km · ~${Math.round(road.durationMin)} min to drop-off`;
    } else {
        // Routing service unreachable — fall back to a straight-line estimate
        // so the rider still sees direction/distance.
        routeLine = L.polyline(
            [[origin.lat, origin.lng], [point.lat, point.lng]],
            { color: '#C4923A', weight: 4, dashArray: '6, 10' }
        ).addTo(deliveryMap);
        if (fit) deliveryMap.fitBounds(routeLine.getBounds(), { padding: [40, 40] });
        const km = haversineKm(origin, point);
        pill.textContent = `#${order.orderNumber} · ~${km.toFixed(1)} km to drop-off (straight-line estimate)`;
    }
}

let liveRouteRefreshInFlight = false;
async function refreshLiveRoute() {
    if (!activeDropoffOrder || !activeDropoffPoint || liveRouteRefreshInFlight) return;
    liveRouteRefreshInFlight = true;
    try {
        await renderLiveRoute(activeDropoffOrder, activeDropoffPoint);
    } finally {
        liveRouteRefreshInFlight = false;
    }
}

function renderActiveDelivery(assigned) {
    const panel = document.getElementById('activeOrderPanel');
    const badge = document.getElementById('activeDeliveryBadge');
    if (!panel || !badge) return;

    const activeOrder = assigned[0] || null;

    if (!activeOrder) {
        stopLiveLocationSharing();
        panel.innerHTML = `<div class="empty-orders">🛵 No orders out for delivery right now.</div>`;
        badge.hidden = true;
        updateActiveDeliveryMap(null);
        return;
    }

    badge.hidden = false;

    const phoneDigits = (activeOrder.customerPhone || "").replace(/[^0-9+]/g, "");
    const callBtn = phoneDigits ? `<a class="btn call-btn" href="tel:${phoneDigits}">📞 Call Customer</a>` : "";

    panel.innerHTML = `
        <div class="order-header">
            <h2>#${escapeHtml(activeOrder.orderNumber)}</h2>
        </div>
        <div class="active-route">
            <div class="stop">
                <span class="dot pickup"></span>
                <div><strong>Ember &amp; Brew</strong><span>Pickup location</span></div>
            </div>
            <div class="stop">
                <span class="dot dropoff"></span>
                <div><strong>${escapeHtml(activeOrder.customerName)}</strong><span>${escapeHtml(activeOrder.deliveryAddress || activeOrder.region || 'Address not set')}${activeOrder.deliveryLocation?.type === 'Point' ? ' · Exact map pin' : ''}</span></div>
            </div>
        </div>
        <div class="distance-pill">
            <span>Order total</span>
            <strong>$${Number(activeOrder.total || 0).toFixed(2)}</strong>
        </div>
        <div class="footer" style="border-top:none; padding-top:0; margin-top:2px;">
            <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
                ${callBtn}
                <button id="liveLocationButton" class="btn" onclick="startLiveLocationSharing()">Start Live Location</button>
                <div class="otp-verification">
                    <label for="otp-active-${activeOrder._id}">Customer OTP</label>
                    <input id="otp-active-${activeOrder._id}" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" placeholder="6-digit OTP">
                    <button class="btn deliver-btn" onclick="verifyOtp('${activeOrder._id}', 'otp-active-${activeOrder._id}')">Verify</button>
                </div>
            </div>
        </div>
    `;

    updateActiveDeliveryMap(activeOrder);
    updateLiveLocationButton();
}

// =====================================
// Load My Profile (region + capacity)
// =====================================

async function loadMyProfile() {

    try {

        const res = await fetch(`${API}/me`, { headers: { Authorization: 'Bearer ' + token } });

        if (res.status === 401 || res.status === 403) return; // loadOrders() will handle the redirect

        const data = await res.json();

        if (!data.success) return;

        const region = data.rider.region;

        if (data.rider.name) {
            const firstName = data.rider.name.split(' ')[0];
            riderFirstName.textContent = firstName;
            riderNameLabel.textContent = data.rider.name;
            riderAvatar.textContent = firstName.charAt(0).toUpperCase();
        }

        if (!region) {
            riderRegionValue.textContent = "Not set";
            riderRegionLabel.textContent = "⚠️ Ask admin to set your region";
            riderCapacityLabel.textContent = "No region assigned yet";
            return;
        }

        riderRegionValue.textContent = region;
        riderRegionLabel.textContent = `📍 ${region}`;
        riderCapacityLabel.textContent = `${data.rider.activeOrders || 0}/${data.maxActiveOrders} active orders`;

    }

    catch (err) {

        console.error(err);

    }

}

// =====================================
// Load My Orders
// =====================================

async function loadOrders() {

    try {

        const res = await fetch(`${API}/orders`, { headers: { Authorization: 'Bearer ' + token } });

        if (res.status === 401 || res.status === 403) {

            alert("Session expired.");

            localStorage.clear();

            window.location.href = "/admin/login.html";

            return;

        }

        const data = await res.json();

        if (!data.success) {

            alert(data.message);

            return;

        }

        renderOrders(data.orders);

    }

    catch (err) {

        console.error(err);

    }

}

// =====================================
// Render Orders
// =====================================

function isToday(dateStr) {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() &&
           d.getMonth() === now.getMonth() &&
           d.getDate() === now.getDate();
}

function renderOrders(orders) {

    const assigned = orders.filter(o => o.status === "out-for-delivery");
    const delivered = orders.filter(o => (o.status === "delivered" || o.status === "completed") && isToday(o.deliveredAt || o.updatedAt));

    assignedCount.textContent = assigned.length;
    deliveredCount.textContent = delivered.length;

    assignedBadge.textContent = assigned.length;
    if (deliveredBadge) {
        deliveredBadge.textContent = delivered.length;
        deliveredBadge.hidden = delivered.length === 0;
    }

    // ---- Active delivery (featured card + live map) ----
    renderActiveDelivery(assigned);

    // ---- Out for delivery (cards) ----
    if (!assigned.length) {
        assignedContainer.innerHTML = `
            <div class="empty-orders">
                🛵 No orders out for delivery right now.
            </div>
        `;
    } else {
        assignedContainer.innerHTML = assigned.map(order => createCard(order)).join('');
    }

    // ---- Delivered today (table) ----
    if (!delivered.length) {
        deliveredBody.innerHTML = `<tr><td colspan="5" class="empty-state">Nothing delivered yet today.</td></tr>`;
    } else {
        deliveredBody.innerHTML = delivered.map(order => createDeliveredRow(order)).join('');
    }

}

// =====================================
// Create Order Card (Out for Delivery)
// =====================================

function createCard(order) {

    let itemsHtml = "";
    (order.items || []).forEach(item => {
        itemsHtml += `<li><span class="it-name">${escapeHtml(item.name)}</span><strong class="it-qty">x${item.qty}</strong></li>`;
    });

    const phoneDigits = (order.customerPhone || "").replace(/[^0-9+]/g, "");
    const callBtn = phoneDigits ? `<a class="btn call-btn" href="tel:${phoneDigits}">📞 Call Customer</a>` : "";

    return `

    <div class="order-card">

        <div class="order-header">

            <h2>#${escapeHtml(order.orderNumber)}</h2>

            <span class="badge out-for-delivery">
                Out for delivery
            </span>

        </div>

        <div class="customer">

            <p><strong>Customer:</strong> ${escapeHtml(order.customerName)}</p>

            <p><strong>Phone:</strong> ${escapeHtml(order.customerPhone)}</p>

            ${order.region ? `<p><strong>Region:</strong> ${escapeHtml(order.region)}</p>` : ''}

            ${order.deliveryAddress ? `<p class="address"><strong>Address:</strong> ${escapeHtml(order.deliveryAddress)}</p>` : ''}

        </div>

        <div class="items">

            <h4>Items In This Order</h4>

            <ul>
                ${itemsHtml}
            </ul>

        </div>

        <div class="notes-summary">
            <strong>Notes</strong>
            <div class="short-note">${escapeHtml(order.notes || '') || 'No special instructions.'}</div>
        </div>

        <div class="footer">
            <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
                ${callBtn}
                <div class="otp-verification">
                    <label for="otp-card-${order._id}">Enter Customer OTP</label>
                    <input id="otp-card-${order._id}" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" placeholder="6-digit OTP">
                    <button class="btn deliver-btn" onclick="verifyOtp('${order._id}', 'otp-card-${order._id}')">Verify</button>
                </div>
            </div>
            <h3>$${Number(order.total || 0).toFixed(2)}</h3>
        </div>

    </div>

    `;

}

// =====================================
// Create Delivered Row (table)
// =====================================

function createDeliveredRow(order) {

    const itemsSummary = (order.items || []).map(i => `${i.qty}× ${i.name}`).join(', ');
    const time = new Date(order.deliveredAt || order.updatedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

    return `
        <tr>
            <td><span class="order-id">#${escapeHtml(order.orderNumber)}</span></td>
            <td>${escapeHtml(order.customerName)}<br><span class="cust">${escapeHtml(order.customerPhone || '')}</span></td>
            <td class="cust">${escapeHtml(itemsSummary)}</td>
            <td>$${Number(order.total || 0).toFixed(2)}</td>
            <td class="cust">${time}</td>
        </tr>
    `;

}

// =====================================
// Mark Delivered
// out-for-delivery -> delivered
// =====================================

function verifyOtp(id, inputId) {

    const input = document.getElementById(inputId);
    const otp = input ? input.value.trim() : '';
    if (!/^\d{6}$/.test(otp)) {
        alert('Enter the 6-digit OTP provided by the customer.');
        if (input) input.focus();
        return;
    }
    markDelivered(id, otp);
}

async function markDelivered(id, otp) {

    try {

        const res = await fetch(`${API}/${id}/delivered`, {
            method: "PUT",
            headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ otp })
        });

        const data = await res.json();

        if (!res.ok) {

            alert(data.message || "Unable to update order.");

            return;

        }

        loadOrders();
        loadMyProfile();
        alert(data.message || 'OTP verified. Order marked as delivered.');

    }

    catch (err) {

        console.error(err);

        alert("Server error.");

    }

}

function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, m => ({
        '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[m]));
}

// =====================================
// Auto Refresh
// =====================================

setInterval(() => {
    loadOrders();
    loadMyProfile();
}, 5000);

// =====================================
// Initial Load
// =====================================

document.addEventListener("DOMContentLoaded", () => {
    initDeliveryMap();
    loadOrders();
    loadMyProfile();
});

// ---------- Real-time socket updates ----------
let socket = null;
try {
  if (typeof io !== 'undefined') {
    socket = io();
    socket.on('connect', () => console.log('delivery socket connected', socket.id));
    socket.on('order:update', (order) => {
      loadOrders();
      loadMyProfile();
    });
  }
} catch (e) { console.warn('socket init failed', e); }