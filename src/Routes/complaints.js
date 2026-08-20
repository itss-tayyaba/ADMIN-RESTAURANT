const express = require('express');
const router = express.Router();
const Complaint = require('../models/Complaint');
const Customer = require('../models/Customer');
const jwt = require('jsonwebtoken');
const { customerAuth } = require('./customerAuth');
const { isAdminRole } = require('../utils/branchScope');

// Middleware: verify admin JWT
function adminAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  try {
    const decoded = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
    if (!isAdminRole(decoded.role)) {
      return res.status(403).json({ error: 'Admin access only.' });
    }
    req.admin = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// POST /api/complaints — submit a complaint (requires a logged-in customer account)
router.post('/', customerAuth, async (req, res) => {
  try {
    const { orderNumber, subject, message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Please describe the issue' });
    }

    const customer = await Customer.findById(req.customer.id);
    if (!customer) return res.status(401).json({ error: 'Account not found. Please log in again.' });

    const complaint = new Complaint({
      customer: customer._id,
      customerName: customer.name,
      customerPhone: customer.phone,
      customerEmail: customer.email || '',
      orderNumber: orderNumber || '',
      subject: subject || 'General',
      message: message.trim()
    });

    await complaint.save();
    res.status(201).json(complaint);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to submit complaint' });
  }
});

// GET /api/complaints/mine/list — the logged-in customer's own complaints,
// including the admin's status/response
router.get('/mine/list', customerAuth, async (req, res) => {
  try {
    const complaints = await Complaint.find({ customer: req.customer.id }).sort({ createdAt: -1 });
    res.json(complaints);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch your complaints' });
  }
});

// GET /api/complaints/stats/summary — counts by status (admin only)
router.get('/stats/summary', adminAuth, async (req, res) => {
  try {
    const all = await Complaint.find({});
    res.json({
      total: all.length,
      new: all.filter(c => c.status === 'new').length,
      inProgress: all.filter(c => c.status === 'in-progress').length,
      resolved: all.filter(c => c.status === 'resolved').length
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch complaint stats' });
  }
});

// GET /api/complaints — list all complaints (admin only)
router.get('/', adminAuth, async (req, res) => {
  try {
    const { status } = req.query;
    const query = status ? { status } : {};
    const complaints = await Complaint.find(query).sort({ createdAt: -1 });
    res.json(complaints);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch complaints' });
  }
});

// PUT /api/complaints/:id/status — update status / add admin note (admin only)
router.put('/:id/status', adminAuth, async (req, res) => {
  try {
    const { status, adminNote } = req.body;
    const valid = ['new', 'in-progress', 'resolved'];
    if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status' });

    const update = { status };
    if (typeof adminNote === 'string') update.adminNote = adminNote;

    const complaint = await Complaint.findByIdAndUpdate(req.params.id, { $set: update }, { new: true });
    if (!complaint) return res.status(404).json({ error: 'Complaint not found' });
    res.json(complaint);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update complaint' });
  }
});

// DELETE /api/complaints/:id — remove a complaint (admin only)
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const complaint = await Complaint.findByIdAndDelete(req.params.id);
    if (!complaint) return res.status(404).json({ error: 'Complaint not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete complaint' });
  }
});

module.exports = router;
