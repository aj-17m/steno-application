const mongoose = require('mongoose');

const resultSchema = new mongoose.Schema(
  {
    userId          : { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    testId          : { type: mongoose.Schema.Types.ObjectId, ref: 'Test', required: true },
    typedText       : { type: String, required: true },
    wordComparison  : { type: mongoose.Schema.Types.Mixed, default: [] },

    // ── Core scoring ────────────────────────────────────────────────
    accuracy        : { type: Number, default: 0 },
    wpm             : { type: Number, default: 0 },
    fullMistakes    : { type: Number, default: 0 },
    halfMistakes    : { type: Number, default: 0 },
    totalError      : { type: Number, default: 0 },
    errorPercentage : { type: Number, default: 0 },

    // ── Word counts ─────────────────────────────────────────────────
    totalWords      : { type: Number, default: 0 },   // words in master passage
    typedWords      : { type: Number, default: 0 },   // words actually typed
    correctWords    : { type: Number, default: 0 },   // words matched exactly
    wrongWords      : { type: Number, default: 0 },   // full + half + replace mistakes
    replaceErrors   : { type: Number, default: 0 },   // completely different word substitutions
    extraWords      : { type: Number, default: 0 },   // extra words typed (not in master)
    missingWords    : { type: Number, default: 0 },   // master words that were omitted

    // ── Meta ────────────────────────────────────────────────────────
    timeTaken       : { type: Number, default: 0 },
    pasteDetected   : { type: Boolean, default: false },
    analysisSummary : { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Result', resultSchema);
