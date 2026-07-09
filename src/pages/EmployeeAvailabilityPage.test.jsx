import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import EmployeeAvailabilityPage from './EmployeeAvailabilityPage';
import { listMyAvailability, addAvailability, deleteAvailability } from '../lib/api';
import { todayString, formatHebrewDate } from '../lib/dates';

vi.mock('../lib/api', () => ({
  listMyAvailability: vi.fn(),
  addAvailability: vi.fn(),
  deleteAvailability: vi.fn(),
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    session: { user: { id: 'user-1' } },
    profile: { first_name: 'דנה', last_name: 'לוי', role: 'Employee' },
    role: 'Employee',
    loading: false,
    signOut: vi.fn(),
  }),
}));

const existingEntry = {
  id: 'a1',
  user_id: 'user-1',
  available_date: '2099-01-05',
  start_time: '10:00:00',
  end_time: '12:00:00',
};

const submitForm = () => {
  fireEvent.submit(
    screen.getByRole('button', { name: /שמור זמינות/ }).closest('form')
  );
};

describe('EmployeeAvailabilityPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listMyAvailability.mockResolvedValue([existingEntry]);
  });

  it('lists the existing availability for the logged-in user from today onwards', async () => {
    render(<EmployeeAvailabilityPage />);

    await waitFor(() => {
      expect(listMyAvailability).toHaveBeenCalledWith('user-1', todayString());
    });
    expect(
      await screen.findByText(new RegExp(`${formatHebrewDate('2099-01-05')} · 10:00-\\s*12:00`))
    ).toBeInTheDocument();
  });

  it('shows an empty state when no future availability exists', async () => {
    listMyAvailability.mockResolvedValue([]);
    render(<EmployeeAvailabilityPage />);

    expect(
      await screen.findByText('עדיין לא הוזנה זמינות עתידית.')
    ).toBeInTheDocument();
  });

  it('keeps the submit button disabled until a date is chosen', async () => {
    render(<EmployeeAvailabilityPage />);
    await screen.findByText('הזמינות שלי הקרובה');

    expect(screen.getByRole('button', { name: /שמור זמינות/ })).toBeDisabled();
  });

  it('rejects a window whose end is not after its start', async () => {
    render(<EmployeeAvailabilityPage />);
    await screen.findByText('הזמינות שלי הקרובה');

    fireEvent.change(screen.getByLabelText(/תאריך/), { target: { value: '2099-02-01' } });
    fireEvent.change(screen.getByLabelText(/משעה/), { target: { value: '16:00' } });
    fireEvent.change(screen.getByLabelText(/עד שעה/), { target: { value: '16:00' } });
    submitForm();

    expect(
      await screen.findByText('שעת הסיום חייבת להיות אחרי שעת ההתחלה.')
    ).toBeInTheDocument();
    expect(addAvailability).not.toHaveBeenCalled();
  });

  it('rejects a window that overlaps an existing entry on the same date', async () => {
    render(<EmployeeAvailabilityPage />);
    await screen.findByText('הזמינות שלי הקרובה');

    // Existing entry is 2099-01-05 10:00-12:00; 08:00-16:00 overlaps it
    fireEvent.change(screen.getByLabelText(/תאריך/), { target: { value: '2099-01-05' } });
    fireEvent.change(screen.getByLabelText(/משעה/), { target: { value: '08:00' } });
    fireEvent.change(screen.getByLabelText(/עד שעה/), { target: { value: '16:00' } });
    submitForm();

    expect(
      await screen.findByText('כבר קיימת זמינות חופפת בתאריך זה.')
    ).toBeInTheDocument();
    expect(addAvailability).not.toHaveBeenCalled();
  });

  it('allows a non-overlapping window on the same date and saves it via the api', async () => {
    addAvailability.mockResolvedValue({
      id: 'a2',
      user_id: 'user-1',
      available_date: '2099-01-05',
      start_time: '13:00:00',
      end_time: '15:00:00',
    });
    render(<EmployeeAvailabilityPage />);
    await screen.findByText('הזמינות שלי הקרובה');

    fireEvent.change(screen.getByLabelText(/תאריך/), { target: { value: '2099-01-05' } });
    fireEvent.change(screen.getByLabelText(/משעה/), { target: { value: '13:00' } });
    fireEvent.change(screen.getByLabelText(/עד שעה/), { target: { value: '15:00' } });
    submitForm();

    await waitFor(() => {
      expect(addAvailability).toHaveBeenCalledWith({
        userId: 'user-1',
        date: '2099-01-05',
        startTime: '13:00',
        endTime: '15:00',
      });
    });

    expect(await screen.findByText(/זמינות נשמרה/)).toBeInTheDocument();
    // The new entry is rendered in the list
    expect(screen.getByText(/13:00-\s*15:00/)).toBeInTheDocument();
  });

  it('shows a friendly error when saving fails', async () => {
    addAvailability.mockRejectedValue(new Error('db down'));
    render(<EmployeeAvailabilityPage />);
    await screen.findByText('הזמינות שלי הקרובה');

    fireEvent.change(screen.getByLabelText(/תאריך/), { target: { value: '2099-02-01' } });
    submitForm();

    expect(
      await screen.findByText('שגיאה בשמירת הזמינות. יש לנסות שוב.')
    ).toBeInTheDocument();
  });

  it('deletes an entry via the api and removes it from the list', async () => {
    deleteAvailability.mockResolvedValue([existingEntry]);
    render(<EmployeeAvailabilityPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'מחיקת זמינות' }));

    await waitFor(() => {
      expect(deleteAvailability).toHaveBeenCalledWith('a1');
    });
    await waitFor(() => {
      expect(screen.queryByText(/10:00-\s*12:00/)).not.toBeInTheDocument();
    });
  });

  it('keeps the entry and shows an error when deletion fails', async () => {
    deleteAvailability.mockRejectedValue(new Error('FK violation'));
    render(<EmployeeAvailabilityPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'מחיקת זמינות' }));

    expect(
      await screen.findByText('שגיאה במחיקה. ייתכן שכבר שובצו לך טיפולים בחלון זה.')
    ).toBeInTheDocument();
    expect(screen.getByText(/10:00-\s*12:00/)).toBeInTheDocument();
  });
});
