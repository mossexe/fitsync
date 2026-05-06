const jwt = require('jsonwebtoken');

module.exports = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token provided' });

  const token = authHeader.split(' ')[1];
  const redis = req.app.locals.redis;

  try {
    // Check session in Redis first
    const session = await redis.get(`session:${token}`);
    if (!session) return res.status(401).json({ error: 'Session expired or invalid' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fitsync_secret_key');
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};
