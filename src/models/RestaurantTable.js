const mongoose = require('mongoose');

const restaurantTableSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
  tableNumber: { type: String, required: true, trim: true, uppercase: true },
  seats: { type: Number, required: true, min: 1, max: 30 },
  area: { type: String, enum: ['indoor', 'outdoor', 'main-dining', 'private-room'], default: 'indoor' },
  manualStatus: { type: String, enum: ['available', 'occupied', 'maintenance'], default: 'available' }
}, { timestamps: true });

restaurantTableSchema.index({ tenantId: 1, branchId: 1, tableNumber: 1 }, { unique: true });

module.exports = mongoose.model('RestaurantTable', restaurantTableSchema);
