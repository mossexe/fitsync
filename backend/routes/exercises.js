const router   = require('express').Router();
const Exercise = require('../models/Exercise');
const authMiddleware = require('../middleware/auth');

// GET /api/exercises
// Returns full exercise library — cached in Redis for 10 minutes
router.get('/', async (req, res) => {
  const cacheKey = 'cache:exercises';
  try {
    // 1. Check Redis cache
    const cached = await req.redis.get(cacheKey);
    if (cached) {
      console.log('[Redis] CACHE HIT cache:exercises');
      return res.json({ source: 'redis_cache', exercises: JSON.parse(cached) });
    }

    // 2. Fetch from MongoDB
    const exercises = await Exercise.find().sort({ muscle_group: 1, name: 1 });
    console.log(`[MongoDB] Fetched ${exercises.length} exercises`);

    // 3. Cache for 10 minutes (exercise library rarely changes)
    await req.redis.setEx(cacheKey, 600, JSON.stringify(exercises));
    console.log('[Redis] SET cache:exercises (TTL 600s)');

    res.json({ source: 'mongodb', exercises });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



module.exports = router;
