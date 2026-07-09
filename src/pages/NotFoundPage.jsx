import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import PageContainer from '../components/PageContainer/PageContainer';

const NotFoundPage = () => (
  <PageContainer size="sm">
    <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
      <Compass size={64} style={{ color: 'var(--color-primary, #2563EB)', marginBottom: '1rem' }} />
      <h1>404 — הדף לא נמצא</h1>
      <p style={{ color: '#6B7280', margin: '0.75rem 0 1.5rem' }}>
        הקישור שגוי או שהדף הוסר.
      </p>
      <Link to="/" className="btn-primary">חזרה לדף הבית</Link>
    </div>
  </PageContainer>
);

export default NotFoundPage;
