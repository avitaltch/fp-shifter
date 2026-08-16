import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { AuthContext } from './AuthContext';

// Single source of truth for auth. The role comes from public.users (enforced
// by RLS) — NOT from user_metadata, which any user can edit themselves.
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState(false);
  const [accountDisabled, setAccountDisabled] = useState(false);
  const profileRequestIdRef = useRef(0);

  // A failed profile fetch must be distinguishable from "not logged in":
  // otherwise a network/RLS hiccup silently bounces the user off protected
  // routes with no explanation.
  const loadProfile = useCallback(async (currentSession, isCancelled = () => false) => {
    const requestId = ++profileRequestIdRef.current;
    const canCommit = () => !isCancelled() && requestId === profileRequestIdRef.current;

    if (!currentSession) {
      if (canCommit()) {
        setProfile(null);
        setProfileError(false);
        setLoading(false);
      }
      return;
    }
    const { data, error } = await supabase
      .from('users')
      .select('id, first_name, last_name, role, phone, deleted_at')
      .eq('id', currentSession.user.id)
      .single();
    if (!canCommit()) return;
    // Soft-deleted (deactivated) staff must not keep a usable session.
    if (!error && data?.deleted_at) {
      setProfile(null);
      setProfileError(false);
      setAccountDisabled(true);
      setLoading(false);
      supabase.auth.signOut();
      return;
    }
    setProfile(error ? null : data);
    setProfileError(Boolean(error));
    if (!error) setAccountDisabled(false);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let lastProfileUserId = Symbol('uninitialized');
    const isCancelled = () => cancelled;

    const synchronizeSession = (currentSession) => {
      if (cancelled) return;
      setSession(currentSession);
      const userId = currentSession?.user?.id ?? null;
      if (userId === lastProfileUserId) return;
      lastProfileUserId = userId;
      loadProfile(currentSession, isCancelled);
    };

    const handleSessionError = (error) => {
      if (cancelled) return;
      console.error('Failed to initialize auth session:', error);
      profileRequestIdRef.current += 1;
      setSession(null);
      setProfile(null);
      setProfileError(true);
      setLoading(false);
    };

    supabase.auth
      .getSession()
      .then(({ data: { session: currentSession }, error }) => {
        if (error) handleSessionError(error);
        else synchronizeSession(currentSession);
      })
      .catch(handleSessionError);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      synchronizeSession(currentSession);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  const retryProfile = useCallback(() => {
    setLoading(true);
    loadProfile(session);
  }, [loadProfile, session]);

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const value = {
    session,
    profile,
    role: profile?.role ?? null,
    loading,
    profileError,
    accountDisabled,
    retryProfile,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
