const mongoose = require('mongoose');

/** One browser/device that agreed to get push notifications. A user can have several (phone, laptop…). */
const pushSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    endpoint: { type: String, required: true, unique: true },
    keys: { p256dh: { type: String, required: true }, auth: { type: String, required: true } },
    userAgent: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PushSubscription', pushSchema);