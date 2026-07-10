import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// Single source of truth for auth. The role comes from public.users (enforced
// by RLS) — NOT from user_metadata, which any user can edit themselves.
const AuthContext = createContext({
  session: null,
  profile: null,
  role: null,
  loading: true,
  profileError: false,
  retryProfile: () => {},
  signOut: () => {},
});

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState(false);

  // A failed profile fetch must be distinguishable from "not logged in":
  // otherwise a network/RLS hiccup silently bounces the user off protected
  // routes with no explanation.
  const loadProfile = useCallback(async (currentSession, isCancelled = () => false) => {
    if (!currentSession) {
      if (!isCancelled()) {
        setProfile(null);
        setProfileError(false);
        setLoading(false);
      }
      return;
    }
    const { data, error } = await supabase
      .from('users')
      .select('id, first_name, last_name, role, phone')
      .eq('id', currentSession.user.id)
      .single();
    if (!isCancelled()) {
      setProfile(error ? null : data);
      setProfileError(Boolean(error));
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const isCancelled = () => cancelled;

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (cancelled) return;
      setSession(s);
      loadProfile(s, isCancelled);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      if (cancelled) return;
      setSession(s);
      loadProfile(s, isCancelled);
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
    await supabase.auth.signOut();
  };

  const value = {
    session,
    profile,
    role: profile?.role ?? null,
    loading,
    profileError,
    retryProfile,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
