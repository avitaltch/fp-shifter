import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ProtectedRoute from './ProtectedRoute';
import { useAuth } from '../../context/AuthContext';

vi.mock('../../context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

const authState = ({
  role = null,
  session = null,
  loading = false,
  profileError = false,
  accountDisabled = false,
  retryProfile = vi.fn(),
  signOut = vi.fn().mockResolvedValue(undefined),
} = {}) => ({
  session,
  profile: role ? { first_name: 'דנה', last_name: 'לוי', role } : null,
  role,
  loading,
  profileError,
  accountDisabled,
  retryProfile,
  signOut,
});

const renderProtected = (allowedRoles) =>
  render(
    <MemoryRouter initialEntries={['/protected']}>
      <Routes>
        <Route path="/login" element={<div>Login Page</div>} />
        <Route path="/" element={<div>Home Page</div>} />
        <Route
          path="/protected"
          element={
            <ProtectedRoute allowedRoles={allowedRoles}>
              <div>Protected Content</div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>
  );

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a loading indicator while auth is resolving', () => {
    useAuth.mockReturnValue(authState({ loading: true }));
    renderProtected(['Admin']);

    expect(screen.getByText('טוען...')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('redirects to /login when there is no session', () => {
    useAuth.mockReturnValue(authState());
    renderProtected(['Admin']);

    expect(screen.getByText('Login Page')).toBeInTheDocument();
  });

  it('redirects home when the role from the users table is not allowed', () => {
    useAuth.mockReturnValue(
      authState({ session: { user: { id: 'user-1' } }, role: 'Employee' })
    );
    renderProtected(['Admin']);

    expect(screen.getByText('Home Page')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('renders the children when the role is allowed', () => {
    useAuth.mockReturnValue(
      authState({ session: { user: { id: 'user-1' } }, role: 'Admin' })
    );
    renderProtected(['Admin']);

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it('accepts any of the allowed roles', () => {
    useAuth.mockReturnValue(
      authState({ session: { user: { id: 'user-1' } }, role: 'Employee' })
    );
    renderProtected(['Employee', 'Admin']);

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it('renders the children for any authenticated user when no roles are required', () => {
    useAuth.mockReturnValue(
      authState({ session: { user: { id: 'user-1' } }, role: 'Employee' })
    );
    renderProtected(undefined);

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it('shows a retry state (not a redirect) when the profile fetch failed', () => {
    const retryProfile = vi.fn();
    useAuth.mockReturnValue(
      authState({
        session: { user: { id: 'user-1' } },
        profileError: true,
        retryProfile,
      })
    );
    renderProtected(['Admin']);

    expect(screen.getByText('שגיאה בטעינת פרופיל המשתמש.')).toBeInTheDocument();
    expect(screen.queryByText('Home Page')).not.toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'נסה שוב' }));
    expect(retryProfile).toHaveBeenCalledTimes(1);
  });

  it('offers a sign-out escape hatch next to retry when the profile fetch failed', () => {
    const signOut = vi.fn().mockResolvedValue(undefined);
    useAuth.mockReturnValue(
      authState({
        session: { user: { id: 'user-1' } },
        profileError: true,
        signOut,
      })
    );
    renderProtected(['Admin']);

    fireEvent.click(screen.getByRole('button', { name: 'התנתק' }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('shows the deactivated-account message instead of redirecting', () => {
    useAuth.mockReturnValue(authState({ accountDisabled: true }));
    renderProtected(['Admin']);

    expect(screen.getByText('החשבון הושבת. פנו למנהל.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'חזרה למסך הכניסה' })).toHaveAttribute(
      'href',
      '/login'
    );
    expect(screen.queryByText('Login Page')).not.toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });
});
