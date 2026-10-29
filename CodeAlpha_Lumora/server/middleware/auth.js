const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');

module.exports = async function protect(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
    if (!token) return res.status(401).json({ message: 'Please log in to continue' });

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      // token galat, expire ya tampered
      return res.status(401).json({ message: 'Session expired, please log in again' });
    }

    // payload.id valid ObjectId na ho to findById CastError deta
    if (!payload || !mongoose.isValidObjectId(payload.id)) {
      return res.status(401).json({ message: 'Session expired, please log in again' });
    }

    const user = await User.findById(payload.id).select('_id');
    if (!user) return res.status(401).json({ message: 'Account no longer exists' });

    req.userId = user._id.toString();
    next();
  } catch (err) {
    // DB down ya koi aur server error: 401 nahi, 500 do (next se error handler chalega)
    next(err);
  }
};
