const express = require('express');
const jwt = require('jsonwebtoken');
const RestaurantTable = require('../models/RestaurantTable');
const Reservation = require('../models/Reservation');
const { isAdminRole } = require('../utils/branchScope');
const router = express.Router();

// Must match the values the "Add table" dropdown and floor-plan filter tabs
// actually send (index.html) — keeping 'indoor' too for tables created
// before the area picker switched to main-dining/private-room/outdoor.
const VALID_AREAS = ['indoor', 'outdoor', 'main-dining', 'private-room'];

function adminAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return res.status(401).json({ error: 'No token provided' });
  try {
    const admin = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
    if (!isAdminRole(admin.role)) return res.status(403).json({ error: 'Admin access only.' });
    next();
  } catch { res.status(401).json({ error: 'Invalid token' }); }
}

// Must match RESERVATION_WINDOW_MINUTES in src/Routes/reservations.js (used
// there to block double-booking a table for overlapping times).
const OCCUPIED_WINDOW_BEFORE_MIN = 30;   // table reads "occupied" starting 30 min before the booked time
const OCCUPIED_WINDOW_AFTER_MIN = 120;   // ...and for up to 2 hours after, for a normal dining session

function minutesFromTimeStr(timeStr) {
  const [h, m] = String(timeStr || '00:00').split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

async function tablesWithLiveStatus() {
  const todayStr = new Date().toISOString().slice(0, 10);
  const nowMinutes = (() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  })();

  const [tables, todaysActive] = await Promise.all([
    RestaurantTable.find({}).sort({ tableNumber: 1 }),
    // Every pending/confirmed reservation for TODAY. Reservations on other
    // dates never affect today's floor plan. A table's live status is
    // computed here on every read rather than being written into
    // manualStatus by reservations.js — that avoids a table getting stuck
    // "occupied" all day the moment a same-day booking is confirmed, hours
    // before the guest is actually due.
    Reservation.find({ tableNumber: { $ne: '' }, date: todayStr, status: { $in: ['pending', 'confirmed'] } })
      .select('tableNumber time status')
  ]);

  const byTable = new Map();
  todaysActive.forEach(r => {
    if (!byTable.has(r.tableNumber)) byTable.set(r.tableNumber, []);
    byTable.get(r.tableNumber).push(r);
  });

  return tables.map(table => {
    // A table an admin has put into maintenance always wins — a reservation
    // should never make a broken table look bookable.
    if (table.manualStatus === 'maintenance') {
      return { ...table.toObject(), status: 'maintenance' };
    }

    const reservationsHere = byTable.get(table.tableNumber) || [];
    let computed = table.manualStatus; // 'available' or 'occupied' (manual walk-in toggle)

    for (const r of reservationsHere) {
      if (r.status === 'confirmed') {
        const resMinutes = minutesFromTimeStr(r.time);
        const withinWindow = nowMinutes >= resMinutes - OCCUPIED_WINDOW_BEFORE_MIN
          && nowMinutes <= resMinutes + OCCUPIED_WINDOW_AFTER_MIN;
        if (withinWindow) { computed = 'occupied'; break; }
        if (computed !== 'occupied') computed = 'reserved';
      } else if (r.status === 'pending' && computed !== 'occupied') {
        computed = 'reserved';
      }
    }

    return { ...table.toObject(), status: computed };
  });
}

router.get('/', adminAuth, async (req, res) => {
  try { res.json(await tablesWithLiveStatus()); }
  catch { res.status(500).json({ error: 'Failed to load tables.' }); }
});

router.post('/', adminAuth, async (req, res) => {
  try {
    const tableNumber = String(req.body.tableNumber || '').trim().toUpperCase();
    const seats = Number(req.body.seats);
    const area = req.body.area;
    if (!tableNumber || !Number.isInteger(seats) || seats < 1 || seats > 30 || !VALID_AREAS.includes(area)) return res.status(400).json({ error: 'Enter a table number, area, and seat count.' });
    const table = await RestaurantTable.create({ tableNumber, seats, area });
    res.status(201).json(table);
  } catch (err) {
    res.status(err.code === 11000 ? 409 : 500).json({ error: err.code === 11000 ? 'That table number already exists.' : 'Failed to add table.' });
  }
});

router.put('/:id/status', adminAuth, async (req, res) => {
  try {
    const manualStatus = req.body.manualStatus;
    if (!['available', 'occupied', 'maintenance'].includes(manualStatus)) return res.status(400).json({ error: 'Invalid table status.' });
    const table = await RestaurantTable.findByIdAndUpdate(req.params.id, { manualStatus }, { new: true });
    if (!table) return res.status(404).json({ error: 'Table not found.' });
    res.json(table);
  } catch { res.status(500).json({ error: 'Failed to update table.' }); }
});

router.put('/:id', adminAuth, async (req, res) => {
  try {
    const tableNumber = String(req.body.tableNumber || '').trim().toUpperCase();
    const seats = Number(req.body.seats);
    const area = req.body.area;
    if (!tableNumber || !Number.isInteger(seats) || seats < 1 || seats > 30 || !VALID_AREAS.includes(area)) return res.status(400).json({ error: 'Enter a table number, area, and seat count.' });
    const table = await RestaurantTable.findByIdAndUpdate(req.params.id, { tableNumber, seats, area }, { new: true, runValidators: true, context: 'query' });
    if (!table) return res.status(404).json({ error: 'Table not found.' });
    res.json(table);
  } catch (err) {
    res.status(err.code === 11000 ? 409 : 500).json({ error: err.code === 11000 ? 'That table number already exists.' : 'Failed to update table.' });
  }
});

module.exports = router;