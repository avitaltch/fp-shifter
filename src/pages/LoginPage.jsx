import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { updateStaffProfile } from '../lib/api';
import { friendlyError } from '../lib/errors';
import { KeyRound } from 'lucide-react';
import PageContainer from '../components/PageContainer/PageContainer';
import Alert from '../components/Alert/Alert';
import LoadingSpinner from '../components/LoadingSpinner/LoadingSpinner';
import './LoginPage.css';

// Invite / recovery email links land on /login with tokens in the URL.
// Supabase establishes a session; we must then collect a password via
// updateUser — otherwise the user has an account but nothing to type at login.
const RECOVERY_FLAG = 'fp_password_recovery';

function authParamsFromUrl() {
  const search = new URLSearchParams(window.location.search);
  const hashRaw = window.location.hash?.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash || '';
  const hash = new URLSearchParams(hashRaw);
  const type = hash.get('type') || search.get('type');
  const hasCode = Boolean(search.get('code'));
  const hasToken = Boolean(hash.get('access_token') || hash.get('refresh_token'));
  return { type, hasCode, hasToken, isCallback: Boolean(type || hasCode || hasToken) };
}

function clearAuthParamsFromUrl() {
  const url = new URL(window.location.href);
  url.hash = '';
  ['code', 'type', 'error', 'error_description'].forEach((key) => url.searchParams.delete(key));
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}`);
}

function clearRecoveryFlag() {
  try {
    sessionStorage.removeItem(RECOVERY_FLAG);
  } catch {
    /* ignore */
  }
}

function markRecoveryPending() {
  try {
    sessionStorage.setItem(RECOVERY_FLAG, '1');
  } catch {
    /* ignore */
  }
}

function isRecoveryPending() {
  try {
    return sessionStorage.getItem(RECOVERY_FLAG) === '1';
  } catch {
    return false;
  }
}

async function navigateAfterAuth(navigate, location, userId) {
  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', userId)
    .single();

  const from = location.state?.from?.pathname;
  const home = profile?.role === 'Admin' ? '/admin/dashboard' : '/employee/shifts';
  navigate(from || home, { replace: true });
}

async function loadNameDraft(userId, setFirstName, setLastName) {
  const { data } = await supabase
    .from('users')
    .select('first_name, last_name')
    .eq('id', userId)
    .single();
  if (!data) return;
  setFirstName(data.first_name === 'New' ? '' : data.first_name || '');
  setLastName(data.last_name === 'User' ? '' : data.last_name || '');
}

// Staff login only. There is no public sign-up: employees are invited by an
// Admin (Supabase Dashboard -> Authentication -> Invite user).
const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [mode, setMode] = useState('login'); // 'login' | 'reset' | 'setPassword'
  const [loading, setLoading] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    let cancelled = false;
    let enteredSetPassword = false;

    const enterSetPassword = async (message, session) => {
      if (cancelled || enteredSetPassword) return;
      enteredSetPassword = true;
      setMode('setPassword');
      setError(null);
      setInfo(message);
      clearAuthParamsFromUrl();
      clearRecoveryFlag();
      if (session?.user?.id) {
        await loadNameDraft(session.user.id, setFirstName, setLastName);
      }
      if (!cancelled) setBootstrapping(false);
    };

    const { type, isCallback } = authParamsFromUrl();
    const recoveryIntent = type === 'recovery' || isRecoveryPending();
    const inviteIntent = type === 'invite' || type === 'signup';

    const recoveryMessage = 'בחרו סיסמה חדשה לחשבון.';
    const inviteMessage = 'ההזמנה אושרה. השלימו שם וסיסמה כדי להיכנס.';
    const callbackMessage = recoveryIntent ? recoveryMessage : inviteMessage;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        enterSetPassword(recoveryMessage, session);
        return;
      }
      // PKCE recovery/invite often arrives as SIGNED_IN with ?code= and no type=
      if (
        session &&
        (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') &&
        (isCallback || recoveryIntent || inviteIntent)
      ) {
        enterSetPassword(callbackMessage, session);
      }
    });

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (cancelled) return;
      if (session && (inviteIntent || recoveryIntent || isCallback)) {
        await enterSetPassword(callbackMessage, session);
        return;
      }
      // Code exchange may still be in flight — keep spinner briefly for callbacks
      if (isCallback && !session) {
        window.setTimeout(() => {
          if (!cancelled && !enteredSetPassword) setBootstrapping(false);
        }, 2500);
        return;
      }
      setBootstrapping(false);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) throw signInError;
      await navigateAfterAuth(navigate, location, data.user.id);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);

    try {
      markRecoveryPending();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/login`,
      });
      if (resetError) throw resetError;
      setInfo('אם קיים חשבון עם כתובת זו, נשלח אליה קישור לאיפוס סיסמה.');
    } catch (err) {
      clearRecoveryFlag();
      setError(friendlyError(err, 'שגיאה בשליחת קישור האיפוס.'));
    } finally {
      setLoading(false);
    }
  };

  const handleSetPassword = async (e) => {
    e.preventDefault();
    setError(null);
    setInfo(null);

    const first = firstName.trim();
    const last = lastName.trim();
    if (!first || !last) {
      setError('נא להזין שם פרטי ושם משפחה.');
      return;
    }
    if (password.length < 6) {
      setError('הסיסמה חייבת להכיל לפחות 6 תווים.');
      return;
    }
    if (password !== confirmPassword) {
      setError('הסיסמאות אינן תואמות.');
      return;
    }

    setLoading(true);
    try {
      const { data, error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      await updateStaffProfile(data.user.id, { first_name: first, last_name: last });
      clearAuthParamsFromUrl();
      await navigateAfterAuth(navigate, location, data.user.id);
    } catch (err) {
      setError(friendlyError(err, 'שגיאה בשמירת הפרטים. נסו שוב או בקשו הזמנה חדשה.'));
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (next) => {
    setMode(next);
    setError(null);
    setInfo(null);
    setPassword('');
    setConfirmPassword('');
  };

  const title =
    mode === 'setPassword' ? 'השלמת הרשמה' : mode === 'reset' ? 'איפוס סיסמה' : 'כניסת צוות';

  if (bootstrapping) {
    return (
      <PageContainer size="sm" className="login-page">
        <LoadingSpinner text="טוען..." />
      </PageContainer>
    );
  }

  return (
    <PageContainer size="sm" className="login-page">
      <div className="login-header">
        <KeyRound size={40} className="login-icon" />
        <h1>{title}</h1>
      </div>

      <Alert type="error">{error}</Alert>
      <Alert type="success">{info}</Alert>

      {mode === 'login' && (
        <form onSubmit={handleLogin} className="login-form">
          <div className="input-group">
            <label htmlFor="email">אימייל</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
              required
              autoComplete="email"
            />
          </div>
          <div className="input-group">
            <label htmlFor="password">סיסמה</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          </div>

          <button type="submit" className="submit-btn" disabled={loading}>
            {loading ? <LoadingSpinner text="טוען..." inline={true} /> : 'התחברות'}
          </button>
        </form>
      )}

      {mode === 'reset' && (
        <form onSubmit={handleReset} className="login-form">
          <p className="reset-hint">
            הזינו את כתובת האימייל של חשבון הצוות. נשלח קישור לאיפוס הסיסמה.
          </p>
          <div className="input-group">
            <label htmlFor="email">אימייל</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
              required
              autoComplete="email"
            />
          </div>
          <button type="submit" className="submit-btn" disabled={loading || !email.trim()}>
            {loading ? <LoadingSpinner text="שולח..." inline={true} /> : 'שלח קישור לאיפוס'}
          </button>
        </form>
      )}

      {mode === 'setPassword' && (
        <form onSubmit={handleSetPassword} className="login-form">
          <p className="reset-hint">
            הזינו את שמכם ובחרו סיסמה. אחרי השמירה תוכלו להתחבר עם האימייל והסיסמה.
          </p>
          <div className="input-group">
            <label htmlFor="first-name">שם פרטי</label>
            <input
              id="first-name"
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="לדוגמה: דנה"
              autoComplete="given-name"
            />
          </div>
          <div className="input-group">
            <label htmlFor="last-name">שם משפחה</label>
            <input
              id="last-name"
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="לדוגמה: לוי"
              autoComplete="family-name"
            />
          </div>
          <div className="input-group">
            <label htmlFor="new-password">סיסמה חדשה</label>
            <input
              id="new-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="לפחות 6 תווים"
              required
              minLength={6}
              autoComplete="new-password"
            />
          </div>
          <div className="input-group">
            <label htmlFor="confirm-password">אימות סיסמה</label>
            <input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="הקלידו שוב"
              required
              minLength={6}
              autoComplete="new-password"
            />
          </div>
          <button type="submit" className="submit-btn" disabled={loading}>
            {loading ? <LoadingSpinner text="שומר..." inline={true} /> : 'שמור והמשך'}
          </button>
        </form>
      )}

      {mode !== 'setPassword' && (
        <p className="toggle-auth">
          {mode === 'login' ? (
            <button type="button" className="link-btn" onClick={() => switchMode('reset')}>
              שכחתי סיסמה
            </button>
          ) : (
            <button type="button" className="link-btn" onClick={() => switchMode('login')}>
              חזרה להתחברות
            </button>
          )}
        </p>
      )}

      <p className="toggle-auth invite-note">
        חשבונות צוות נפתחים בהזמנה בלבד. אחרי ההזמנה יש להגדיר שם וסיסמה דרך הקישור במייל,
        ואז להתחבר כאן עם האימייל והסיסמה.
      </p>
    </PageContainer>
  );
};

export default LoginPage;
