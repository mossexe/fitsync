const mongoose = require('mongoose');

const exerciseSchema = new mongoose.Schema({
  name:      { type: String, required: true },
  sets:      { type: Number },
  reps:      { type: Number },
  weight_kg: { type: Number }
}, { _id: false });

const workoutSchema = new mongoose.Schema({
  user_id:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date:            { type: Date, default: Date.now },
  duration_min:    { type: Number, required: true },
  calories_burned: { type: Number, required: true },
  exercises:       [exerciseSchema]
});

module.exports = mongoose.model('Workout', workoutSchema);
