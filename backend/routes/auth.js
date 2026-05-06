const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const User    = require('../models/User');

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, profile } = req.body;
    const password_hash = await bcrypt.hash(password, 10);
    const user = await User.create({ username, email, password_hash, profile });
    res.status(201).json({ message: 'User registered', userId: user._id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Verify credentials in MongoDB
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    // 2. Issue JWT
    const token = jwt.sign(
      { userId: user._id, username: user.username },
      process.env.JWT_SECRET || 'fitsync_secret_key',
      { expiresIn: '1h' }
    );

    // 3. Store session token in Redis (TTL = 3600s)
    await req.redis.setEx(`session:${token}`, 3600, JSON.stringify({ userId: user._id, username: user.username }));
    console.log(`[Redis] SET session:${token.slice(0,20)}... (TTL 3600s)`);

    res.json({ token, username: user.username });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
