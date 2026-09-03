import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '../context/AuthContext';
import LoginPage from './LoginPage';

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }));

function renderPage(entry = '/login') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <LoginPage />
    </MemoryRouter>
  );
}

function fillCredentials() {
  fireEvent.change(screen.getByLabelText('אימייל'), {
    target: { value: ' Owner@Example.com ' },
  });
  fireEvent.change(screen.getByLabelText('סיסמה'), {
    target: { value: 'correct password' },
  });
}

describe('LoginPage', () => {
  let signIn;

  beforeEach(() => {
    vi.clearAllMocks();
    signIn = vi.fn().mockResolvedValue({ role: 'Admin' });
    useAuth.mockReturnValue({ signIn });
  });

  it('authenticates an owner and routes to management', async () => {
    renderPage();
    fillCredentials();
    fireEvent.click(screen.getByRole('button', { name: 'התחברות' }));

    await waitFor(() => {
      expect(signIn).toHaveBeenCalledWith(
        'Owner@Example.com',
        'correct password',
        undefined
      );
    });
    expect(mockNavigate).toHaveBeenCalledWith('/admin/dashboard', {
      replace: true,
    });
  });

  it('routes providers to their schedule', async () => {
    signIn.mockResolvedValue({ role: 'Employee' });
    renderPage();
    fillCredentials();
    fireEvent.click(screen.getByRole('button', { name: 'התחברות' }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/employee/shifts', {
        replace: true,
      });
    });
  });

  it('restores an allowed route after login', async () => {
    renderPage({
      pathname: '/login',
      state: { from: { pathname: '/admin/team' } },
    });
    fillCredentials();
    fireEvent.click(screen.getByRole('button', { name: 'התחברות' }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/admin/team', { replace: true });
    });
  });

  it('asks multi-business staff to choose a tenant before retrying', async () => {
    signIn
      .mockRejectedValueOnce({
        code: 'BUSINESS_SELECTION_REQUIRED',
        details: { businesses: ['happy-pets-demo', 'second-business'] },
      })
      .mockResolvedValueOnce({ role: 'Admin' });
    renderPage();
    fillCredentials();
    fireEvent.click(screen.getByRole('button', { name: 'התחברות' }));

    expect(await screen.findByText('יש לבחור עסק כדי להמשיך.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('עסק'), {
      target: { value: 'second-business' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'התחברות' }));

    await waitFor(() => {
      expect(signIn).toHaveBeenLastCalledWith(
        'Owner@Example.com',
        'correct password',
        'second-business'
      );
    });
  });

  it('shows generic credentials and local reset guidance without external calls', async () => {
    signIn.mockRejectedValue({ code: 'INVALID_CREDENTIALS' });
    renderPage();
    fillCredentials();
    fireEvent.click(screen.getByRole('button', { name: 'התחברות' }));

    expect(await screen.findByText('אימייל או סיסמה שגויים.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'שכחתי סיסמה' }));
    expect(
      screen.getByText('לאיפוס סיסמה יש לפנות לבעלים של העסק.')
    ).toBeInTheDocument();
  });
});
