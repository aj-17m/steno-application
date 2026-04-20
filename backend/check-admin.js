const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./src/models/User');
require('dotenv').config();

async function checkAdmin() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  const admin = await User.findOne({ email: 'admin@steno.com' });
  if (!admin) {
    console.log('❌ Admin not found in database!');
    await mongoose.disconnect();
    return;
  }

  console.log('✅ Admin found:', admin.email);
  console.log('   Role:', admin.role);
  console.log('   Password hash:', admin.password.substring(0, 20) + '...');

  const match = await bcrypt.compare('admin123', admin.password);
  console.log('   Password "admin123" matches:', match ? '✅ YES' : '❌ NO');

  await mongoose.disconnect();
}

checkAdmin().catch(console.error);
