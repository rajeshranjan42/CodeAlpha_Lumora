const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 50 },
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[a-z0-9_.]{3,20}$/, 'Username must be 3–20 characters: letters, numbers, dot or underscore'],
    },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6, select: false },
    // false until the emailed one-time code is entered (accounts from before this feature stay verified)
    emailVerified: { type: Boolean, default: true },
    // unverified sign-ups are deleted automatically after 24h; the field is removed once verified
    unverifiedExpiresAt: { type: Date, index: { expireAfterSeconds: 0 } },
    bio: { type: String, default: '', maxlength: 160 },
    avatar: { type: String, default: '' },
    // End-to-end encryption: the server only stores the PUBLIC key (JWK) and a private-key
    // backup that is encrypted in the browser with a key derived from the user's password.
    publicKey: { type: String, default: '' },
    keyBackup: {
      type: new mongoose.Schema(
        { salt: String, iv: String, data: String, iterations: Number },
        { _id: false }
      ),
      select: false,
    },
    followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.matchPassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

module.exports = mongoose.model('User', userSchema);