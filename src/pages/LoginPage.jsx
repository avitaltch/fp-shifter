import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { friendlyError } from '../lib/errors';
import PageContainer from '../components/PageContainer/PageContainer';
import Alert from '../components/Alert/Alert';
import LoadingSpinner from '../components/LoadingSpinner/LoadingSpinner';
import './LoginPage.css';

function destinationAfterLogin(location, role) {
  const from = location.state?.from?.pathname;
  const isAdmin = role === 'Admin';
  const home = isAdmin ? '/admin/dashboard' : '/employee/shifts';
  return from && (isAdmin || !from.startsWith('/admin')) ? from : home;
}

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [businessSlug, setBusinessSlug] = useState('');
  const [businessChoices, setBusinessChoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogin = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const result = await signIn(email, password, businessSlug || undefined);
      navigate(destinationAfterLogin(location, result.role), { replace: true });
    } catch (loginError) {
      if (loginError?.code === 'BUSINESS_SELECTION_REQUIRED') {
        setBusinessChoices(loginError.details?.businesses || []);
        setError('יש לבחור עסק כדי להמשיך.');
      } else {
        setError(friendlyError(loginError, 'לא הצלחנו להתחבר. יש לנסות שוב.'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageContainer size="sm" className="login-page">
      <div className="login-header">
        <KeyRound size={40} className="login-icon" aria-hidden="true" />
        <h1>כניסת צוות</h1>
      </div>

      <Alert type="error">{error}</Alert>
      <Alert type="success">{info}</Alert>

      <form onSubmit={handleLogin} className="login-form">
        <div className="input-group">
          <label htmlFor="email">אימייל</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
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
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••••••"
            required
            autoComplete="current-password"
          />
        </div>
        {businessChoices.length > 0 && (
          <div className="input-group">
            <label htmlFor="business">עסק</label>
            <select
              id="business"
              value={businessSlug}
              onChange={(event) => setBusinessSlug(event.target.value)}
              required
            >
              <option value="">בחירת עסק</option>
              {businessChoices.map((slug) => (
                <option key={slug} value={slug}>{slug}</option>
              ))}
            </select>
          </div>
        )}

        <button type="submit" className="submit-btn" disabled={loading}>
          {loading ? <LoadingSpinner text="מתחבר..." inline={true} /> : 'התחברות'}
        </button>
      </form>

      <p className="toggle-auth">
        <button
          type="button"
          className="link-btn"
          onClick={() => {
            setError(null);
            setInfo('לאיפוס סיסמה יש לפנות לבעלים של העסק.');
          }}
        >
          שכחתי סיסמה
        </button>
      </p>

      <p className="toggle-auth invite-note">
        חשבונות צוות נפתחים על ידי בעלים או מנהל בלבד. אין הרשמה ציבורית.
      </p>
    </PageContainer>
  );
};

export default LoginPage;
