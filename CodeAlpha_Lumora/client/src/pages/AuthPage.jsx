import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { LogoMark } from '../components/Logo.jsx';
import { api } from '../api.js';

const readNotice = () => {
  try {
    const n = sessionStorage.getItem('lumora_notice') || '';
    sessionStorage.removeItem('lumora_notice');
    return n;
  } catch {
    return '';
  }
};

export default function AuthPage({ mode }) {
  const isLogin = mode === 'login';
  const { login, register, verifyEmail } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', username: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [notice] = useState(readNotice);
  const [busy, setBusy] = useState(false);
  // step 2: the 6-digit code sent to the user's email
  const [otpFor, setOtpFor] = useState(null); // { email }
  const [code, setCode] = useState('');
  const [wait, setWait] = useState(0);
  const [info, setInfo] = useState('');
  const codeInput = useRef(null);

  useEffect(() => {
    if (wait <= 0) return undefined;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  useEffect(() => {
    if (otpFor) codeInput.current?.focus();
  }, [otpFor]);

  // switching between the Log in / Sign up tabs leaves the code step
  useEffect(() => {
    setOtpFor(null);
    setCode('');
    setError('');
  }, [mode]);

  const askForCode = (r) => {
    setOtpFor({ email: r.email });
    setWait(r.resendIn || 60);
    setCode('');
    setInfo(r.message || '');
    setBusy(false);
  };

  const confirm = async (value = code) => {
    if (value.length !== 6 || busy) return;
    setError('');
    setBusy(true);
    try {
      await verifyEmail({ email: otpFor.email, code: value, password: form.password });
      navigate('/');
    } catch (err) {
      setError(err.message);
      setCode('');
      setBusy(false);
      codeInput.current?.focus();
    }
  };

  const onCode = (e) => {
    const v = e.target.value.replace(/\D/g, '').slice(0, 6);
    setCode(v);
    if (v.length === 6) confirm(v);
  };

  const resend = async () => {
    setError('');
    try {
      const r = await api.resendOtp({ email: otpFor.email });
      setWait(r.resendIn || 60);
      setInfo(`A new code is on its way to ${otpFor.email}`);
    } catch (err) {
      if (err.message) setError(err.message);
    }
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const r = isLogin ? await login({ email: form.email, password: form.password }) : await register(form);
      if (r?.needsVerification) return askForCode(r);
      navigate('/');
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <section className="auth-hero">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
        <div className="auth-hero-inner">
          <div className="auth-brand">
            <LogoMark size={56} />
            <div className="auth-brand-text">
              <strong>Lumora</strong>
              <span>CodeAlpha</span>
              <small>by Rajesh Ranjan</small>
            </div>
          </div>
          <h1>
            Share your <em>light.</em>
          </h1>
          <p>
            Lumora is a calmer corner of the internet. Post moments, send a glow to the things that
            move you, and follow people who make your world brighter.
          </p>
          <ul className="values">
            <li>✦ Meaningful over mindless</li>
            <li>✦ Private, end-to-end encrypted messages</li>
            <li>✦ Yours to shape</li>
          </ul>
        </div>
      </section>

      <section className="auth-panel">
        {otpFor ? (
          <form className="auth-card" onSubmit={(e) => { e.preventDefault(); confirm(); }}>
            <h2>Check your email</h2>
            <p className="muted">{info || `We sent a 6-digit code to ${otpFor.email}`}</p>
            <label className="field">
              <span>Verification code</span>
              <input
                ref={codeInput}
                className="otp-input"
                value={code}
                onChange={onCode}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="······"
                maxLength={6}
                aria-label="6-digit verification code"
              />
            </label>
            {error && <p className="error">{error}</p>}
            <button className="btn btn-primary btn-block" disabled={busy || code.length !== 6}>
              {busy ? 'Verifying…' : isLogin ? 'Verify & log in' : 'Verify & create account'}
            </button>
            <p className="switch">
              {wait > 0 ? (
                <span className="muted">Resend code in {wait}s</span>
              ) : (
                <button type="button" className="link-btn" onClick={resend}>Resend code</button>
              )}
              {' · '}
              <button type="button" className="link-btn" onClick={() => { setOtpFor(null); setError(''); }}>
                Use a different email
              </button>
            </p>
            <p className="auth-credit">The code expires in 10 minutes · check spam if you can’t find it</p>
          </form>
        ) : (
        <form className="auth-card" onSubmit={submit}>
          <div className="tabs" role="tablist">
            <Link to="/login" role="tab" aria-selected={isLogin} className={isLogin ? 'on' : ''}>
              Log in
            </Link>
            <Link to="/register" role="tab" aria-selected={!isLogin} className={!isLogin ? 'on' : ''}>
              Sign up
            </Link>
          </div>

          <h2>{isLogin ? 'Welcome back' : 'Join Lumora'}</h2>
          <p className="muted">
            {isLogin ? 'Log in to see what’s glowing today.' : 'Create your account in under a minute.'}
          </p>

          {notice && <p className="auth-notice">{notice}</p>}

          {!isLogin && (
            <>
              <label className="field">
                <span>Full name</span>
                <input value={form.name} onChange={set('name')} placeholder="Aarav Sharma" required maxLength={50} />
              </label>
              <label className="field">
                <span>Username</span>
                <input
                  value={form.username}
                  onChange={set('username')}
                  placeholder="aarav.codes"
                  required
                  pattern="[A-Za-z0-9_.]{3,20}"
                  title="3–20 characters: letters, numbers, dot or underscore"
                />
              </label>
            </>
          )}
          <label className="field">
            <span>Email</span>
            <input type="email" value={form.email} onChange={set('email')} placeholder="you@example.com" required />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={form.password}
              onChange={set('password')}
              placeholder="At least 6 characters"
              minLength={6}
              required
            />
          </label>

          {error && <p className="error">{error}</p>}
          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? (isLogin ? 'Unlocking your messages…' : 'Securing your account…') : isLogin ? 'Log in' : 'Create account'}
          </button>

          <p className="switch">
            {isLogin ? (
              <>New to Lumora? <Link to="/register">Create an account</Link></>
            ) : (
              <>Already glowing? <Link to="/login">Log in</Link></>
            )}
          </p>
          <p className="auth-credit">Lumora · CodeAlpha · by Rajesh Ranjan</p>
        </form>
        )}
      </section>
    </div>
  );
}