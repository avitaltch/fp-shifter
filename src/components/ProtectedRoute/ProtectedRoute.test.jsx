import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ProtectedRoute from './ProtectedRoute';
import { supabase } from '../../lib/supabase';

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    }
  }
}));

const TestComponent = () => <div>Protected Content</div>;
const LoginComponent = () => <div>Login Page</div>;
const HomeComponent = () => <div>Home Page</div>;

const renderWithRouter = (ui, initialRoute = '/') => {
  window.history.pushState({}, 'Test page', initialRoute);
  return render(
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginComponent />} />
        <Route path="/" element={<HomeComponent />} />
        <Route path="/protected" element={ui} />
      </Routes>
    </BrowserRouter>
  );
};

describe('ProtectedRoute Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', () => {
    supabase.auth.getSession.mockResolvedValue(new Promise(() => {})); // Never resolves
    
    renderWithRouter(
      <ProtectedRoute>
        <TestComponent />
      </ProtectedRoute>,
      '/protected'
    );
    
    expect(screen.getByText('טוען...')).toBeInTheDocument();
  });

  it('redirects to login if not authenticated', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    
    renderWithRouter(
      <ProtectedRoute>
        <TestComponent />
      </ProtectedRoute>,
      '/protected'
    );
    
    await waitFor(() => {
      expect(screen.getByText('Login Page')).toBeInTheDocument();
    });
  });

  it('renders children if authenticated and no roles required', async () => {
    supabase.auth.getSession.mockResolvedValue({ 
      data: { 
        session: { 
          user: { user_metadata: { role: 'Employee' } } 
        } 
      } 
    });
    
    renderWithRouter(
      <ProtectedRoute>
        <TestComponent />
      </ProtectedRoute>,
      '/protected'
    );
    
    await waitFor(() => {
      expect(screen.getByText('Protected Content')).toBeInTheDocument();
    });
  });

  it('redirects to home if authenticated but wrong role', async () => {
    supabase.auth.getSession.mockResolvedValue({ 
      data: { 
        session: { 
          user: { user_metadata: { role: 'Employee' } } 
        } 
      } 
    });
    
    renderWithRouter(
      <ProtectedRoute allowedRoles={['Manager']}>
        <TestComponent />
      </ProtectedRoute>,
      '/protected'
    );
    
    await waitFor(() => {
      expect(screen.getByText('Home Page')).toBeInTheDocument();
    });
  });

  it('renders children if authenticated and correct role', async () => {
    supabase.auth.getSession.mockResolvedValue({ 
      data: { 
        session: { 
          user: { user_metadata: { role: 'Manager' } } 
        } 
      } 
    });
    
    renderWithRouter(
      <ProtectedRoute allowedRoles={['Manager']}>
        <TestComponent />
      </ProtectedRoute>,
      '/protected'
    );
    
    await waitFor(() => {
      expect(screen.getByText('Protected Content')).toBeInTheDocument();
    });
  });
});
