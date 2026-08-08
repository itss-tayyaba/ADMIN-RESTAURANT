const express = require('express');
const jwt = require('jsonwebtoken');
const RestaurantTable = require('../models/RestaurantTable');
const Reservation = require('../models/Reservation');
const router = express.Router();

function adminAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return res.status(401).json({ error: 'No token provided' });
  try {
    const admin = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
    if (admin.role !== 'admin') return res.status(403).json({ error: 'Admin access only.' });
    next();
  } catch { res.status(401).json({ error: 'Invalid token' }); }
}

async function tablesWithLiveStatus() {
  const [tables, reserved] = await Promise.all([
    RestaurantTable.find({}).sort({ tableNumber: 1 }),
    Reservation.find({ tableNumber: { $ne: '' }, status: { $in: ['pending', 'confirmed'] } }).select('tableNumber')
  ]);
  const reservedTables = new Set(reserved.map(r => r.tableNumber));
  return tables.map(table => ({
    ...table.toObject(),
    status: reservedTables.has(table.tableNumber) ? 'reserved' : table.manualStatus
  }));
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
    if (!tableNumber || !Number.isInteger(seats) || seats < 1 || seats > 30 || !['indoor', 'outdoor'].includes(area)) return res.status(400).json({ error: 'Enter a table number, area, and seat count.' });
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
    if (!tableNumber || !Number.isInteger(seats) || seats < 1 || seats > 30 || !['indoor', 'outdoor'].includes(area)) return res.status(400).json({ error: 'Enter a table number, area, and seat count.' });
    const table = await RestaurantTable.findByIdAndUpdate(req.params.id, { tableNumber, seats, area }, { new: true, runValidators: true, context: 'query' });
    if (!table) return res.status(404).json({ error: 'Table not found.' });
    res.json(table);
  } catch (err) {
    res.status(err.code === 11000 ? 409 : 500).json({ error: err.code === 11000 ? 'That table number already exists.' : 'Failed to update table.' });
  }
});

module.exports = router;
