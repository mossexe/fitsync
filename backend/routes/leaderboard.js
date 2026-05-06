const router = require('express').Router();
const User   = require('../models/User');

// GET /api/leaderboard — top 10 users by streak (served from Redis)
router.get('/', async (req, res) => {
  try {
    // Read top 10 from Redis Sorted Set (highest score first)
    const entries = await req.redis.zRangeWithScores('leaderboard:streak', 0, 9, { REV: true });
    console.log(`[Redis] ZRANGE leaderboard:streak 0 9 REV WITHSCORES → ${entries.length} entries`);

    if (entries.length === 0) {
      return res.json({ leaderboard: [], source: 'redis' });
    }

    // Enrich with usernames from MongoDB
    const userIds = entries.map(e => e.value);
    const users   = await User.find({ _id: { $in: userIds } }, 'username');
    const userMap = Object.fromEntries(users.map(u => [u._id.toString(), u.username]));

    const leaderboard = entries.map((e, i) => ({
      rank:     i + 1,
      userId:   e.value,
      username: userMap[e.value] || 'Unknown',
      streak:   e.score
    }));

    res.json({ leaderboard, source: 'redis' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
