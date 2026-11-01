const OTP_MINUTES = Number(process.env.OTP_MINUTES) || 10;

// Option A (recommended on Render): Brevo's HTTPS API. No Google token that can expire.
const brevoConfigured = () => !!(process.env.BREVO_API_KEY && process.env.MAIL_FROM);

const configured = () =>
  brevoConfigured() ||
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

const html = (code, name, reset) => `<!doctype html><html><body style="margin:0;background:#f6f1ea;font-family:Segoe UI,Arial,sans-serif;color:#1f1a24">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table width="440" cellpadding="0" cellspacing="0" style="max-width:440px;background:#fff;border-radius:18px;padding:32px;border:1px solid #eadfd2">
<tr><td>
<div style="font-size:22px;font-weight:700;background:linear-gradient(90deg,#ffb03a,#ff4d8d,#7b4dff);-webkit-background-clip:text;color:#ff4d8d">Lumora</div>
<div style="font-size:12px;color:#8a7f92;margin-bottom:22px">CodeAlpha · by Rajesh Ranjan</div>
<p style="font-size:16px;margin:0 0 6px">Hi ${name ? String(name).replace(/[<>&"]/g, '') : 'there'},</p>
<p style="font-size:15px;color:#5b5163;margin:0 0 20px">${reset ? 'Use this code to reset your Lumora password.' : 'Use this code to verify your email.'} It expires in ${OTP_MINUTES} minutes.</p>
<div style="font-size:34px;letter-spacing:10px;font-weight:700;text-align:center;padding:16px 0;background:#faf5ee;border-radius:12px">${code}</div>
<p style="font-size:12px;color:#8a7f92;margin:20px 0 0">${reset ? 'Didn’t ask to reset your password? Ignore this email — your password stays the same.' : 'Didn’t ask for this? You can safely ignore this email — nobody can sign in without the code.'}</p>
</td></tr></table></td></tr></table></body></html>`;

/** Sends the one-time code. Without Gmail credentials (development only) the code is printed in the server console. */
exports.sendOtp = async (to, code, name, purpose = 'verify') => {
  const reset = purpose === 'reset';
  if (!configured()) {
    if (process.env.NODE_ENV === 'production') throw new Error('Email is not configured on the server');
    console.log(`\n✉  [dev] Gmail not configured — ${reset ? 'password reset' : 'verification'} code for ${to}: ${code}\n`);
    return;
  }
  const subject = reset ? `${code} is your Lumora password reset code` : `${code} is your Lumora verification code`;
  const text = `Your Lumora ${reset ? 'password reset' : 'verification'} code is ${code}. It expires in ${OTP_MINUTES} minutes.`;

  if (brevoConfigured()) {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { name: 'Lumora · CodeAlpha', email: process.env.MAIL_FROM },
        to: [{ email: to }],
        subject,
        textContent: text,
        htmlContent: html(code, name, reset),
      }),
    });
    if (!res.ok) throw new Error(`Brevo ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return;
  }

  await getTransporter().sendMail({
    from: `"Lumora · CodeAlpha" <${process.env.GMAIL_USER}>`,
    to,
    subject: reset ? `${code} is your Lumora password reset code` : `${code} is your Lumora verification code`,
    text: `Your Lumora ${reset ? 'password reset' : 'verification'} code is ${code}. It expires in ${OTP_MINUTES} minutes.`,
    html: html(code, name, reset),
  });
};

exports.mailConfigured = configured;