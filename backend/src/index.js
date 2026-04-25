const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const authRoutes    = require('./routes/auth');
const adminRoutes   = require('./routes/admin');
const userRoutes    = require('./routes/user');
const reviewRoutes  = require('./routes/reviews');

const app = express();

// FRONTEND_URL = your Vercel frontend URL (set in Railway env vars)
const allowedOrigins = [
  'http://localhost:5173',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    // allow requests with no origin (mobile apps, curl, Postman)
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.use('/api/auth',    authRoutes);
app.use('/api/admin',   adminRoutes);
app.use('/api/user',    userRoutes);
app.use('/api/reviews', reviewRoutes);

// ── Public diagnostic endpoint (no auth) ─────────────────────────────────────
app.get('/api/health', async (req, res) => {
  const cloudinary = require('cloudinary').v2;
  let cloudinaryOk = false;
  let cloudinaryErr = null;
  try {
    await cloudinary.api.ping();
    cloudinaryOk = true;
  } catch (e) {
    cloudinaryErr = e.message;
  }
  res.json({
    server      : 'ok',
    cloudinary  : cloudinaryOk ? 'ok' : 'error',
    cloudinaryErr,
    cloud_name  : process.env.CLOUDINARY_CLOUD_NAME  || '(not set)',
    api_key     : process.env.CLOUDINARY_API_KEY     ? '✓ set' : '✗ missing',
    api_secret  : process.env.CLOUDINARY_API_SECRET  ? '✓ set' : '✗ missing',
  });
});

// Serve React build in production
if (process.env.NODE_ENV === 'production') {
  const clientBuild = path.join(__dirname, '../../frontend/dist');
  app.use(express.static(clientBuild));
  app.get('*', (req, res) =>
    res.sendFile(path.join(clientBuild, 'index.html'))
  );
}

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    const port = process.env.PORT || 5000;
    console.log('MongoDB connected');
    app.listen(port, () => console.log(`Server running on port ${port}`));
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });
