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



module.exports = router;
