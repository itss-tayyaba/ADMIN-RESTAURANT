const mongoose = require('mongoose');

const restaurantTableSchema = new mongoose.Schema({
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
  tableNumber: { type: String, required: true, trim: true, uppercase: true },
  seats: { type: Number, required: true, min: 1, max: 30 },
  area: { type: String, enum: ['indoor', 'outdoor', 'main-dining', 'private-room'], default: 'indoor' },
  manualStatus: { type: String, enum: ['available', 'occupied', 'maintenance'], default: 'available' }
}, { timestamps: true });

// T-01 can exist once per branch, but never twice in the same branch.
restaurantTableSchema.index({ branchId: 1, tableNumber: 1 }, { unique: true });

module.exports = mongoose.model('RestaurantTable', restaurantTableSchema);
