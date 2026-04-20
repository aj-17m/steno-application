const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
    role         : { type: String, enum: ['admin', 'user'], default: 'user' },
    accessExpiry : { type: Date,   default: null },
    deviceId     : { type: String, default: null },
    activeToken       : { type: String, default: null },
    reAttemptCooldown : { type: Number, default: 0 },   // hours; 0 = no limit
  },
  { timestamps: true }
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

module.exports = mongoose.model('User', userSchema);
