const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    name        : { type: String, required: true, trim: true },
    role        : { type: String, default: '', trim: true },
    avatarColor : { type: String, default: '#6366f1' },
    stars       : { type: Number, default: 5, min: 1, max: 5 },
    reviewHi    : { type: String, required: true, trim: true },   // Hindi text
    reviewEn    : { type: String, default: '', trim: true },       // English translation
    isActive    : { type: Boolean, default: true },
    order       : { type: Number, default: 0 },
    createdBy   : { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Review', reviewSchema);
