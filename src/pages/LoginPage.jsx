import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { KeyRound, User } from 'lucide-react';
import PageContainer from '../components/PageContainer/PageContainer';
import './LoginPage.css';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isSignUp) {
        if (!fullName) {
          throw new Error("נא להזין שם מלא");
        }
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
              role: 'Employee' // Default role for new signups
            }
          }
        });
        if (error) throw error;
        // With email confirmation disabled, they should be logged in automatically
        navigate('/employee/shifts');
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        navigate('/manager/dashboard'); // Or logic based on role
      }
    } catch (err) {
      setError(err.message || 'אירעה שגיאה. יש לנסות שוב.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageContainer size="sm" className="login-page">
      <div className="login-header">
          <KeyRound size={40} className="login-icon" />
          <h1>{isSignUp ? 'יצירת משתמש חדש' : 'התחברות למערכת'}</h1>
        </div>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleAuth} className="login-form">
          {isSignUp && (
            <div className="input-group">
              <label htmlFor="fullName"><User size={16} /> שם מלא</label>
              <input
                id="fullName"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="ישראל ישראלי"
                required={isSignUp}
              />
            </div>
          )}
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
            {loading ? 'טוען...' : (isSignUp ? 'הרשמה' : 'התחברות')}
          </button>
        </form>

        <p className="toggle-auth">
          {isSignUp ? 'כבר קיים חשבון משתמש? ' : 'טרם נרשמת? '}
          <button type="button" onClick={() => setIsSignUp(!isSignUp)} className="link-btn">
            {isSignUp ? 'כניסה למערכת' : 'הרשמה עכשיו'}
          </button>
        </p>
    </PageContainer>
  );
};

export default LoginPage;
