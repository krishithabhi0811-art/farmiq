/**
 * AuthContext — keeps the logged-in user in one place.
 * Session token lives in localStorage, so refreshing the page (or opening on
 * another device and logging in) keeps you signed in.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, tokenStore } from '../lib/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [serverOnline, setServerOnline] = useState(null);

  const refresh = useCallback(async () => {
    if (!tokenStore.get()) { setUser(null); setLoading(false); return null; }
    try {
      const { user: me } = await api.me();
      setUser(me);
      return me;
    } catch {
      tokenStore.clear();
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Boot: check the API is reachable, then restore the saved session.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const h = await api.health();
        if (alive) setServerOnline(Boolean(h?.ok));
      } catch {
        if (alive) setServerOnline(false);
      }
      if (alive) await refresh();
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [refresh]);

  // A 401 anywhere in the app means the session is gone.
  useEffect(() => {
    const onUnauthorized = () => setUser(null);
    window.addEventListener('farmiq:unauthorized', onUnauthorized);
    return () => window.removeEventListener('farmiq:unauthorized', onUnauthorized);
  }, []);

  const login = useCallback(async (email, password) => {
    const { token, user: me } = await api.login({ email, password });
    tokenStore.set(token);
    setUser(me);
    return me;
  }, []);

  const signup = useCallback(async (payload) => {
    const { token, user: me } = await api.signup(payload);
    tokenStore.set(token);
    setUser(me);
    return me;
  }, []);

  const logout = useCallback(async () => {
    try { await api.logout(); } catch {}
    tokenStore.clear();
    setUser(null);
  }, []);

  const updateProfile = useCallback(async (patch) => {
    const { user: me } = await api.updateMe(patch);
    setUser(me);
    return me;
  }, []);

  const value = useMemo(
    () => ({ user, setUser, loading, serverOnline, login, signup, logout, updateProfile, refresh }),
    [user, loading, serverOnline, login, signup, logout, updateProfile, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
