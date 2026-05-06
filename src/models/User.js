const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email:    { type: String, required: true, unique: true },
  password_hash: { type: String, required: true },
  created_at: { type: Date, default: Date.now },
  profile: {
    age:        { type: Number },
    weight_kg:  { type: Number },
    height_cm:  { type: Number }
  }
});

module.exports = mongoose.model('User', userSchema);
