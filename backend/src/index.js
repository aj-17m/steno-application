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

app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.use('/api/auth',    authRoutes);
app.use('/api/admin',  adminRoutes);
app.use('/api/user',   userRoutes);
app.use('/api/reviews', reviewRoutes);   // public — no auth

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB connected');
    app.listen(process.env.PORT, () =>
      console.log(`Server running on port ${process.env.PORT}`)
    );
  })
  .catch((err) => console.error('MongoDB connection error:', err));
