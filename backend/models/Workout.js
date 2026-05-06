const mongoose = require('mongoose');

const exerciseSchema = new mongoose.Schema({
  name:      { type: String, required: true },
  sets:      { type: Number, required: true },
  reps:      { type: Number, required: true },
  weight_kg: { type: Number, default: 0 }
}, { _id: false });

const workoutSchema = new mongoose.Schema({
  user_id:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date:            { type: Date, default: Date.now },
  duration_min:    { type: Number, required: true },
  calories_burned: { type: Number, required: true },
  exercises:       [exerciseSchema]
});

// Index for fast per-user queries
workoutSchema.index({ user_id: 1, date: -1 });

module.exports = mongoose.model('Workout', workoutSchema);
