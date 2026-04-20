const jwt = require('jsonwebtoken');
const User = require('../models/User');

const authenticate = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }
  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select('-password');
    if (!req.user) return res.status(401).json({ message: 'User not found' });

    if (req.user.role !== 'admin') {
      // Check access expiry
      if (req.user.accessExpiry && new Date() > new Date(req.user.accessExpiry)) {
        return res.status(403).json({ message: 'Your access has expired. Please contact the administrator.', code: 'ACCESS_EXPIRED' });
      }

      // Check token matches the active session
      if (req.user.activeToken !== token) {
        return res.status(401).json({ message: 'Session expired. Please log in again.' });
      }

      // Check deviceId header matches stored deviceId
      const deviceId = req.headers['x-device-id'];
      if (req.user.deviceId && deviceId !== req.user.deviceId) {
        return res.status(403).json({ message: 'Device mismatch. Access denied.', code: 'DEVICE_MISMATCH' });
      }
    }

    next();
  } catch {
    res.status(401).json({ message: 'Invalid token' });
  }
};

const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
};

module.exports = { authenticate, requireAdmin };
