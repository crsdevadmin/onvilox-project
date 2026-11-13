import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { api, loadToken, saveToken, setUnauthorizedHandler } from './api';
import { ALLOWED_ROLES } from './config';
import type { User } from './types';

const USER_KEY = 'gq_user';

interface AuthState {
  ready: boolean;
  user: User | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  const signOut = useCallback(async () => {
    await saveToken(null);
    await SecureStore.deleteItemAsync(USER_KEY);
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => { void signOut(); });
    (async () => {
      try {
        const t = await loadToken();
        const raw = await SecureStore.getItemAsync(USER_KEY);
        if (t && raw) setUser(JSON.parse(raw));
      } finally {
        setReady(true);
      }
    })();
  }, [signOut]);

  const signIn = useCallback(async (email: string, password: string) => {
    const res = await api.login(email.trim().toLowerCase(), password);
    if (!(ALLOWED_ROLES as readonly string[]).includes(res.user.role)) {
      throw new Error('This app is for doctors. Please use the GQUENCE web dashboard.');
    }
    await saveToken(res.token);
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(res.user));
    setUser(res.user);
  }, []);

  const value = useMemo(() => ({ ready, user, signIn, signOut }), [ready, user, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
