const router  = require('express').Router();
const Workout = require('../models/Workout');
const authMiddleware = require('../middleware/auth');

// GET /api/stats/weekly/:userId
// → checks Redis cache first; on miss, runs MongoDB aggregation
router.get('/weekly/:userId', authMiddleware, async (req, res) => {
  const { userId } = req.params;
  const cacheKey = `cache:weekly:${userId}`;

  try {
    // 1. Try Redis cache
    const cached = await req.redis.get(cacheKey);
    if (cached) {
      console.log(`[Redis] CACHE HIT for ${cacheKey}`);
      return res.json({ ...JSON.parse(cached), source: 'redis_cache' });
    }
    console.log(`[Redis] CACHE MISS for ${cacheKey} — querying MongoDB`);

    // 2. MongoDB aggregation pipeline
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const stats = await Workout.aggregate([
      { $match: { user_id: require('mongoose').Types.ObjectId.createFromHexString(userId),
                  date: { $gte: sevenDaysAgo } } },
      { $group: {
          _id: null,
          total_workouts:  { $sum: 1 },
          total_duration:  { $sum: '$duration_min' },
          total_calories:  { $sum: '$calories_burned' },
          avg_duration:    { $avg: '$duration_min' }
      }}
    ]);

    const result = stats[0] || {
      total_workouts: 0, total_duration: 0, total_calories: 0, avg_duration: 0
    };

    // 3. Cache in Redis for 5 minutes (TTL = 300s)
    await req.redis.setEx(cacheKey, 300, JSON.stringify(result));
    console.log(`[Redis] SET ${cacheKey} (TTL 300s)`);

    res.json({ ...result, source: 'mongodb' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
