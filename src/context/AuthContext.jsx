import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, onUnauthorized, tokenStore } from "../services/api.js";
import { useToast } from "../components/Toast.jsx";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => tokenStore.getUser());
  const [booting, setBooting] = useState(Boolean(tokenStore.get()));
  const toast = useToast();

  // A 401 from anywhere in the app drops us back to the login screen rather
  // than leaving the UI in a half-authenticated state.
  useEffect(
    () =>
      onUnauthorized(() => {
        setUser(null);
        toast.push("Session expired — please sign in again.", "warning");
      }),
    [toast]
  );

  // Revalidate a stored token on boot: it may have expired while we were away.
  useEffect(() => {
    if (!tokenStore.get()) {
      setBooting(false);
      return;
    }
    let alive = true;
    api.auth
      .me()
      .then((u) => {
        if (!alive) return;
        tokenStore.setUser(u);
        setUser(u);
      })
      .catch(() => alive && setUser(null))
      .finally(() => alive && setBooting(false));
    return () => {
      alive = false;
    };
  }, []);

  const adopt = useCallback((res) => {
    tokenStore.set(res.access_token);
    tokenStore.setUser(res.user);
    setUser(res.user);
    return res.user;
  }, []);

  const login = useCallback(
    async (email, password) => adopt(await api.auth.login(email, password)),
    [adopt]
  );

  const register = useCallback(
    async (payload) => adopt(await api.auth.register(payload)),
    [adopt]
  );

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, booting, login, register, logout, isAuthed: Boolean(user) }),
    [user, booting, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
