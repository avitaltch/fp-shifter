import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { friendlyError } from '../lib/errors';
import { KeyRound } from 'lucide-react';
import PageContainer from '../components/PageContainer/PageContainer';
import LoadingSpinner from '../components/LoadingSpinner/LoadingSpinner';
import './LoginPage.css';

// Staff login only. There is no public sign-up: employees are invited by an
// Admin (Supabase Dashboard -> Authentication -> Invite user), which keeps
// customer data readable by real staff only.
const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

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

  return (
    <PageContainer size="sm" className="login-page">
      <div className="login-header">
        <KeyRound size={40} className="login-icon" />
        <h1>כניסת צוות</h1>
      </div>

      {error && <div className="error-message">{error}</div>}

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
          />
        </div>

        <button type="submit" className="submit-btn" disabled={loading}>
          {loading ? <LoadingSpinner text="טוען..." inline={true} /> : 'התחברות'}
        </button>
      </form>

      <p className="toggle-auth">
        חשבונות צוות נפתחים בהזמנה בלבד. לקבלת גישה יש לפנות למנהל המערכת.
      </p>
    </PageContainer>
  );
};

export default LoginPage;
