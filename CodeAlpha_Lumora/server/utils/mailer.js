const OTP_MINUTES = Number(process.env.OTP_MINUTES) || 10;

const configured = () =>
  !!(
    process.env.GMAIL_USER &&
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_REFRESH_TOKEN
  );

// ---- Gmail API over HTTPS (works on Render free tier; SMTP ports are blocked there) ----
let cachedToken = null;
let cachedTokenExpiry = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < cachedTokenExpiry - 60 * 1000) return cachedToken;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(`Google token error: ${data.error || res.status} ${data.error_description || ''}`.trim());
  }
  cachedToken = data.access_token;
  cachedTokenExpiry = Date.now() + (Number(data.expires_in) || 3600) * 1000;
  return cachedToken;
}

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const clean = (s) => String(s).replace(/[\r\n]+/g, ' ').trim(); // prevent header injection

async function sendViaGmailApi({ to, subject, text, html: htmlBody }) {
  const accessToken = await getAccessToken();
  const boundary = `lumora_${Date.now()}`;

  const raw = [
    `From: =?UTF-8?B?${b64('Lumora · CodeAlpha')}?= <${clean(process.env.GMAIL_USER)}>`,
    `To: ${clean(to)}`,
    `Subject: =?UTF-8?B?${b64(subject)}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    b64(text),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    b64(htmlBody),
    `--${boundary}--`,
  ].join('\r\n');

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: Buffer.from(raw).toString('base64url') }),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Gmail API error ${res.status}: ${err?.error?.message || 'unknown error'}`);
  }
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
  await sendViaGmailApi({
    to,
    subject: `${code} is your Lumora verification code`,
    text: `Your Lumora verification code is ${code}. It expires in ${OTP_MINUTES} minutes.`,
    html: html(code, name),
  });
};

exports.mailConfigured = configured;