const express = require('express');
const User = require('../models/User');
const router = express.Router();

// GET /api/leaderboard
// Reads top 10 streak rankings directly from Redis Sorted Set (ZRANGE ... REV)
// No MongoDB query needed — Redis is the source of truth for rankings
router.get('/', async (req, res) => {
  try {
    const redis = req.app.locals.redis;

    // ZRANGE leaderboard 0 9 REV WITHSCORES — top 10 by streak (descending)
    const raw = await redis.zRangeWithScores('leaderboard', 0, 9, { REV: true });

    if (raw.length === 0) {
      return res.json({ message: 'No entries yet. Log a workout to appear on the leaderboard!', leaderboard: [] });
    }

    // Enrich with usernames from MongoDB
    const userIds = raw.map(e => e.value);
    const users = await User.find({ _id: { $in: userIds } }, 'username');
    const usernameMap = {};
    users.forEach(u => { usernameMap[u._id.toString()] = u.username; });

    const leaderboard = raw.map((entry, i) => ({
      rank: i + 1,
      userId: entry.value,
      username: usernameMap[entry.value] || 'Unknown',
      streak_days: entry.score
    }));

    res.json({
      source: 'Redis Sorted Set (ZRANGE leaderboard 0 9 REV WITHSCORES)',
      leaderboard
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
