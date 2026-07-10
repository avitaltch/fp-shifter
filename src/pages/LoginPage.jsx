import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { friendlyError } from '../lib/errors';
import { KeyRound } from 'lucide-react';
import PageContainer from '../components/PageContainer/PageContainer';
import Alert from '../components/Alert/Alert';
import LoadingSpinner from '../components/LoadingSpinner/LoadingSpinner';
import './LoginPage.css';

// Invite / recovery email links land on /login with tokens in the URL.
// Supabase establishes a session; we must then collect a password via
// updateUser — otherwise the user has an account but nothing to type at login.
function authLinkTypeFromUrl() {
  const hash = window.location.hash?.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash || '';
  const fromHash = new URLSearchParams(hash).get('type');
  if (fromHash) return fromHash;
  return new URLSearchParams(window.location.search).get('type');
}

function clearAuthParamsFromUrl() {
  const url = new URL(window.location.href);
  url.hash = '';
  ['code', 'type', 'error', 'error_description'].forEach((key) => url.searchParams.delete(key));
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}`);
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

// Staff login only. There is no public sign-up: employees are invited by an
// Admin (Supabase Dashboard -> Authentication -> Invite user).
const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [mode, setMode] = useState('login'); // 'login' | 'reset' | 'setPassword'
  const [loading, setLoading] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    let cancelled = false;

    const enterSetPassword = (message) => {
      if (cancelled) return;
      setMode('setPassword');
      setError(null);
      setInfo(message);
      clearAuthParamsFromUrl();
    };

    const linkType = authLinkTypeFromUrl();
    if (linkType === 'invite' || linkType === 'signup') {
      enterSetPassword('ההזמנה אושרה. בחרו סיסמה כדי להשלים את ההרשמה.');
    } else if (linkType === 'recovery') {
      enterSetPassword('בחרו סיסמה חדשה לחשבון.');
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        enterSetPassword('בחרו סיסמה חדשה לחשבון.');
      } else if (event === 'SIGNED_IN' && (linkType === 'invite' || linkType === 'signup')) {
        enterSetPassword('ההזמנה אושרה. בחרו סיסמה כדי להשלים את ההרשמה.');
      }
    });

    // Invite/recovery may already have created a session before this mount.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      if (
        session &&
        (linkType === 'invite' || linkType === 'signup' || linkType === 'recovery')
      ) {
        enterSetPassword(
          linkType === 'recovery'
            ? 'בחרו סיסמה חדשה לחשבון.'
            : 'ההזמנה אושרה. בחרו סיסמה כדי להשלים את ההרשמה.'
        );
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
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/login`,
      });
      if (resetError) throw resetError;
      setInfo('אם קיים חשבון עם כתובת זו, נשלח אליה קישור לאיפוס סיסמה.');
    } catch (err) {
      setError(friendlyError(err, 'שגיאה בשליחת קישור האיפוס.'));
    } finally {
      setLoading(false);
    }
  };

  const handleSetPassword = async (e) => {
    e.preventDefault();
    setError(null);
    setInfo(null);

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
      clearAuthParamsFromUrl();
      await navigateAfterAuth(navigate, location, data.user.id);
    } catch (err) {
      setError(friendlyError(err, 'שגיאה בשמירת הסיסמה. נסו שוב או בקשו הזמנה חדשה.'));
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
    mode === 'setPassword' ? 'הגדרת סיסמה' : mode === 'reset' ? 'איפוס סיסמה' : 'כניסת צוות';

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
            זו ההשלמה של הזמנת הצוות / איפוס הסיסמה. אחרי השמירה תוכלו להתחבר עם הסיסמה החדשה.
          </p>
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
            {loading ? <LoadingSpinner text="שומר..." inline={true} /> : 'שמור סיסמה והמשך'}
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
        חשבונות צוות נפתחים בהזמנה בלבד. אחרי ההזמנה יש להגדיר סיסמה דרך הקישור במייל,
        ואז להתחבר כאן עם האימייל והסיסמה.
      </p>
    </PageContainer>
  );
};

export default LoginPage;
