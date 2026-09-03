import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clearStaffAccessToken,
  loginStaff,
  logoutStaff,
  refreshStaffSession,
} from '../lib/api';
import { AuthContext } from './AuthContext';

function toFrontendAuth(session) {
  const backendRole = session.business.role;
  const role = backendRole === 'Provider' ? 'Employee' : 'Admin';
  return {
    session: {
      user: { id: session.user.id, email: session.user.email },
      business: session.business,
      expiresInSeconds: session.expiresInSeconds,
    },
    profile: {
      id: session.user.id,
      first_name: session.user.firstName,
      last_name: session.user.lastName,
      role,
      membership_role: backendRole,
      business_id: session.business.id,
      business_slug: session.business.slug,
    },
    role,
  };
}

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState({ session: null, profile: null, role: null });
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState(false);
  const [accountDisabled, setAccountDisabled] = useState(false);
  const mountedRef = useRef(true);

  const applySession = useCallback((session) => {
    if (!mountedRef.current) return;
    setAuth(toFrontendAuth(session));
    setProfileError(false);
    setAccountDisabled(false);
  }, []);

  const clearSession = useCallback(() => {
    clearStaffAccessToken();
    if (mountedRef.current) setAuth({ session: null, profile: null, role: null });
  }, []);

  const restoreSession = useCallback(async () => {
    setLoading(true);
    try {
      applySession(await refreshStaffSession());
    } catch (error) {
      clearSession();
      if (mountedRef.current) {
        const isAnonymous = error?.status === 401;
        setProfileError(!isAnonymous);
        setAccountDisabled(error?.code === 'ACCOUNT_DISABLED');
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [applySession, clearSession]);

  useEffect(() => {
    mountedRef.current = true;
    restoreSession();
    return () => {
      mountedRef.current = false;
    };
  }, [restoreSession]);

  useEffect(() => {
    if (!auth.session?.expiresInSeconds) return undefined;
    const delay = Math.max(1_000, (auth.session.expiresInSeconds - 60) * 1_000);
    const timer = window.setTimeout(() => {
      refreshStaffSession().then(applySession).catch(clearSession);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [applySession, auth.session, clearSession]);

  const signIn = useCallback(
    async (email, password, businessSlug) => {
      const session = await loginStaff({
        email: email.trim().toLowerCase(),
        password,
        ...(businessSlug ? { businessSlug } : {}),
      });
      applySession(session);
      return toFrontendAuth(session);
    },
    [applySession]
  );

  const signOut = useCallback(async () => {
    await logoutStaff();
    clearSession();
  }, [clearSession]);

  const value = {
    ...auth,
    loading,
    profileError,
    accountDisabled,
    retryProfile: restoreSession,
    signIn,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
