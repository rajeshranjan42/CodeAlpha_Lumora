import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, getToken, setToken } from '../api.js';
import { createKeys, forgetKeys, hasKeys, installKeys, unwrapPrivateKey } from '../e2ee.js';

const AuthContext = createContext(null);

const notice = (msg) => {
  try {
    sessionStorage.setItem('lumora_notice', msg);
  } catch {
    /* ignore */
  }
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState(() => localStorage.getItem('lumora_theme') || 'light');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('lumora_theme', theme);
  }, [theme]);

  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    api
      .me()
      .then(async (d) => {
        // the private key lives only on this device; without it we need the password again
        if (!(await hasKeys(d.user._id))) {
          notice('Please log in once more to unlock your end-to-end encrypted messages.');
          setToken(null);
          return;
        }
        setUser(d.user);
      })
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  // shared by login and email verification: unlock (or create) the encryption keys, then sign in
  const finish = useCallback(async (d, password) => {
    setToken(d.token);
    try {
      if (d.keys) {
        // existing keys: unlock the password-wrapped backup on this device
        const privateJwk = await unwrapPrivateKey(d.keys.backup, password);
        await installKeys(d.user._id, privateJwk, d.keys.publicKey);
      } else {
        // account from before encryption existed: create keys now
        const k = await createKeys(password);
        await api.setKeys({ publicKey: k.publicKey, keyBackup: k.backup });
        await installKeys(d.user._id, k.privateJwk, k.publicKey);
      }
    } catch (e) {
      setToken(null);
      throw e;
    }
    setUser(d.user);
  }, []);

  // returns { needsVerification, email, resendIn } when an emailed code is required first
  const login = useCallback(
    async ({ email, password }) => {
      const d = await api.login({ email, password });
      if (d.needsVerification) return d;
      await finish(d, password);
      return null;
    },
    [finish]
  );

  const register = useCallback(async (body) => {
    const k = await createKeys(body.password);
    // the account is created unverified; the keys are stored with it and unlocked after the code is confirmed
    return api.register({ ...body, publicKey: k.publicKey, keyBackup: k.backup });
  }, []);

  const verifyEmail = useCallback(
    async ({ email, code, password }) => {
      const d = await api.verifyEmail({ email, code });
      await finish(d, password);
    },
    [finish]
  );

  const logout = useCallback(() => {
    if (user) forgetKeys(user._id); // wipe the private key from this device
    setToken(null);
    setUser(null);
  }, [user]);

  const toggleTheme = () => setTheme((t) => (t === 'light' ? 'dark' : 'light'));

  return (
    <AuthContext.Provider
      value={{ user, setUser, loading, login, register, verifyEmail, logout, theme, toggleTheme }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);