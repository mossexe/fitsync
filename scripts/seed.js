/**
 * FitSync Seed Script
 * Run: node scripts/seed.js
 * Populates MongoDB with 3 sample users + workouts,
 * and seeds Redis leaderboard with streak scores.
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { createClient } = require('redis');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/fitsync';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

async function seed() {
  // Connect
  await mongoose.connect(MONGO_URI);
  console.log('✅ MongoDB connected');

  const redis = createClient({ url: REDIS_URL });
  await redis.connect();
  console.log('✅ Redis connected');

  // Lazy-load models (avoid duplicate compile errors)
  const User = require('../src/models/User');
  const Workout = require('../src/models/Workout');

  // Clear existing data
  await User.deleteMany({});
  await Workout.deleteMany({});
  await redis.del('leaderboard');
  console.log('🗑️  Cleared existing data');

  // Create users
  const users = await User.insertMany([
    { username: 'nadira', email: 'nadira@fitsync.com', password_hash: await bcrypt.hash('password123', 10), profile: { age: 21, weight_kg: 55, height_cm: 162 } },
    { username: 'naufal', email: 'naufal@fitsync.com', password_hash: await bcrypt.hash('password123', 10), profile: { age: 22, weight_kg: 72, height_cm: 175 } },
    { username: 'syifa',  email: 'syifa@fitsync.com',  password_hash: await bcrypt.hash('password123', 10), profile: { age: 21, weight_kg: 52, height_cm: 160 } },
  ]);
  console.log('👤 Created 3 users:', users.map(u => u.username).join(', '));

  // Create workouts
  const now = new Date();
  const daysAgo = d => new Date(now - d * 86400000);

  await Workout.insertMany([
    // nadira — 5 workouts
    { user_id: users[0]._id, date: daysAgo(0), duration_min: 45, calories_burned: 320, exercises: [{ name: 'Running', sets: 1, reps: 1, weight_kg: 0 }, { name: 'Plank', sets: 3, reps: 1, weight_kg: 0 }] },
    { user_id: users[0]._id, date: daysAgo(1), duration_min: 30, calories_burned: 200, exercises: [{ name: 'Cycling', sets: 1, reps: 1, weight_kg: 0 }] },
    { user_id: users[0]._id, date: daysAgo(2), duration_min: 60, calories_burned: 450, exercises: [{ name: 'Squats', sets: 4, reps: 12, weight_kg: 40 }, { name: 'Lunges', sets: 3, reps: 10, weight_kg: 20 }] },
    { user_id: users[0]._id, date: daysAgo(4), duration_min: 40, calories_burned: 280, exercises: [{ name: 'Bench Press', sets: 3, reps: 10, weight_kg: 50 }] },
    { user_id: users[0]._id, date: daysAgo(5), duration_min: 35, calories_burned: 250, exercises: [{ name: 'Pull-ups', sets: 3, reps: 8, weight_kg: 0 }] },
    // naufal — 7 workouts
    { user_id: users[1]._id, date: daysAgo(0), duration_min: 60, calories_burned: 500, exercises: [{ name: 'Deadlift', sets: 4, reps: 6, weight_kg: 100 }] },
    { user_id: users[1]._id, date: daysAgo(1), duration_min: 45, calories_burned: 380, exercises: [{ name: 'Bench Press', sets: 4, reps: 8, weight_kg: 70 }] },
    { user_id: users[1]._id, date: daysAgo(2), duration_min: 50, calories_burned: 420, exercises: [{ name: 'Squats', sets: 5, reps: 5, weight_kg: 90 }] },
    { user_id: users[1]._id, date: daysAgo(3), duration_min: 30, calories_burned: 220, exercises: [{ name: 'Running', sets: 1, reps: 1, weight_kg: 0 }] },
    { user_id: users[1]._id, date: daysAgo(4), duration_min: 40, calories_burned: 300, exercises: [{ name: 'OHP', sets: 3, reps: 8, weight_kg: 50 }] },
    { user_id: users[1]._id, date: daysAgo(5), duration_min: 55, calories_burned: 460, exercises: [{ name: 'Pull-ups', sets: 4, reps: 10, weight_kg: 0 }] },
    { user_id: users[1]._id, date: daysAgo(6), duration_min: 35, calories_burned: 260, exercises: [{ name: 'Cycling', sets: 1, reps: 1, weight_kg: 0 }] },
    // syifa — 3 workouts
    { user_id: users[2]._id, date: daysAgo(0), duration_min: 30, calories_burned: 180, exercises: [{ name: 'Yoga', sets: 1, reps: 1, weight_kg: 0 }] },
    { user_id: users[2]._id, date: daysAgo(1), duration_min: 25, calories_burned: 150, exercises: [{ name: 'Stretching', sets: 1, reps: 1, weight_kg: 0 }] },
    { user_id: users[2]._id, date: daysAgo(3), duration_min: 40, calories_burned: 270, exercises: [{ name: 'Running', sets: 1, reps: 1, weight_kg: 0 }] },
  ]);
  console.log('🏋️  Created 15 workouts');

  // Seed Redis leaderboard (streak scores)
  await redis.zAdd('leaderboard', [
    { score: 7, value: users[1]._id.toString() }, // naufal — 7 day streak
    { score: 5, value: users[0]._id.toString() }, // nadira — 5 day streak
    { score: 3, value: users[2]._id.toString() }, // syifa  — 3 day streak
  ]);
  console.log('🏆 Seeded Redis leaderboard');

  // Print leaderboard
  const lb = await redis.zRangeWithScores('leaderboard', 0, -1, { REV: true });
  const names = { [users[0]._id.toString()]: 'nadira', [users[1]._id.toString()]: 'naufal', [users[2]._id.toString()]: 'syifa' };
  console.log('\n📊 Redis Leaderboard (ZRANGE leaderboard 0 -1 REV WITHSCORES):');
  lb.forEach((e, i) => console.log(`  ${i+1}. ${names[e.value]} — streak: ${e.score} days`));

  console.log('\n✅ Seed complete!');
  await mongoose.disconnect();
  await redis.quit();
}

seed().catch(err => { console.error(err); process.exit(1); });
