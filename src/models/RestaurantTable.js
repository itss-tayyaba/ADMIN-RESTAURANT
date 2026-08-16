const mongoose = require('mongoose');

const restaurantTableSchema = new mongoose.Schema({
  tableNumber: { type: String, required: true, trim: true, uppercase: true, unique: true },
  seats: { type: Number, required: true, min: 1, max: 30 },
  area: { type: String, enum: ['indoor', 'outdoor', 'main-dining', 'private-room'], default: 'indoor' },
  manualStatus: { type: String, enum: ['available', 'occupied', 'maintenance'], default: 'available' }
}, { timestamps: true });

module.exports = mongoose.model('RestaurantTable', restaurantTableSchema);