require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { createClient } = require('redis');

const authRoutes = require('./routes/auth');
const workoutRoutes = require('./routes/workouts');
const leaderboardRoutes = require('./routes/leaderboard');
const statsRoutes = require('./routes/stats');

const app = express();
app.use(cors());
app.use(express.json());

// ── MongoDB ──────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/fitsync')
  .then(() => console.log('✅  MongoDB connected'))
  .catch(err => console.error('❌  MongoDB error:', err));

// ── Redis ─────────────────────────────────────────────────
const redisClient = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
redisClient.connect()
  .then(() => console.log('✅  Redis connected'))
  .catch(err => console.error('❌  Redis error:', err));

// Attach redis client to every request
app.use((req, _res, next) => { req.redis = redisClient; next(); });

// ── Routes ────────────────────────────────────────────────
app.use('/api/auth',        authRoutes);
app.use('/api/workouts',    workoutRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/stats',       statsRoutes);

app.get('/', (_req, res) => res.json({ message: 'FitSync API running 🏋️' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀  API listening on port ${PORT}`));

module.exports = { redisClient };
