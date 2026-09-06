import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { changeStaffPassword, updateMyOperatorProfile } from '../lib/api';
import EmployeeProfilePage from './EmployeeProfilePage';

const { auth } = vi.hoisted(() => ({
  auth: {
    session: {
      user: {
        id: 'user-1',
        email: 'dana@example.test',
        mustChangePassword: false,
      },
      business: { role: 'Provider' },
    },
    profile: {
      id: 'user-1',
      first_name: 'דנה',
      last_name: 'לוי',
      phone: '+972501111111',
      membership_role: 'Provider',
    },
    retryProfile: vi.fn(),
  },
}));

vi.mock('../lib/api', () => ({
  changeStaffPassword: vi.fn(),
  updateMyOperatorProfile: vi.fn(),
}));
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }));

describe('EmployeeProfilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.session.user.mustChangePassword = false;
    auth.retryProfile.mockResolvedValue(undefined);
  });

  it('updates only the authenticated profile through NestJS', async () => {
    updateMyOperatorProfile.mockResolvedValue({
      firstName: 'דנית',
      lastName: 'לוי',
      phoneE164: '+972502222222',
    });
    render(<EmployeeProfilePage />);
    fireEvent.change(screen.getByLabelText('שם פרטי'), { target: { value: 'דנית' } });
    fireEvent.change(screen.getByLabelText('טלפון'), {
      target: { value: '+972502222222' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'שמור פרטים' }));

    await waitFor(() =>
      expect(updateMyOperatorProfile).toHaveBeenCalledWith({
        firstName: 'דנית',
        lastName: 'לוי',
        phoneE164: '+972502222222',
      })
    );
    expect(auth.retryProfile).toHaveBeenCalled();
  });

  it('requires and submits the current password', async () => {
    changeStaffPassword.mockResolvedValue(null);
    render(<EmployeeProfilePage />);
    fireEvent.change(screen.getByLabelText('סיסמה נוכחית'), {
      target: { value: 'current-password' },
    });
    fireEvent.change(screen.getByLabelText('סיסמה חדשה'), {
      target: { value: 'new-secure-password' },
    });
    fireEvent.change(screen.getByLabelText('אימות סיסמה'), {
      target: { value: 'new-secure-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'עדכן סיסמה' }));

    await waitFor(() =>
      expect(changeStaffPassword).toHaveBeenCalledWith(
        'current-password',
        'new-secure-password'
      )
    );
    expect(auth.retryProfile).toHaveBeenCalled();
  });

  it('forces temporary-password users through password change first', () => {
    auth.session.user.mustChangePassword = true;
    render(<EmployeeProfilePage />);
    expect(screen.getByText(/זו הכניסה הראשונה שלך/)).toBeInTheDocument();
    expect(screen.getByLabelText('סיסמה זמנית')).toBeInTheDocument();
    expect(screen.queryByLabelText('שם פרטי')).not.toBeInTheDocument();
  });

  it('rejects short or mismatched passwords locally', async () => {
    render(<EmployeeProfilePage />);
    fireEvent.change(screen.getByLabelText('סיסמה חדשה'), { target: { value: 'short' } });
    fireEvent.change(screen.getByLabelText('אימות סיסמה'), { target: { value: 'other' } });
    fireEvent.click(screen.getByRole('button', { name: 'עדכן סיסמה' }));
    expect(await screen.findByText(/לפחות 12 תווים/)).toBeInTheDocument();
    expect(changeStaffPassword).not.toHaveBeenCalled();
  });
});
