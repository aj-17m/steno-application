const mongoose = require('mongoose');
const User = require('./src/models/User');
require('dotenv').config();

async function resetAdmin() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  await User.deleteOne({ email: 'admin@steno.com' });
  console.log('Old admin deleted');

  await User.create({
    name: 'Admin',
    email: 'admin@steno.com',
    password: 'admin123',
    role: 'admin',
  });
  console.log('Admin recreated with hashed password');

  await mongoose.disconnect();
  console.log('Done! Login with admin@steno.com / admin123');
}

resetAdmin().catch(console.error);
