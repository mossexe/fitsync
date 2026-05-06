const jwt = require('jsonwebtoken');

module.exports = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'No token provided' });

  const token = header.split(' ')[1];

  // Check Redis session first (fast path)
  try {
    const cached = await req.redis.get(`session:${token}`);
    if (cached) {
      req.user = JSON.parse(cached);
      return next();
    }
  } catch (_) { /* fall through to JWT verify */ }

  // Verify JWT
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fitsync_secret_key');
    req.user = decoded;

    // Cache session in Redis for 1 hour
    await req.redis.setEx(`session:${token}`, 3600, JSON.stringify(decoded));
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};
