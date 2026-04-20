// Run: node seed.js
// Creates an admin user for first-time setup
const mongoose = require('mongoose');
const User = require('./src/models/User');
require('dotenv').config();

async function seed() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  const existing = await User.findOne({ email: 'admin@steno.com' });
  if (existing) {
    console.log('Admin already exists: admin@steno.com');
  } else {
    await User.create({
      name: 'Admin',
      email: 'admin@steno.com',
      password: 'admin123',
      role: 'admin',
    });
    console.log('Admin created: admin@steno.com / admin123');
  }

  await mongoose.disconnect();
}

seed().catch(console.error);
