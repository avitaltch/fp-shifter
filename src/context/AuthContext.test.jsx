import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearStaffAccessToken,
  loginStaff,
  logoutStaff,
  refreshStaffSession,
} from '../lib/api';
import { AuthProvider } from './AuthProvider';
import { useAuth } from './AuthContext';

vi.mock('../lib/api', () => ({
  clearStaffAccessToken: vi.fn(),
  loginStaff: vi.fn(),
  logoutStaff: vi.fn(),
  refreshStaffSession: vi.fn(),
}));

const ownerSession = {
  accessToken: 'access-token',
  expiresInSeconds: 900,
  user: {
    id: 'user-1',
    email: 'owner@example.com',
    firstName: 'דנה',
    lastName: 'לוי',
    phoneE164: '+972501111111',
    mustChangePassword: false,
  },
  business: {
    id: 'business-1',
    slug: 'happy-pets-demo',
    role: 'Owner',
  },
};

function Probe() {
  const auth = useAuth();
  return (
    <div>
      <div data-testid="loading">{String(auth.loading)}</div>
      <div data-testid="session">{auth.session?.user?.id ?? 'none'}</div>
      <div data-testid="role">{auth.role ?? 'none'}</div>
      <div data-testid="membership-role">{auth.profile?.membership_role ?? 'none'}</div>
      <div data-testid="profile-error">{String(auth.profileError)}</div>
      <button type="button" onClick={() => auth.signIn(' OWNER@example.com ', 'secret')}>
        sign-in
      </button>
      <button type="button" onClick={() => auth.signOut()}>
        sign-out
      </button>
      <button type="button" onClick={auth.retryProfile}>retry</button>
    </div>
  );
}

function renderProvider() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  );
}

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    refreshStaffSession.mockResolvedValue(ownerSession);
    loginStaff.mockResolvedValue(ownerSession);
    logoutStaff.mockResolvedValue(undefined);
  });

  it('restores the HttpOnly refresh session and maps owner roles for transitional UI', async () => {
    renderProvider();

    expect(screen.getByTestId('loading')).toHaveTextContent('true');
    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });
    expect(screen.getByTestId('session')).toHaveTextContent('user-1');
    expect(screen.getByTestId('role')).toHaveTextContent('Admin');
    expect(screen.getByTestId('membership-role')).toHaveTextContent('Owner');
    expect(screen.getByTestId('profile-error')).toHaveTextContent('false');
  });

  it('treats a missing refresh cookie as anonymous, not a profile outage', async () => {
    refreshStaffSession.mockRejectedValue({ status: 401 });
    renderProvider();

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });
    expect(screen.getByTestId('session')).toHaveTextContent('none');
    expect(screen.getByTestId('profile-error')).toHaveTextContent('false');
    expect(clearStaffAccessToken).toHaveBeenCalled();
  });

  it('surfaces API restoration errors and retries', async () => {
    refreshStaffSession
      .mockRejectedValueOnce({ code: 'API_UNAVAILABLE' })
      .mockResolvedValueOnce(ownerSession);
    renderProvider();

    await waitFor(() => {
      expect(screen.getByTestId('profile-error')).toHaveTextContent('true');
    });
    fireEvent.click(screen.getByRole('button', { name: 'retry' }));
    await waitFor(() => {
      expect(screen.getByTestId('session')).toHaveTextContent('user-1');
    });
  });

  it('normalizes sign-in email and maps providers to the existing staff UI', async () => {
    refreshStaffSession.mockRejectedValue({ status: 401 });
    loginStaff.mockResolvedValue({
      ...ownerSession,
      business: { ...ownerSession.business, role: 'Provider' },
    });
    renderProvider();
    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });
    fireEvent.click(screen.getByRole('button', { name: 'sign-in' }));

    await waitFor(() => {
      expect(loginStaff).toHaveBeenCalledWith({
        email: 'owner@example.com',
        password: 'secret',
      });
    });
    expect(screen.getByTestId('role')).toHaveTextContent('Employee');
  });

  it('revokes the server session before clearing local auth state', async () => {
    renderProvider();
    await waitFor(() => {
      expect(screen.getByTestId('session')).toHaveTextContent('user-1');
    });
    fireEvent.click(screen.getByRole('button', { name: 'sign-out' }));

    await waitFor(() => expect(logoutStaff).toHaveBeenCalled());
    expect(screen.getByTestId('session')).toHaveTextContent('none');
  });
});
