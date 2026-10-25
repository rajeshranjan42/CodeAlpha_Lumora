const OTP_MINUTES = Number(process.env.OTP_MINUTES) || 10;

const configured = () =>
  !!(process.env.GMAIL_USER && process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN);

let transporter;
function getTransporter() {
  if (transporter) return transporter;
  const nodemailer = require('nodemailer'); // npm i nodemailer
  // Gmail API via Google Cloud OAuth2: nodemailer keeps exchanging the refresh token for fresh access tokens.
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      type: 'OAuth2',
      user: process.env.GMAIL_USER,
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
    },
  });
  return transporter;
}

const html = (code, name) => `<!doctype html><html><body style="margin:0;background:#f6f1ea;font-family:Segoe UI,Arial,sans-serif;color:#1f1a24">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table width="440" cellpadding="0" cellspacing="0" style="max-width:440px;background:#fff;border-radius:18px;padding:32px;border:1px solid #eadfd2">
<tr><td>
<div style="font-size:22px;font-weight:700;background:linear-gradient(90deg,#ffb03a,#ff4d8d,#7b4dff);-webkit-background-clip:text;color:#ff4d8d">Lumora</div>
<div style="font-size:12px;color:#8a7f92;margin-bottom:22px">CodeAlpha · by Rajesh Ranjan</div>
<p style="font-size:16px;margin:0 0 6px">Hi ${name ? String(name).replace(/[<>&"]/g, '') : 'there'},</p>
<p style="font-size:15px;color:#5b5163;margin:0 0 20px">Use this code to verify your email. It expires in ${OTP_MINUTES} minutes.</p>
<div style="font-size:34px;letter-spacing:10px;font-weight:700;text-align:center;padding:16px 0;background:#faf5ee;border-radius:12px">${code}</div>
<p style="font-size:12px;color:#8a7f92;margin:20px 0 0">Didn’t ask for this? You can safely ignore this email — nobody can sign in without the code.</p>
</td></tr></table></td></tr></table></body></html>`;

/** Sends the one-time code. Without Gmail credentials (development only) the code is printed in the server console. */
exports.sendOtp = async (to, code, name) => {
  if (!configured()) {
    if (process.env.NODE_ENV === 'production') throw new Error('Email is not configured on the server');
    console.log(`\n✉  [dev] Gmail not configured — verification code for ${to}: ${code}\n`);
    return;
  }
  await getTransporter().sendMail({
    from: `"Lumora · CodeAlpha" <${process.env.GMAIL_USER}>`,
    to,
    subject: `${code} is your Lumora verification code`,
    text: `Your Lumora verification code is ${code}. It expires in ${OTP_MINUTES} minutes.`,
    html: html(code, name),
  });
};

exports.mailConfigured = configured;