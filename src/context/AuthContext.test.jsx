import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthProvider, useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
      signOut: vi.fn(),
    },
    from: vi.fn(),
  },
}));

function Probe() {
  const { session, profile, role, loading, profileError, retryProfile, signOut } = useAuth();
  return (
    <div>
      <div data-testid="loading">{String(loading)}</div>
      <div data-testid="session">{session?.user?.id ?? 'none'}</div>
      <div data-testid="role">{role ?? 'none'}</div>
      <div data-testid="name">
        {profile ? `${profile.first_name} ${profile.last_name}` : 'none'}
      </div>
      <div data-testid="profile-error">{String(profileError)}</div>
      <button type="button" onClick={retryProfile}>
        retry
      </button>
      <button type="button" onClick={() => signOut()}>
        sign-out
      </button>
    </div>
  );
}

function mockUsersSingle(result) {
  const single = vi.fn().mockResolvedValue(result);
  const eq = vi.fn().mockReturnValue({ single });
  const select = vi.fn().mockReturnValue({ eq });
  supabase.from.mockReturnValue({ select });
  return { select, eq, single };
}

describe('AuthContext', () => {
  let authChangeCb;
  let unsubscribe;

  beforeEach(() => {
    vi.clearAllMocks();
    unsubscribe = vi.fn();
    authChangeCb = null;
    supabase.auth.onAuthStateChange.mockImplementation((cb) => {
      authChangeCb = cb;
      return { data: { subscription: { unsubscribe } } };
    });
    supabase.auth.signOut.mockResolvedValue({ error: null });
  });

  it('loads the session and profile from public.users (not user_metadata)', async () => {
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: 'user-1' } } },
    });
    mockUsersSingle({
      data: { id: 'user-1', first_name: 'דנה', last_name: 'לוי', role: 'Admin' },
      error: null,
    });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    expect(screen.getByTestId('loading')).toHaveTextContent('true');

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });
    expect(screen.getByTestId('session')).toHaveTextContent('user-1');
    expect(screen.getByTestId('role')).toHaveTextContent('Admin');
    expect(screen.getByTestId('name')).toHaveTextContent('דנה לוי');
    expect(screen.getByTestId('profile-error')).toHaveTextContent('false');
    expect(supabase.from).toHaveBeenCalledWith('users');
  });

  it('clears profile and stops loading when there is no session', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });
    expect(screen.getByTestId('session')).toHaveTextContent('none');
    expect(screen.getByTestId('role')).toHaveTextContent('none');
    expect(screen.getByTestId('profile-error')).toHaveTextContent('false');
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('sets profileError when the users row fetch fails (does not look logged-out)', async () => {
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: 'user-1' } } },
    });
    mockUsersSingle({ data: null, error: new Error('RLS') });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('profile-error')).toHaveTextContent('true');
    });
    expect(screen.getByTestId('session')).toHaveTextContent('user-1');
    expect(screen.getByTestId('role')).toHaveTextContent('none');
    expect(screen.getByTestId('loading')).toHaveTextContent('false');
  });

  it('retryProfile reloads the profile after a failure', async () => {
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: 'user-1' } } },
    });
    const single = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: new Error('timeout') })
      .mockResolvedValueOnce({
        data: { id: 'user-1', first_name: 'דנה', last_name: 'לוי', role: 'Employee' },
        error: null,
      });
    const eq = vi.fn().mockReturnValue({ single });
    const select = vi.fn().mockReturnValue({ eq });
    supabase.from.mockReturnValue({ select });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('profile-error')).toHaveTextContent('true');
    });

    fireEvent.click(screen.getByRole('button', { name: 'retry' }));

    await waitFor(() => {
      expect(screen.getByTestId('profile-error')).toHaveTextContent('false');
    });
    expect(screen.getByTestId('role')).toHaveTextContent('Employee');
    expect(single).toHaveBeenCalledTimes(2);
  });

  it('reacts to onAuthStateChange (e.g. sign-in from another tab)', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    mockUsersSingle({
      data: { id: 'user-2', first_name: 'יוסי', last_name: 'כהן', role: 'Employee' },
      error: null,
    });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    await act(async () => {
      authChangeCb('SIGNED_IN', { user: { id: 'user-2' } });
    });

    await waitFor(() => {
      expect(screen.getByTestId('session')).toHaveTextContent('user-2');
    });
    expect(screen.getByTestId('role')).toHaveTextContent('Employee');
  });

  it('signOut delegates to supabase.auth.signOut', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    fireEvent.click(screen.getByRole('button', { name: 'sign-out' }));
    await waitFor(() => {
      expect(supabase.auth.signOut).toHaveBeenCalled();
    });
  });

  it('unsubscribes from auth changes on unmount', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });

    const { unmount } = render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });
});
