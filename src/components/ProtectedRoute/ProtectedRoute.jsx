import { useState, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import PageContainer from '../PageContainer/PageContainer';

const ProtectedRoute = ({ children, allowedRoles }) => {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const location = useLocation();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

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

  const userRole = session.user.user_metadata?.role;

  if (allowedRoles && !allowedRoles.includes(userRole)) {
    // If the user doesn't have the right role, redirect them to the home page
    return <Navigate to="/" replace />;
  }

  return children;
};

export default ProtectedRoute;
