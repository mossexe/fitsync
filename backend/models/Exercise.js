const mongoose = require('mongoose');

/**
 * Exercise Library — pre-defined exercises users can pick from (like Hevy)
 * Stored in MongoDB as a reference collection
 */
const exerciseLibrarySchema = new mongoose.Schema({
  name:         { type: String, required: true, unique: true },
  muscle_group: { type: String, required: true, enum: [
    'Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps',
    'Legs', 'Glutes', 'Core', 'Cardio', 'Full Body'
  ]},
  equipment:    { type: String, enum: ['Barbell', 'Dumbbell', 'Machine', 'Bodyweight', 'Cable', 'Cardio'], default: 'Bodyweight' },
  difficulty:   { type: String, enum: ['Beginner', 'Intermediate', 'Advanced'], default: 'Intermediate' },
  description:  { type: String }
});

module.exports = mongoose.model('ExerciseLibrary', exerciseLibrarySchema);
