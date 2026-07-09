import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// Single source of truth for auth. The role comes from public.users (enforced
// by RLS) — NOT from user_metadata, which any user can edit themselves.
const AuthContext = createContext({
  session: null,
  profile: null,
  role: null,
  loading: true,
  signOut: () => {},
});

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile(currentSession) {
      if (!currentSession) {
        if (!cancelled) {
          setProfile(null);
          setLoading(false);
        }
        return;
      }
      const { data } = await supabase
        .from('users')
        .select('id, first_name, last_name, role')
        .eq('id', currentSession.user.id)
        .single();
      if (!cancelled) {
        setProfile(data ?? null);
        setLoading(false);
      }
    }

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (cancelled) return;
      setSession(s);
      loadProfile(s);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      if (cancelled) return;
      setSession(s);
      loadProfile(s);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const value = {
    session,
    profile,
    role: profile?.role ?? null,
    loading,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
