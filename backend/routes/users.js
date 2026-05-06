const router = require('express').Router();
const User   = require('../models/User');
const Workout = require('../models/Workout');
const authMiddleware = require('../middleware/auth');

// GET /api/users/profile — get current user's profile
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password_hash');
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Get streak from Redis
    const streak = await req.redis.zScore('leaderboard:streak', req.user.userId.toString());

    res.json({ user, streak: streak || 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/users/profile — update profile
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { profile } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user.userId,
      { profile },
      { new: true }
    ).select('-password_hash');

    res.json({ message: 'Profile updated', user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/users/history — paginated workout history
router.get('/history', authMiddleware, async (req, res) => {
  try {
    const page  = parseInt(req.query.page)  || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip  = (page - 1) * limit;

    const [workouts, total] = await Promise.all([
      Workout.find({ user_id: req.user.userId })
        .sort({ date: -1 })
        .skip(skip)
        .limit(limit),
      Workout.countDocuments({ user_id: req.user.userId })
    ]);

    res.json({
      workouts,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/users/personal-records — best lifts per exercise
router.get('/personal-records', authMiddleware, async (req, res) => {
  const cacheKey = `cache:pr:${req.user.userId}`;
  try {
    // Check cache
    const cached = await req.redis.get(cacheKey);
    if (cached) {
      return res.json({ source: 'redis_cache', records: JSON.parse(cached) });
    }

    // MongoDB aggregation — best weight per exercise
    const records = await Workout.aggregate([
      { $match: { user_id: require('mongoose').Types.ObjectId.createFromHexString(req.user.userId.toString()) } },
      { $unwind: '$exercises' },
      { $group: {
          _id: '$exercises.name',
          best_weight_kg: { $max: '$exercises.weight_kg' },
          best_reps:      { $max: '$exercises.reps' },
          total_sets:     { $sum: '$exercises.sets' }
      }},
      { $sort: { _id: 1 } }
    ]);

    // Cache for 5 minutes
    await req.redis.setEx(cacheKey, 300, JSON.stringify(records));

    res.json({ source: 'mongodb', records });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
