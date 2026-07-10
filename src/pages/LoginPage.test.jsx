import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LoginPage from './LoginPage';
import { supabase } from '../lib/supabase';

const { mockNavigate, mockUseLocation } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockUseLocation: vi.fn(),
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: mockUseLocation,
  };
});

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn(),
      resetPasswordForEmail: vi.fn(),
    },
    from: vi.fn(),
  },
}));

// supabase.from('users').select('role').eq('id', ...).single()
function mockProfileFetch(profile) {
  const single = vi.fn().mockResolvedValue({ data: profile, error: null });
  const eq = vi.fn().mockReturnValue({ single });
  const select = vi.fn().mockReturnValue({ eq });
  supabase.from.mockReturnValue({ select });
  return { select, eq, single };
}

const fillAndSubmit = () => {
  fireEvent.change(screen.getByLabelText('אימייל'), {
    target: { value: 'staff@example.com' },
  });
  fireEvent.change(screen.getByLabelText('סיסמה'), {
    target: { value: 'secret123' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'התחברות' }));
};

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseLocation.mockReturnValue({ pathname: '/login', state: null });
    supabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
  });

  it('renders a login-only form (no sign-up UI)', () => {
    render(<MemoryRouter><LoginPage /></MemoryRouter>);

    expect(screen.getByText('כניסת צוות')).toBeInTheDocument();
    expect(screen.getByLabelText('אימייל')).toBeInTheDocument();
    expect(screen.getByLabelText('סיסמה')).toBeInTheDocument();
    expect(screen.queryByText(/הרשמה/)).not.toBeInTheDocument();
    expect(
      screen.getByText(/חשבונות צוות נפתחים בהזמנה בלבד/)
    ).toBeInTheDocument();
  });

  it('signs in and fetches the role from the users table (not user_metadata)', async () => {
    const chain = mockProfileFetch({ role: 'Employee' });

    render(<MemoryRouter><LoginPage /></MemoryRouter>);
    fillAndSubmit();

    await waitFor(() => {
      expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'staff@example.com',
        password: 'secret123',
      });
    });

    expect(supabase.from).toHaveBeenCalledWith('users');
    expect(chain.select).toHaveBeenCalledWith('role');
    expect(chain.eq).toHaveBeenCalledWith('id', 'user-1');
  });

  it('redirects Admins to /admin/dashboard', async () => {
    mockProfileFetch({ role: 'Admin' });

    render(<MemoryRouter><LoginPage /></MemoryRouter>);
    fillAndSubmit();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/admin/dashboard', { replace: true });
    });
  });

  it('redirects Employees to /employee/shifts', async () => {
    mockProfileFetch({ role: 'Employee' });

    render(<MemoryRouter><LoginPage /></MemoryRouter>);
    fillAndSubmit();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/employee/shifts', { replace: true });
    });
  });

  it('prefers the protected page the user came from over the role home', async () => {
    mockUseLocation.mockReturnValue({
      pathname: '/login',
      state: { from: { pathname: '/employee/availability' } },
    });
    mockProfileFetch({ role: 'Admin' });

    render(<MemoryRouter><LoginPage /></MemoryRouter>);
    fillAndSubmit();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/employee/availability', { replace: true });
    });
  });

  it('shows a friendly Hebrew error for bad credentials and does not navigate', async () => {
    supabase.auth.signInWithPassword.mockResolvedValue({
      data: null,
      error: new Error('Invalid login credentials'),
    });

    render(<MemoryRouter><LoginPage /></MemoryRouter>);
    fillAndSubmit();

    expect(
      await screen.findByText('אימייל או סיסמה שגויים.')
    ).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('shows a generic Hebrew error for unexpected failures', async () => {
    supabase.auth.signInWithPassword.mockRejectedValue(new Error('network down'));

    render(<MemoryRouter><LoginPage /></MemoryRouter>);
    fillAndSubmit();

    expect(
      await screen.findByText('אירעה שגיאה. יש לנסות שוב.')
    ).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('switches to reset mode and sends a password-reset email', async () => {
    supabase.auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });

    render(<MemoryRouter><LoginPage /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'שכחתי סיסמה' }));

    expect(screen.getByRole('heading', { name: 'איפוס סיסמה' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('אימייל'), {
      target: { value: 'staff@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'שלח קישור לאיפוס' }));

    await waitFor(() => {
      expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith(
        'staff@example.com',
        expect.objectContaining({ redirectTo: expect.stringContaining('/login') })
      );
    });
    expect(
      await screen.findByText(/נשלח אליה קישור לאיפוס סיסמה/)
    ).toBeInTheDocument();
  });

  it('returns to the login form from reset mode', () => {
    render(<MemoryRouter><LoginPage /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'שכחתי סיסמה' }));
    fireEvent.click(screen.getByRole('button', { name: 'חזרה להתחברות' }));
    expect(screen.getByRole('heading', { name: 'כניסת צוות' })).toBeInTheDocument();
  });
});
