const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema(
  {
    name        : { type: String, required: true },
    description : { type: String, default: '' },
    icon        : { type: String, default: '📋' },   // emoji
    color       : { type: String, default: '#4f46e5' }, // hex accent
    instructions: { type: [String], default: [] },    // bullet lines shown during audio
    createdBy   : { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Category', categorySchema);
