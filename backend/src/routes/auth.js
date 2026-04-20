const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { email, password, deviceId } = req.body;
  if (!email || !password)
    return res.status(400).json({ message: 'Email and password required' });
  if (!deviceId)
    return res.status(400).json({ message: 'Device ID required' });

  const user = await User.findOne({ email });
  if (!user) return res.status(401).json({ message: 'Invalid credentials' });

  const match = await user.comparePassword(password);
  if (!match) return res.status(401).json({ message: 'Invalid credentials' });

  // Admins are not restricted to a single device
  if (user.role !== 'admin') {
    if (user.deviceId && user.deviceId !== deviceId) {
      return res.status(403).json({ message: 'Account already used on another device. Contact admin to reset.' });
    }
  }

  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

  // Persist deviceId (first login) and active token
  await User.findByIdAndUpdate(user._id, {
    activeToken: token,
    ...(user.role !== 'admin' && !user.deviceId ? { deviceId } : {}),
  });

  res.json({
    token,
    user: { id: user._id, name: user.name, email: user.email, role: user.role },
  });
});

router.get('/me', authenticate, (req, res) => {
  // Only return fields the frontend legitimately needs — never expose tokens or device fingerprints
  res.json({
    user: {
      id  : req.user._id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
    },
  });
});

module.exports = router;
