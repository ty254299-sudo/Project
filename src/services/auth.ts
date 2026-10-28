import type { Session } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from './supabase';

export class AuthServiceError extends Error {
  constructor(message: string, public code: string, public status?: number) {
    super(message);
    this.name = 'AuthServiceError';
  }
}

export function authErrorMessage(error: unknown): string {
  if (error instanceof AuthServiceError) return error.message;
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  const status = error && typeof error === 'object' && 'status' in error ? Number(error.status) : 0;
  if (message.includes('invalid login credentials') || message.includes('invalid email or password')) {
    return 'That email and password did not match. Check them and try again.';
  }
  if (status === 429 || message.includes('too many requests')) {
    return 'There have been too many sign-in attempts. Wait a moment and try again.';
  }
  if (message.includes('email not confirmed')) return 'Confirm your email address, then try signing in again.';
  return 'Sign-in is temporarily unavailable. Check your connection and try again.';
}

export async function restoreSession(): Promise<Session | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new AuthServiceError('Your saved sign-in could not be restored. Please sign in again.', 'SESSION_RESTORE_FAILED');
  return data.session;
}

export function subscribeToSessionChanges(onSession: (session: Session | null) => void) {
  if (!supabase) return () => undefined;
  const { data } = supabase.auth.onAuthStateChange((_event, session) => onSession(session));
  return () => data.subscription.unsubscribe();
}

export async function signInWithPassword(email: string, password: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new AuthServiceError('Connect Supabase in .env to enable sign in.', 'BACKEND_NOT_CONFIGURED', 503);
  }
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
}

export async function signOutCurrentUser(): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) throw error;
}
