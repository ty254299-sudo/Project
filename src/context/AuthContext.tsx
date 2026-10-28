import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { isSupabaseConfigured } from '@/services/supabase';
import { authErrorMessage, restoreSession, signInWithPassword, signOutCurrentUser, subscribeToSessionChanges } from '@/services/auth';

type AuthValue = {
  session: Session | null;
  ready: boolean;
  configured: boolean;
  restoreError: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};
const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: React.PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!isSupabaseConfigured);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    let authEventSeen = false;
    const unsubscribe = subscribeToSessionChanges((next) => {
      authEventSeen = true;
      if (active) {
        setSession(next);
        setReady(true);
      }
    });
    restoreSession().then((restored) => {
      if (active && !authEventSeen) setSession(restored);
    }).catch((error: unknown) => {
      if (active && !authEventSeen) {
        setSession(null);
        setRestoreError(authErrorMessage(error));
      }
    }).finally(() => { if (active) setReady(true); });
    return () => { active = false; unsubscribe(); };
  }, []);

  const value = useMemo<AuthValue>(() => ({
    session,
    ready,
    configured: isSupabaseConfigured,
    restoreError,
    signIn: signInWithPassword,
    signOut: signOutCurrentUser,
  }), [session, ready, restoreError]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
