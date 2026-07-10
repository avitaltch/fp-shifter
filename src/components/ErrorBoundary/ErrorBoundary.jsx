import { Component } from 'react';
import { AlertTriangle } from 'lucide-react';
import PageContainer from '../PageContainer/PageContainer';

// Catches unexpected render/lifecycle crashes that try/catch cannot.
// Async API failures are handled by useAsyncData / useAction / friendlyError;
// this is the last line of defense against a white screen.
class ErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('Unhandled UI error:', error, info?.componentStack);
  }

  handleReload = () => {
    window.location.assign('/');
  };

  handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <PageContainer size="sm">
          <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
            <AlertTriangle
              size={56}
              style={{ color: 'var(--danger, #DC2626)', marginBottom: '1rem' }}
              aria-hidden="true"
            />
            <h1>משהו השתבש</h1>
            <p style={{ color: 'var(--text-secondary, #6B7280)', margin: '0.75rem 0 1.5rem' }}>
              אירעה שגיאה בלתי צפויה. אפשר לנסות שוב או לחזור לדף הבית.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button type="button" className="btn-primary" onClick={this.handleRetry}>
                נסה שוב
              </button>
              <button type="button" className="btn-secondary" onClick={this.handleReload}>
                חזרה לדף הבית
              </button>
            </div>
          </div>
        </PageContainer>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
