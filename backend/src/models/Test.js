const mongoose = require('mongoose');

const testSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    pdfPath: { type: String, default: null },
    extractedText: { type: String, required: true }, // master passage
    audioPath: { type: String, required: true },
    audioType: { type: String, enum: ['generated', 'uploaded'], default: 'generated' },
    isActive: { type: Boolean, default: true },
    maxReplays: { type: Number, default: 2 },
    timer: { type: Number, default: 30 },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Test', testSchema);
