import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import PageContainer from '../PageContainer/PageContainer';

// UI-level gate only — real enforcement is the RLS in supabase/rls.sql.
// The role comes from public.users via AuthContext, not user_metadata.
const ProtectedRoute = ({ children, allowedRoles }) => {
  const { session, role, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <PageContainer size="sm">
        <div style={{ textAlign: 'center' }}>טוען...</div>
      </PageContainer>
    );
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(role)) {
    return <Navigate to="/" replace />;
  }

  return children;
};

export default ProtectedRoute;
