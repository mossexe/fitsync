const router  = require('express').Router();
const Workout = require('../models/Workout');
const authMiddleware = require('../middleware/auth');

// POST /api/workouts  — log a new workout
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { duration_min, calories_burned, exercises } = req.body;
    const userId = req.user.userId;

    // 1. Persist workout to MongoDB
    const workout = await Workout.create({
      user_id: userId,
      duration_min,
      calories_burned,
      exercises
    });
    console.log(`[MongoDB] Inserted workout ${workout._id} for user ${userId}`);

    // 2. Update streak leaderboard in Redis (ZADD increments score)
    //    We use ZINCRBY so every new workout adds +1 streak day
    const newStreak = await req.redis.zIncrBy('leaderboard:streak', 1, userId.toString());
    console.log(`[Redis] ZINCRBY leaderboard:streak 1 ${userId} → streak=${newStreak}`);

    // 3. Invalidate weekly stats cache for this user
    await req.redis.del(`cache:weekly:${userId}`);
    console.log(`[Redis] DEL cache:weekly:${userId}`);

    res.status(201).json({ workout, streak: newStreak });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/workouts — get all workouts for the logged-in user
router.get('/', authMiddleware, async (req, res) => {
  try {
    const workouts = await Workout.find({ user_id: req.user.userId }).sort({ date: -1 });
    res.json(workouts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
