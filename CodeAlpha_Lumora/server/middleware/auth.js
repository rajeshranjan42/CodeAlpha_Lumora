const jwt = require('jsonwebtoken');
const User = require('../models/User');

module.exports = async function protect(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ message: 'Please log in to continue' });

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.id).select('_id');
    if (!user) return res.status(401).json({ message: 'Account no longer exists' });

    req.userId = user._id.toString();
    next();
  } catch {
    res.status(401).json({ message: 'Session expired, please log in again' });
  }
};
