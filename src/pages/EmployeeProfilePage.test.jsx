import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import EmployeeProfilePage from './EmployeeProfilePage';
import { updateStaffProfile } from '../lib/api';
import { supabase } from '../lib/supabase';

const mockRetryProfile = vi.fn();

vi.mock('../lib/api', () => ({
  updateStaffProfile: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      updateUser: vi.fn(),
    },
  },
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    session: { user: { id: 'user-1', email: 'dana@example.com' } },
    profile: {
      id: 'user-1',
      first_name: 'דנה',
      last_name: 'לוי',
      role: 'Employee',
      phone: '050-1111111',
    },
    role: 'Employee',
    loading: false,
    retryProfile: mockRetryProfile,
  }),
}));

describe('EmployeeProfilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders profile fields from auth context', () => {
    render(<EmployeeProfilePage />);

    expect(screen.getByRole('heading', { name: 'הפרופיל שלי' })).toBeInTheDocument();
    expect(screen.getByLabelText('אימייל')).toHaveValue('dana@example.com');
    expect(screen.getByLabelText('תפקיד')).toHaveValue('עובד/ת');
    expect(screen.getByLabelText('שם פרטי')).toHaveValue('דנה');
    expect(screen.getByLabelText('שם משפחה')).toHaveValue('לוי');
    expect(screen.getByLabelText('טלפון')).toHaveValue('050-1111111');
  });

  it('saves name and phone then refreshes the auth profile', async () => {
    updateStaffProfile.mockResolvedValue({
      id: 'user-1',
      first_name: 'דנית',
      last_name: 'לוי',
      phone: '050-2222222',
    });

    render(<EmployeeProfilePage />);

    fireEvent.change(screen.getByLabelText('שם פרטי'), { target: { value: 'דנית' } });
    fireEvent.change(screen.getByLabelText('טלפון'), { target: { value: '050-2222222' } });
    fireEvent.click(screen.getByRole('button', { name: 'שמור פרטים' }));

    await waitFor(() => {
      expect(updateStaffProfile).toHaveBeenCalledWith('user-1', {
        first_name: 'דנית',
        last_name: 'לוי',
        phone: '050-2222222',
      });
    });
    expect(await screen.findByText('הפרופיל עודכן בהצלחה.')).toBeInTheDocument();
    expect(mockRetryProfile).toHaveBeenCalled();
  });

  it('updates password via supabase auth', async () => {
    supabase.auth.updateUser.mockResolvedValue({ data: {}, error: null });

    render(<EmployeeProfilePage />);

    fireEvent.change(screen.getByLabelText('סיסמה חדשה'), { target: { value: 'secret1' } });
    fireEvent.change(screen.getByLabelText('אימות סיסמה'), { target: { value: 'secret1' } });
    fireEvent.click(screen.getByRole('button', { name: 'עדכן סיסמה' }));

    await waitFor(() => {
      expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: 'secret1' });
    });
    expect(await screen.findByText('הסיסמה עודכנה בהצלחה.')).toBeInTheDocument();
  });

  it('rejects mismatched passwords without calling updateUser', async () => {
    render(<EmployeeProfilePage />);

    fireEvent.change(screen.getByLabelText('סיסמה חדשה'), { target: { value: 'secret1' } });
    fireEvent.change(screen.getByLabelText('אימות סיסמה'), { target: { value: 'other' } });
    fireEvent.click(screen.getByRole('button', { name: 'עדכן סיסמה' }));

    expect(await screen.findByText('הסיסמאות אינן תואמות.')).toBeInTheDocument();
    expect(supabase.auth.updateUser).not.toHaveBeenCalled();
  });
});
