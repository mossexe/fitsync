/**
 * seed.js — populates MongoDB with sample users & workouts,
 *           then builds the Redis leaderboard from that data.
 *
 * Usage: node scripts/seed.js
 * (Run from /backend folder, with Mongo + Redis running)
 */

require('dotenv').config({ path: '../.env' });
const mongoose    = require('mongoose');
const bcrypt      = require('bcryptjs');
const { createClient } = require('redis');
const User    = require('../models/User');
const Workout = require('../models/Workout');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/fitsync';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const USERS = [
  { username: 'nadira_fit',  email: 'nadira@fitsync.dev',  password: 'pass123', profile: { age: 21, weight_kg: 55, height_cm: 162 } },
  { username: 'naufal_run',  email: 'naufal@fitsync.dev',  password: 'pass123', profile: { age: 22, weight_kg: 70, height_cm: 175 } },
  { username: 'syifa_yoga',  email: 'syifa@fitsync.dev',   password: 'pass123', profile: { age: 21, weight_kg: 52, height_cm: 160 } },
  { username: 'alex_lift',   email: 'alex@fitsync.dev',    password: 'pass123', profile: { age: 23, weight_kg: 80, height_cm: 180 } },
  { username: 'budi_cardio', email: 'budi@fitsync.dev',    password: 'pass123', profile: { age: 24, weight_kg: 75, height_cm: 172 } },
];

const EXERCISE_POOL = [
  { name: 'Bench Press',   sets: 3, reps: 10, weight_kg: 60 },
  { name: 'Squat',         sets: 4, reps: 8,  weight_kg: 80 },
  { name: 'Deadlift',      sets: 3, reps: 6,  weight_kg: 100 },
  { name: 'Pull-Up',       sets: 3, reps: 12, weight_kg: 0 },
  { name: 'Running 5km',   sets: 1, reps: 1,  weight_kg: 0 },
  { name: 'Plank',         sets: 3, reps: 1,  weight_kg: 0 },
  { name: 'Shoulder Press',sets: 3, reps: 10, weight_kg: 40 },
];

function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randomExercises() {
  const n = randomInt(2, 4);
  const shuffled = [...EXERCISE_POOL].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

async function seed() {
  await mongoose.connect(MONGO_URI);
  console.log('✅  MongoDB connected');

  const redis = createClient({ url: REDIS_URL });
  await redis.connect();
  console.log('✅  Redis connected');

  // Clear existing data
  await User.deleteMany({});
  await Workout.deleteMany({});
  await redis.del('leaderboard:streak');
  console.log('🗑   Cleared existing data');

  // Insert users
  const createdUsers = [];
  for (const u of USERS) {
    const password_hash = await bcrypt.hash(u.password, 10);
    const user = await User.create({ ...u, password_hash });
    createdUsers.push(user);
    console.log(`👤  Created user: ${user.username} (${user._id})`);
  }

  // Insert workouts (5–10 per user over the past 14 days)
  for (const user of createdUsers) {
    const numWorkouts = randomInt(5, 10);
    for (let i = 0; i < numWorkouts; i++) {
      const daysAgo = randomInt(0, 13);
      const date = new Date(Date.now() - daysAgo * 86400000);
      await Workout.create({
        user_id: user._id,
        date,
        duration_min:    randomInt(30, 90),
        calories_burned: randomInt(200, 600),
        exercises: randomExercises()
      });
    }

    // Build Redis leaderboard: streak = number of workouts as proxy
    await redis.zAdd('leaderboard:streak', { score: numWorkouts, value: user._id.toString() });
    console.log(`🏋️   ${user.username}: ${numWorkouts} workouts → streak=${numWorkouts} in Redis`);
  }

  console.log('\n✅  Seed complete!');
  console.log('\n📋  Test credentials (all passwords: pass123):');
  createdUsers.forEach(u => console.log(`   ${u.email}`));

  await mongoose.disconnect();
  await redis.quit();
}

seed().catch(err => { console.error(err); process.exit(1); });
