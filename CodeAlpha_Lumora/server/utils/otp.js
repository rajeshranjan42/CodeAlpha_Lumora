const crypto = require('crypto');
const Otp = require('../models/Otp');

const MINUTES = Number(process.env.OTP_MINUTES) || 10;
const RESEND_SECONDS = 60;
const MAX_ATTEMPTS = 5;

const hash = (email, code) =>
  crypto.createHmac('sha256', process.env.JWT_SECRET).update(`${email}:${code}`).digest('hex');

/** Creates a fresh 6-digit code. Returns { code } or { wait } (seconds) when asked again too soon. */
exports.issue = async (email) => {
  const existing = await Otp.findOne({ email });
  if (existing) {
    const wait = RESEND_SECONDS - Math.floor((Date.now() - existing.sentAt.getTime()) / 1000);
    if (wait > 0) return { wait };
  }
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  await Otp.findOneAndUpdate(
    { email },
    { codeHash: hash(email, code), attempts: 0, sentAt: new Date(), expiresAt: new Date(Date.now() + MINUTES * 60 * 1000) },
    { upsert: true, new: true }
  );
  return { code };
};

/** Returns 'ok' | 'wrong' | 'expired' | 'locked'. A code works once. */
exports.check = async (email, code) => {
  const rec = await Otp.findOne({ email });
  if (!rec || rec.expiresAt < new Date()) return 'expired';
  if (rec.attempts >= MAX_ATTEMPTS) {
    await Otp.deleteOne({ _id: rec._id });
    return 'locked';
  }
  const a = Buffer.from(rec.codeHash, 'hex');
  const b = Buffer.from(hash(email, String(code)), 'hex');
  if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
    await Otp.deleteOne({ _id: rec._id });
    return 'ok';
  }
  rec.attempts += 1;
  await rec.save();
  return 'wrong';
};

exports.discard = (email) => Otp.deleteOne({ email });