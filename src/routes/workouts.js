const express = require('express');
const Workout = require('../models/Workout');
const authMiddleware = require('../middleware/auth');
const router = express.Router();

// POST /api/workouts
// 1. Saves workout document to MongoDB
// 2. Updates user streak in Redis Sorted Set (ZADD)
// 3. Invalidates weekly stats cache
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { duration_min, calories_burned, exercises } = req.body;
    const userId = req.user.userId;
    const redis = req.app.locals.redis;

    // 1. Persist to MongoDB
    const workout = await Workout.create({
      user_id: userId,
      duration_min,
      calories_burned,
      exercises
    });

    // 2. Increment streak in Redis Sorted Set
    //    ZINCRBY leaderboard 1 <userId>
    await redis.zIncrBy('leaderboard', 1, userId);
    const newStreak = await redis.zScore('leaderboard', userId);

    // 3. Invalidate weekly cache for this user
    await redis.del(`cache:weekly:${userId}`);

    res.status(201).json({
      message: 'Workout logged',
      workout,
      redis: {
        leaderboard_updated: true,
        new_streak: newStreak,
        cache_invalidated: `cache:weekly:${userId}`
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/workouts
// Returns all workouts for the authenticated user from MongoDB
router.get('/', authMiddleware, async (req, res) => {
  try {
    const workouts = await Workout.find({ user_id: req.user.userId }).sort({ date: -1 });
    res.json({ count: workouts.length, workouts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
