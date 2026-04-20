const express = require('express');
const Review  = require('../models/Review');

const router = express.Router();

// ─── PUBLIC: fetch all active reviews (no auth required) ─────────────────────
router.get('/', async (req, res) => {
  try {
    const reviews = await Review.find({ isActive: true })
      .select('name role avatarColor stars reviewHi reviewEn')
      .sort({ order: 1, createdAt: 1 });
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
