const express = require('express');
const mongoose = require('mongoose');
const Workout = require('../models/Workout');
const authMiddleware = require('../middleware/auth');
const router = express.Router();

// GET /api/stats/weekly/:userId
// Cache-aside pattern:
//   1. Check Redis cache (cache:weekly:<userId>) — TTL 300s
//   2. Cache HIT  → return immediately (Redis)
//   3. Cache MISS → MongoDB aggregation pipeline → store in Redis → return
router.get('/weekly/:userId', authMiddleware, async (req, res) => {
  const { userId } = req.params;
  const redis = req.app.locals.redis;
  const cacheKey = `cache:weekly:${userId}`;

  try {
    // 1. Check Redis cache
    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.json({
        source: 'Redis cache (HIT)',
        cache_key: cacheKey,
        ttl_remaining_s: await redis.ttl(cacheKey),
        stats: JSON.parse(cached)
      });
    }

    // 2. Cache MISS — run MongoDB aggregation pipeline
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const pipeline = [
      { $match: { user_id: new mongoose.Types.ObjectId(userId), date: { $gte: oneWeekAgo } } },
      { $group: {
          _id: null,
          total_workouts:  { $sum: 1 },
          total_minutes:   { $sum: '$duration_min' },
          total_calories:  { $sum: '$calories_burned' },
          avg_duration:    { $avg: '$duration_min' }
      }}
    ];
    const result = await Workout.aggregate(pipeline);
    const stats = result[0] || {
      total_workouts: 0, total_minutes: 0, total_calories: 0, avg_duration: 0
    };
    delete stats._id;

    // 3. Store in Redis with 5-minute TTL
    await redis.setEx(cacheKey, 300, JSON.stringify(stats));

    res.json({
      source: 'MongoDB aggregation (cache MISS — now cached)',
      cache_key: cacheKey,
      ttl_s: 300,
      stats
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
