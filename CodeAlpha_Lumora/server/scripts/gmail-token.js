/**
 * One-time helper: gets the Gmail refresh token for GOOGLE_REFRESH_TOKEN.
 *   1. Put GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in server/.env
 *   2. In Google Cloud → Credentials → your OAuth client, add this Authorized redirect URI:
 *        http://localhost:4000/oauth2callback
 *   3. Run:  node scripts/gmail-token.js   and sign in with the Gmail you set as GMAIL_USER
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const http = require('http');

const { GOOGLE_CLIENT_ID: id, GOOGLE_CLIENT_SECRET: secret } = process.env;
if (!id || !secret) {
  console.error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in server/.env first.');
  process.exit(1);
}
const redirect = 'http://localhost:4000/oauth2callback';
const url =
  'https://accounts.google.com/o/oauth2/v2/auth?' +
  new URLSearchParams({
    client_id: id,
    redirect_uri: redirect,
    response_type: 'code',
    scope: 'https://mail.google.com/',
    access_type: 'offline',
    prompt: 'consent',
  });

http
  .createServer(async (req, res) => {
    const u = new URL(req.url, 'http://localhost:4000');
    if (u.pathname !== '/oauth2callback') return res.end();
    const code = u.searchParams.get('code');
    if (!code) {
      res.end('No code received: ' + (u.searchParams.get('error') || 'unknown error'));
      return;
    }
    try {
      const r = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code, client_id: id, client_secret: secret, redirect_uri: redirect, grant_type: 'authorization_code' }),
      });
      const t = await r.json();
      if (!t.refresh_token) throw new Error(t.error_description || 'Google returned no refresh token — remove the app at myaccount.google.com/permissions and run this again');
      res.end('Done! You can close this tab and go back to the terminal.');
      console.log('\nAdd this line to server/.env:\n\nGOOGLE_REFRESH_TOKEN=' + t.refresh_token + '\n');
    } catch (e) {
      res.end('Failed: ' + e.message);
      console.error(e.message);
    }
    setTimeout(() => process.exit(0), 500);
  })
  .listen(4000, () => console.log('Open this link in your browser and allow access:\n\n' + url + '\n'));