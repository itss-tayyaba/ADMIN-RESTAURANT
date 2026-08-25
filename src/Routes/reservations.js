const express = require('express');
const jwt = require('jsonwebtoken');
const Reservation = require('../models/Reservation');
const Customer = require('../models/Customer');
const { customerAuth } = require('./customerAuth');
const { isAdminRole, resolveBranchId, resolvePublicBranchId, addBranchScope } = require('../utils/branchScope');
const { notifyReservation } = require('../services/notificationService');

const router = express.Router();

function todayStr() { return new Date().toISOString().slice(0, 10); }

// Must match the window used in src/Routes/tables.js, which is what
// actually decides whether a table LOOKS occupied on the floor plan right
// now. This constant is only used here to stop two reservations from being
// confirmed onto the same table for overlapping times in the first place.
const RESERVATION_WINDOW_MINUTES = 120; // a booking is assumed to hold the table for ~2 hours

function minutesFromTimeStr(timeStr) {
  const [h, m] = String(timeStr || '00:00').split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

// Blocks confirming a reservation onto a table that's already holding
// another CONFIRMED reservation with an overlapping time on the same date.
// (Deliberately ignores merely "pending" reservations on the same
// table/time — an admin should be free to choose which of several pending
// requests to confirm, rather than being blocked by the others.)
async function hasConfirmedConflict(tableNumber, date, time, excludeReservationId, branchId) {
  if (!tableNumber) return false;
  const query = {
    _id: { $ne: excludeReservationId },
    tableNumber,
    date,
    status: 'confirmed'
  };
  await addBranchScope(query, branchId);
  const sameDay = await Reservation.find(query).select('time');

  const start = minutesFromTimeStr(time);
  return sameDay.some(r => Math.abs(minutesFromTimeStr(r.time) - start) < RESERVATION_WINDOW_MINUTES);
}

function adminAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return res.status(401).json({ error: 'No token provided' });
  try {
    const decoded = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
    if (!isAdminRole(decoded.role)) return res.status(403).json({ error: 'Admin access only.' });
    req.admin = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// Public reservation request from the website or portal.
router.post('/', async (req, res) => {
  try {
    const { guestName, email, phone, date, time, guests, notes } = req.body;
    const partySize = Number(guests);
    const cleanPhone = String(phone || '').trim().replace(/[\s()-]/g, '');
    if (!guestName?.trim() || !email?.trim() || !/^(0\d{9,11}|\+?[1-9]\d{6,14})$/.test(cleanPhone) || !date || !time || !Number.isInteger(partySize) || partySize < 1 || partySize > 20) {
      return res.status(400).json({ error: 'Please provide valid reservation details.' });
    }
    if (new Date(`${date}T00:00:00`).getTime() < new Date().setHours(0, 0, 0, 0)) {
      return res.status(400).json({ error: 'Please choose a future reservation date.' });
    }

    let customerId = null;
    const header = req.headers.authorization;
    if (header && header.startsWith('Bearer ')) {
      try {
        const decoded = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
        if (decoded.role === 'customer') {
          customerId = decoded.id;
        }
      } catch (err) {
        // ignore invalid token for public booking
      }
    }

    const branchId = await resolvePublicBranchId(req.query);
    const reservation = await Reservation.create({
      branchId,
      guestName,
      email,
      phone: cleanPhone,
      date,
      time,
      guests: partySize,
      notes: notes || '',
      customerId
    });
    notifyReservation(reservation, 'pending').catch(e => console.warn('[Reservation Notify Error]', e.message));
    res.status(201).json(reservation);
  } catch (err) {
    res.status(500).json({ error: 'Unable to save the reservation. Please try again.' });
  }
});

// Customer reservation list.
router.get('/mine/list', customerAuth, async (req, res) => {
  try {
    let customerEmail = req.customer.email;
    let customerPhone = req.customer.phone;

    if (!customerEmail || !customerPhone) {
      const customer = await Customer.findById(req.customer.id).select('email phone');
      if (customer) {
        customerEmail = customer.email || customerEmail;
        customerPhone = customer.phone || customerPhone;
      }
    }

    const query = {
      $or: [
        { customerId: req.customer.id }
      ]
    };
    if (customerEmail) {
      query.$or.push({ email: customerEmail });
    }
    if (customerPhone) {
      const phoneVars = [customerPhone];
      const digits = customerPhone.replace(/\D/g, '');
      if (digits.startsWith('92') && digits.length >= 10) {
        phoneVars.push(`0${digits.slice(2)}`, `+${digits}`, digits);
      } else if (digits.startsWith('0') && digits.length >= 10) {
        phoneVars.push(`+92${digits.slice(1)}`, `92${digits.slice(1)}`, digits);
      }
      query.$or.push({ phone: { $in: Array.from(new Set(phoneVars)) } });
    }
    const reservations = await Reservation.find(query).sort({ date: 1, time: 1, createdAt: -1 });
    res.json(reservations);
  } catch (err) {
    console.error('Failed to fetch reservations for customer:', req.customer.id, err);
    res.status(500).json({ error: 'Failed to fetch your reservations.' });
  }
});

// Admin reservation list.
router.get('/', adminAuth, async (req, res) => {
  try {
    const query = req.query.status ? { status: req.query.status } : {};
    await addBranchScope(query, resolveBranchId(req.admin, req.query));
    const reservations = await Reservation.find(query).sort({ date: 1, time: 1, createdAt: -1 });
    res.json(reservations);
  } catch {
    res.status(500).json({ error: 'Failed to fetch reservations.' });
  }
});

// Admin confirmation, table assignment, or status update.
router.put('/:id', adminAuth, async (req, res) => {
  try {
    const { status, tableNumber } = req.body;
    const validStatuses = ['pending', 'confirmed', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid reservation status.' });
    const table = typeof tableNumber === 'string' ? tableNumber.trim() : '';
    if (status === 'confirmed' && !table) return res.status(400).json({ error: 'Assign a table before confirming this reservation.' });

    const query = { _id: req.params.id };
    const branchId = resolveBranchId(req.admin, req.query);
    await addBranchScope(query, branchId);
    const previous = await Reservation.findOne(query);
    if (!previous) return res.status(404).json({ error: 'Reservation not found.' });

    if (status === 'confirmed') {
      const date = previous.date;
      const time = previous.time;
      const conflict = await hasConfirmedConflict(table, date, time, previous._id, branchId);
      if (conflict) {
        return res.status(409).json({
          error: `Table ${table} already has another confirmed booking around ${time} on ${date}. Choose a different table or time.`
        });
      }
    }

    const reservation = await Reservation.findOneAndUpdate(query, { status, tableNumber: table }, { new: true, runValidators: true });
    if (!reservation) return res.status(404).json({ error: 'Reservation not found.' });

    notifyReservation(reservation, status).catch(e => console.warn('[Reservation Notify Error]', e.message));

    res.json(reservation);
  } catch {
    res.status(500).json({ error: 'Failed to update reservation.' });
  }
});

module.exports = router;
