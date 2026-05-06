const express = require('express');
const mongoose = require('mongoose');
const { createClient } = require('redis');

const authRoutes = require('./routes/auth');
const workoutRoutes = require('./routes/workouts');
const leaderboardRoutes = require('./routes/leaderboard');
const statsRoutes = require('./routes/stats');

const app = express();
app.use(express.json());

// --- MongoDB Connection ---
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/fitsync')
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err));

// --- Redis Connection ---
const redisClient = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
redisClient.connect()
  .then(() => console.log('✅ Redis connected'))
  .catch(err => console.error('❌ Redis error:', err));

// Make redis available to routes
app.locals.redis = redisClient;

// --- Routes ---
app.use('/api/auth', authRoutes);
app.use('/api/workouts', workoutRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/stats', statsRoutes);

app.get('/', (req, res) => {
  res.json({
    app: 'FitSync API',
    group: 'NAMO',
    databases: ['MongoDB (persistent store)', 'Redis (leaderboard, cache, sessions)'],
    endpoints: [
      'POST /api/auth/register',
      'POST /api/auth/login',
      'POST /api/workouts',
      'GET  /api/workouts',
      'GET  /api/leaderboard',
      'GET  /api/stats/weekly/:userId',
    ]
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 FitSync API running on port ${PORT}`));
