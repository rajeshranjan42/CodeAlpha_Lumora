const fs = require('fs');
const path = require('path');

// Uses client/public/lumora-logo.png directly. Change the file name here if yours is different.
const LOGO_FILE = path.join(__dirname, '..', '..', 'client', 'public', 'lumora-logo.png');

const LOGO_B64 = (() => {
  try {
    return fs.readFileSync(LOGO_FILE).toString('base64');
  } catch (e) {
    console.warn('Logo PNG not found, using built-in logo:', LOGO_FILE);
    return require('./logoData'); // fallback
  }
})();

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
const wrap76 = (s) => s.replace(/(.{76})/g, '$1\r\n');
const clean = (s) => String(s).replace(/[\r\n]+/g, ' ').trim(); // prevent header injection

async function sendViaGmailApi({ to, subject, text, html: htmlBody }) {
  const accessToken = await getAccessToken();
  const stamp = Date.now();
  const outer = `lumora_rel_${stamp}`;
  const inner = `lumora_alt_${stamp}`;

  // multipart/related( multipart/alternative(text, html), inline logo image )
  const raw = [
    `From: =?UTF-8?B?${b64('Lumora · CodeAlpha')}?= <${clean(process.env.GMAIL_USER)}>`,
    `To: ${clean(to)}`,
    `Subject: =?UTF-8?B?${b64(subject)}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/related; boundary="${outer}"`,
    '',
    `--${outer}`,
    `Content-Type: multipart/alternative; boundary="${inner}"`,
    '',
    `--${inner}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(b64(text)),
    `--${inner}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(b64(htmlBody)),
    `--${inner}--`,
    '',
    `--${outer}`,
    'Content-Type: image/png; name="lumora-logo.png"',
    'Content-Transfer-Encoding: base64',
    'Content-ID: <lumora-logo>',
    'Content-Disposition: inline; filename="lumora-logo.png"',
    '',
    wrap76(LOGO_B64),
    `--${outer}--`,
  ].join('\r\n');

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: Buffer.from(raw).toString('base64url') }),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Gmail API error ${res.status}: ${err?.error?.message || 'unknown error'}`);
  }
}

// ---- Email template ----
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const QUOTES = [
  'Small moments, shared with care, become the brightest light.',
  'Be the glow someone was hoping to find today.',
  'Not every day needs to be loud. Some just need to be kind.',
  'Your story is worth sharing, even the quiet chapters.',
  'Light travels farthest when it is shared.',
  'Make today a little warmer for someone, including yourself.',
  'Slow down, notice the good, and let it shine.',
];
const pickQuote = () => QUOTES[Math.floor(Math.random() * QUOTES.length)];

const html = (code, name) => {
  const digits = String(code)
    .split('')
    .map(
      (d) => `<td align="center" width="46" height="58" style="width:46px;height:58px;background-color:#fff7ef;border:1px solid #f1dfcf;border-radius:12px;font-family:'Segoe UI',Helvetica,Arial,sans-serif;font-size:28px;font-weight:700;color:#1f1a24;">${esc(d)}</td><td width="8" style="width:8px;font-size:0;line-height:0;">&nbsp;</td>`
    )
    .join('');
  const who = name ? esc(name) : 'there';
  const quote = esc(pickQuote());

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<title>Your Lumora verification code</title>
</head>
<body style="margin:0;padding:0;background-color:#f6f1ea;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f6f1ea;">Your Lumora code is ${esc(code)}. It expires in ${OTP_MINUTES} minutes.</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f6f1ea;">
<tr><td align="center" style="padding:32px 12px;">

  <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:100%;max-width:480px;background-color:#ffffff;border-radius:22px;overflow:hidden;border:1px solid #eadfd2;">

    <!-- Header -->
    <tr>
      <td align="center" bgcolor="#ff4d8d" style="padding:34px 24px 30px;background-color:#ff4d8d;background-image:linear-gradient(120deg,#ffb03a 0%,#ff4d8d 55%,#7b4dff 100%);">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td width="56" style="width:56px;"><img src="cid:lumora-logo" width="56" height="56" alt="Lumora" style="display:block;width:56px;height:56px;border:0;border-radius:28px;"></td>
          <td style="padding-left:14px;font-family:Georgia,'Times New Roman',serif;font-size:32px;font-weight:700;color:#ffffff;letter-spacing:0.5px;">Lumora</td>
        </tr></table>
        <div style="margin-top:10px;font-family:'Segoe UI',Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:3px;color:#ffffff;">CODEALPHA &middot; BY RAJESH RANJAN</div>
      </td>
    </tr>

    <!-- Body -->
    <tr>
      <td style="padding:34px 32px 8px;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
        <div style="font-size:22px;font-weight:700;color:#1f1a24;">Hi ${who} &#128075;</div>
        <div style="margin-top:10px;font-size:15px;line-height:1.6;color:#5b5163;">
          Welcome to Lumora. Enter this code to verify your email and start sharing your light.
        </div>
      </td>
    </tr>

    <!-- Code -->
    <tr>
      <td align="center" style="padding:22px 32px 6px;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>${digits}</tr></table>
      </td>
    </tr>

    <tr>
      <td align="center" style="padding:14px 32px 6px;font-family:'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;color:#8a7f92;">
        &#9201; This code expires in <b style="color:#1f1a24;">${OTP_MINUTES} minutes</b>
      </td>
    </tr>

    <!-- Quote -->
    <tr>
      <td style="padding:24px 32px 6px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td width="4" style="width:4px;background-color:#ff4d8d;border-radius:4px;">&nbsp;</td>
            <td style="padding:6px 0 6px 16px;font-family:Georgia,'Times New Roman',serif;font-size:17px;line-height:1.55;font-style:italic;color:#3d3447;">
              &ldquo;${quote}&rdquo;
              <div style="margin-top:8px;font-family:'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;font-style:normal;letter-spacing:1px;color:#ff4d8d;">&#10022; TEAM LUMORA</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Security note -->
    <tr>
      <td style="padding:22px 32px 34px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="background-color:#faf5ee;border-radius:12px;padding:14px 16px;font-family:'Segoe UI',Helvetica,Arial,sans-serif;font-size:12.5px;line-height:1.6;color:#8a7f92;">
            &#128274; <b style="color:#5b5163;">Never share this code.</b> Lumora will never ask for it by phone or chat. Didn&rsquo;t request it? You can safely ignore this email.
          </td></tr>
        </table>
      </td>
    </tr>

  </table>

  <div style="margin-top:18px;font-family:'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;color:#a89fae;">
    Lumora &middot; CodeAlpha &middot; by Rajesh Ranjan
  </div>

</td></tr>
</table>
</body>
</html>`;
};

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