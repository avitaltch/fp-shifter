import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ProtectedRoute from './ProtectedRoute';
import { useAuth } from '../../context/AuthContext';

vi.mock('../../context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

const authState = ({ role = null, session = null, loading = false } = {}) => ({
  session,
  profile: role ? { first_name: 'דנה', last_name: 'לוי', role } : null,
  role,
  loading,
  signOut: vi.fn(),
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
});
