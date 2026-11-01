import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import PasswordInput from '../components/PasswordInput.jsx';
import { AuthHero } from './AuthPage.jsx';

/** Forgot password: 1) email  2) code + new password  3) back to log in. */
export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(null); // { email } once the code was requested
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [wait, setWait] = useState(0);
  const [info, setInfo] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const codeInput = useRef(null);

  useEffect(() => {
    if (wait <= 0) return undefined;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  useEffect(() => {
    if (sent) codeInput.current?.focus();
  }, [sent]);

  const request = async (e) => {
    e?.preventDefault();
    setError('');
    setBusy(true);
    try {
      const r = await api.forgotPassword({ email });
      setSent({ email: r.email || email.trim().toLowerCase() });
      setWait(r.resendIn || 60);
      setInfo(r.message || '');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setError('');
    try {
      const r = await api.forgotPassword({ email: sent.email });
      setWait(r.resendIn || 60);
      setInfo(`A new code is on its way to ${sent.email}`);
    } catch (err) {
      setError(err.message);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== again) return setError('The two passwords don’t match');
    setBusy(true);
    try {
      await api.resetPassword({ email: sent.email, code, password });
      try {
        sessionStorage.setItem('lumora_notice', 'Password changed. Log in with your new password.');
      } catch {
        /* ignore */
      }
      navigate('/login');
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <AuthHero />
      <section className="auth-panel">
        {!sent ? (
          <form className="auth-card" onSubmit={request}>
            <h2>Forgot password?</h2>
            <p className="muted">Enter your email and we’ll send you a 6-digit code to set a new password.</p>
            <label className="field">
              <span>Email</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required autoFocus />
            </label>
            {error && <p className="error">{error}</p>}
            <button className="btn btn-primary btn-block" disabled={busy}>
              {busy ? 'Sending…' : 'Send code'}
            </button>
            <p className="switch">
              <Link to="/login">Back to log in</Link>
            </p>
          </form>
        ) : (
          <form className="auth-card" onSubmit={submit}>
            <h2>Set a new password</h2>
            <p className="muted">{info || `We sent a 6-digit code to ${sent.email}`}</p>
            <label className="field">
              <span>Code from your email</span>
              <input
                ref={codeInput}
                className="otp-input"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="······"
                maxLength={6}
                aria-label="6-digit code"
              />
            </label>
            <label className="field">
              <span>New password</span>
              <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" minLength={6} required autoComplete="new-password" />
            </label>
            <label className="field">
              <span>Confirm new password</span>
              <PasswordInput value={again} onChange={(e) => setAgain(e.target.value)} placeholder="Type it again" minLength={6} required autoComplete="new-password" />
            </label>
            <p className="auth-notice">
              Heads-up: your chats are end-to-end encrypted with a key locked by your password. After a reset you get
              new keys, so messages from before the reset can’t be read anymore.
            </p>
            {error && <p className="error">{error}</p>}
            <button className="btn btn-primary btn-block" disabled={busy || code.length !== 6 || password.length < 6}>
              {busy ? 'Saving…' : 'Change password'}
            </button>
            <p className="switch">
              {wait > 0 ? (
                <span className="muted">Resend code in {wait}s</span>
              ) : (
                <button type="button" className="link-btn" onClick={resend}>Resend code</button>
              )}
              {' · '}
              <button type="button" className="link-btn" onClick={() => { setSent(null); setCode(''); setError(''); }}>
                Use a different email
              </button>
            </p>
          </form>
        )}
      </section>
    </div>
  );
}