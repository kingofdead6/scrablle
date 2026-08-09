import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { socket } from './socket';
import { auth as authApi, health as healthApi, readToken, writeToken } from './api';

const AuthContext = createContext(null);

/**
 * Who is signed in, and what this server can do. The two travel together
 * because every account-facing screen has to answer "is this even switched on
 * here?" before it can answer "am I signed in?".
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [features, setFeatures] = useState({ accounts: false, uploads: false, missingEnv: [] });
  const [loading, setLoading] = useState(true);

  // The socket carries the token so finished games attach to the right account.
  const reconnectSocket = useCallback((token) => {
    socket.auth = token ? { token } : {};
    if (socket.connected) socket.disconnect();
    socket.connect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let capabilities = { accounts: false, uploads: false, missingEnv: [] };
      try {
        const info = await healthApi();
        capabilities = { accounts: !!info.accounts, uploads: !!info.uploads, missingEnv: info.missingEnv || [] };
      } catch { /* offline or old server — accounts stay off */ }
      if (cancelled) return;
      setFeatures(capabilities);

      if (capabilities.accounts && readToken()) {
        try {
          const { user: me } = await authApi.me();
          if (!cancelled) {
            setUser(me);
            // The socket connected anonymously while we were checking; redo the
            // handshake so it carries the token. App re-joins any live room.
            reconnectSocket(readToken());
          }
        } catch {
          writeToken(null); // expired or revoked
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [reconnectSocket]);

  const adopt = useCallback((token, nextUser) => {
    writeToken(token);
    setUser(nextUser);
    reconnectSocket(token);
  }, [reconnectSocket]);

  const value = useMemo(() => ({
    user,
    features,
    loading,
    signedIn: !!user,
    isGuest: !!user?.isGuest,
    async register(payload) { const r = await authApi.register(payload); adopt(r.token, r.user); return r.user; },
    async login(payload) { const r = await authApi.login(payload); adopt(r.token, r.user); return r.user; },
    async playAsGuest(name) { const r = await authApi.guest(name); adopt(r.token, r.user); return r.user; },
    async claim(payload) { const r = await authApi.claim(payload); adopt(r.token, r.user); return r.user; },
    signOut() { writeToken(null); setUser(null); reconnectSocket(null); },
    refresh(nextUser) { setUser(nextUser); },
  }), [user, features, loading, adopt, reconnectSocket]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>.');
  return ctx;
}
