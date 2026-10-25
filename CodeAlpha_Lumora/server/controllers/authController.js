const User = require('../models/User');
const { signToken, formatUser } = require('../utils/helpers');

const USERNAME_RE = /^[a-z0-9_.]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const B64_RE = /^[A-Za-z0-9+/=]+$/;

/** Validates the E2EE key material sent by the browser. Returns clean data or null. */
function parseKeys(body) {
  const { publicKey, keyBackup } = body || {};
  if (typeof publicKey !== 'string' || publicKey.length > 600 || !keyBackup || typeof keyBackup !== 'object')
    return null;
  try {
    const j = JSON.parse(publicKey);
    if (j.kty !== 'EC' || j.crv !== 'P-256' || typeof j.x !== 'string' || typeof j.y !== 'string') return null;
  } catch {
    return null;
  }
  const { salt, iv, data, iterations } = keyBackup;
  const okB64 = (s) => typeof s === 'string' && s.length <= 4096 && B64_RE.test(s);
  if (![salt, iv, data].every(okB64)) return null;
  if (!Number.isInteger(iterations) || iterations < 100000 || iterations > 2000000) return null;
  return { publicKey, keyBackup: { salt, iv, data, iterations } };
}

const otp = require('../utils/otp');
const { sendOtp } = require('../utils/mailer');

const OTP_RE = /^\d{6}$/;
// every login needs an emailed code unless LOGIN_OTP=false; the seeded @lumora.demo accounts are exempt
const loginNeedsOtp = (user) =>
  !user.emailVerified || (process.env.LOGIN_OTP !== 'false' && !/@lumora\.demo$/.test(user.email));

/** Issues a code and emails it. Returns the seconds to wait if one was just sent. */
async function sendCode(user) {
  const r = await otp.issue(user.email);
  if (r.wait) return r.wait;
  try {
    await sendOtp(user.email, r.code, user.name);
  } catch (err) {
    await otp.discard(user.email);
    console.error('✉  Could not send verification email:', err.message);
    const e = new Error('We couldn’t send the verification email right now. Please try again in a moment.');
    e.status = 502;
    throw e;
  }
  return 0;
}

const pending = (email, wait) => ({
  needsVerification: true,
  email,
  resendIn: wait || 60,
  message: `We sent a 6-digit code to ${email}`,
});

/** Same payload a successful login always returns. */
function session(user) {
  const kb = user.keyBackup;
  const keys =
    user.publicKey && kb
      ? { publicKey: user.publicKey, backup: { salt: kb.salt, iv: kb.iv, data: kb.data, iterations: kb.iterations } }
      : null; // null = account from before E2EE; the browser will create keys now
  return { token: signToken(user._id), user: formatUser(user, user._id.toString(), { email: user.email }), keys };
}

exports.register = async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    const username = String(req.body.username || '').trim().toLowerCase();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (!name || name.length > 50) return res.status(400).json({ message: 'Please enter your name (max 50 characters)' });
    if (!USERNAME_RE.test(username))
      return res.status(400).json({ message: 'Username must be 3–20 characters: letters, numbers, dot or underscore' });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ message: 'Please enter a valid email' });
    if (password.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' });

    const byEmail = await User.findOne({ email });
    if (byEmail && byEmail.emailVerified) return res.status(409).json({ message: 'That email is already registered' });

    const byName = await User.findOne({ username });
    if (byName && (!byEmail || !byName._id.equals(byEmail._id))) {
      if (byName.emailVerified) return res.status(409).json({ message: 'That username is already taken' });
      await User.deleteOne({ _id: byName._id }); // abandoned, never-verified sign-up
    }

    const keys = parseKeys(req.body); // optional here; the browser always sends them
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    let user;
    if (byEmail) {
      // they came back before verifying: refresh the pending account with what they just typed
      Object.assign(byEmail, { name, username, password, unverifiedExpiresAt: expires, ...(keys || {}) });
      user = await byEmail.save();
    } else {
      user = await User.create({ name, username, email, password, emailVerified: false, unverifiedExpiresAt: expires, ...(keys || {}) });
    }

    const wait = await sendCode(user);
    res.status(201).json(pending(email, wait));
  } catch (err) {
    next(err);
  }
};

exports.login = async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });

    const user = await User.findOne({ email }).select('+password +keyBackup');
    if (!user || !(await user.matchPassword(password)))
      return res.status(401).json({ message: 'Incorrect email or password' });

    // password is right — now prove the mailbox is yours
    if (loginNeedsOtp(user)) {
      const wait = await sendCode(user);
      return res.json(pending(email, wait));
    }
    res.json(session(user));
  } catch (err) {
    next(err);
  }
};

exports.verifyEmail = async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const code = String(req.body.code || '').trim();
    if (!EMAIL_RE.test(email) || !OTP_RE.test(code))
      return res.status(400).json({ message: 'Enter the 6-digit code from your email' });

    const result = await otp.check(email, code);
    if (result === 'wrong') return res.status(400).json({ message: 'That code isn’t right. Please check and try again.' });
    if (result === 'locked') return res.status(429).json({ message: 'Too many wrong attempts. Please request a new code.' });
    if (result !== 'ok') return res.status(400).json({ message: 'That code has expired. Please request a new one.' });

    const user = await User.findOne({ email }).select('+keyBackup');
    if (!user) return res.status(404).json({ message: 'Account not found' });
    if (!user.emailVerified) {
      user.emailVerified = true;
      user.unverifiedExpiresAt = undefined;
      await user.save();
    }
    res.json(session(user));
  } catch (err) {
    next(err);
  }
};

exports.resendOtp = async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return res.status(400).json({ message: 'Please enter a valid email' });
    const user = await User.findOne({ email });
    // same answer whether or not the account exists, so emails can't be probed
    if (!user) return res.json({ ok: true, resendIn: 60 });
    const wait = await sendCode(user);
    if (wait) return res.status(429).json({ message: `Please wait ${wait}s before asking for another code`, resendIn: wait });
    res.json({ ok: true, resendIn: 60 });
  } catch (err) {
    next(err);
  }
};

exports.me = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ user: formatUser(user, req.userId, { email: user.email }) });
  } catch (err) {
    next(err);
  }
};

/** One-time key setup for accounts created before E2EE existed. Never overwrites existing keys. */
exports.setKeys = async (req, res, next) => {
  try {
    const keys = parseKeys(req.body);
    if (!keys) return res.status(400).json({ message: 'Invalid encryption keys' });
    const r = await User.updateOne(
      { _id: req.userId, $or: [{ publicKey: '' }, { publicKey: { $exists: false } }] },
      { $set: keys }
    );
    if (r.matchedCount === 0) return res.status(409).json({ message: 'Encryption keys are already set up' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};