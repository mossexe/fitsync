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

// GET /api/exercises?muscle_group=Chest
// Filter by muscle group
router.get('/filter', async (req, res) => {
  const { muscle_group, equipment, difficulty } = req.query;
  const filter = {};
  if (muscle_group) filter.muscle_group = muscle_group;
  if (equipment)    filter.equipment    = equipment;
  if (difficulty)   filter.difficulty   = difficulty;

  try {
    const exercises = await Exercise.find(filter).sort({ name: 1 });
    res.json({ exercises, count: exercises.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/exercises — add a custom exercise (authenticated)
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, muscle_group, equipment, difficulty, description } = req.body;
    const exercise = await Exercise.create({ name, muscle_group, equipment, difficulty, description });

    // Invalidate exercise cache
    await req.redis.del('cache:exercises');
    console.log('[Redis] DEL cache:exercises (new exercise added)');

    res.status(201).json({ message: 'Exercise added', exercise });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
