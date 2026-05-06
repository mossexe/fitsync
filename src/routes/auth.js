const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const router = express.Router();

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, profile } = req.body;
    const password_hash = await bcrypt.hash(password, 10);
    const user = await User.create({ username, email, password_hash, profile });
    res.status(201).json({ message: 'User registered', userId: user._id, username: user.username });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/auth/login
// 1. Validates credentials via MongoDB
// 2. Stores session token in Redis with 1-hour TTL (SETEX)
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { userId: user._id.toString(), username: user.username },
      process.env.JWT_SECRET || 'fitsync_secret_key',
      { expiresIn: '1h' }
    );

    // Store session in Redis — SETEX with 3600s TTL
    const redis = req.app.locals.redis;
    await redis.setEx(`session:${token}`, 3600, JSON.stringify({ userId: user._id, username: user.username }));

    res.json({
      message: 'Login successful',
      token,
      userId: user._id,
      username: user.username,
      redis_key: `session:${token.slice(0, 20)}...  [TTL: 3600s]`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
