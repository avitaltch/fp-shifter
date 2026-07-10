import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import PageContainer from '../PageContainer/PageContainer';
import LoadingSpinner from '../LoadingSpinner/LoadingSpinner';

// UI-level gate only — real enforcement is the RLS in supabase/rls.sql.
// The role comes from public.users via AuthContext, not user_metadata.
const ProtectedRoute = ({ children, allowedRoles }) => {
  const { session, role, loading, profileError, accountDisabled, retryProfile, signOut } =
    useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <PageContainer size="sm">
        <LoadingSpinner text="טוען..." />
      </PageContainer>
    );
  }

  // Deactivated account: AuthContext already dropped the session — explain
  // why instead of bouncing to the login form with no context.
  if (accountDisabled) {
    return (
      <PageContainer size="sm">
        <div style={{ textAlign: 'center', padding: '2rem 0' }}>
          <p className="error-text">החשבון הושבת. פנו למנהל.</p>
          <Link to="/login" className="btn-primary">
            חזרה למסך הכניסה
          </Link>
        </div>
      </PageContainer>
    );
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Logged in but the profile fetch failed — offer a retry instead of
  // silently redirecting (which looks like a permissions problem).
  if (profileError) {
    return (
      <PageContainer size="sm">
        <div style={{ textAlign: 'center', padding: '2rem 0' }}>
          <p className="error-text">שגיאה בטעינת פרופיל המשתמש.</p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <button type="button" className="btn-primary" onClick={retryProfile}>
              נסה שוב
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => signOut().catch((err) => console.error('Sign out failed:', err))}
            >
              התנתק
            </button>
          </div>
        </div>
      </PageContainer>
    );
  }

  if (allowedRoles && !allowedRoles.includes(role)) {
    return <Navigate to="/" replace />;
  }

  return children;
};

export default ProtectedRoute;
