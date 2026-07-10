import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { friendlyError } from '../lib/errors';
import { KeyRound } from 'lucide-react';
import PageContainer from '../components/PageContainer/PageContainer';
import Alert from '../components/Alert/Alert';
import LoadingSpinner from '../components/LoadingSpinner/LoadingSpinner';
import './LoginPage.css';

// Staff login only. There is no public sign-up: employees are invited by an
// Admin (Supabase Dashboard -> Authentication -> Invite user), which keeps
// customer data readable by real staff only.
const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('login'); // 'login' | 'reset'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();

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

      // Role lives in public.users (RLS-protected), not in user_metadata.
      const { data: profile } = await supabase
        .from('users')
        .select('role')
        .eq('id', data.user.id)
        .single();

      const from = location.state?.from?.pathname;
      const home = profile?.role === 'Admin' ? '/admin/dashboard' : '/employee/shifts';
      navigate(from || home, { replace: true });
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  // Uses the existing Supabase Auth API — email delivery is configured in the
  // project dashboard; the app only triggers the request and shows confirmation.
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

  const switchMode = (next) => {
    setMode(next);
    setError(null);
    setInfo(null);
  };

  return (
    <PageContainer size="sm" className="login-page">
      <div className="login-header">
        <KeyRound size={40} className="login-icon" />
        <h1>{mode === 'login' ? 'כניסת צוות' : 'איפוס סיסמה'}</h1>
      </div>

      <Alert type="error">{error}</Alert>
      <Alert type="success">{info}</Alert>

      {mode === 'login' ? (
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
      ) : (
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

      <p className="toggle-auth invite-note">
        חשבונות צוות נפתחים בהזמנה בלבד. לקבלת גישה יש לפנות למנהל המערכת.
      </p>
    </PageContainer>
  );
};

export default LoginPage;
