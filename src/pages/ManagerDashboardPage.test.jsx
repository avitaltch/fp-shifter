import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ManagerDashboardPage from './ManagerDashboardPage';
import { getDashboardData, cancelAppointment } from '../lib/api';
import { todayString, addDaysString } from '../lib/dates';

vi.mock('../lib/api', () => ({
  getDashboardData: vi.fn(),
  cancelAppointment: vi.fn(),
}));

const buildAppointments = () => {
  const today = todayString();
  const future = addDaysString(2);
  return [
    {
      id: 'apt-1',
      visit_date: today,
      status: 'Confirmed',
      customers: { first_name: 'רות', last_name: 'מזרחי' },
      appointment_items: [
        {
          id: 'item-1',
          user_id: 'emp-1',
          start_time: '10:00:00',
          end_time: '11:00:00',
          service_types: { name: 'תספורת' },
          users: { first_name: 'דנה', last_name: 'לוי' },
        },
        {
          id: 'item-2',
          user_id: null,
          start_time: '11:00:00',
          end_time: '12:00:00',
          service_types: { name: 'צבע' },
          users: null,
        },
      ],
    },
    {
      id: 'apt-2',
      visit_date: future,
      status: 'Pending',
      customers: { first_name: 'יעל', last_name: 'כהן' },
      appointment_items: [{ id: 'item-3', start_time: '09:00:00' }, { id: 'item-4', start_time: '10:00:00' }],
    },
  ];
};

const statValue = (label) =>
  screen.getByText(label).closest('.stat-content').querySelector('.stat-number')
    .textContent;

describe('ManagerDashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDashboardData.mockResolvedValue({
      appointments: buildAppointments(),
      staffCount: 4,
    });
  });

  it('requests a week of data starting today', async () => {
    render(<ManagerDashboardPage />);

    await waitFor(() => {
      expect(getDashboardData).toHaveBeenCalledWith(todayString(), addDaysString(6));
    });
  });

  it('computes the four stats, including unassigned items waiting for assignment', async () => {
    render(<ManagerDashboardPage />);
    await screen.findByText('ביקורים היום');

    expect(statValue('ביקורים היום')).toBe('1');
    expect(statValue('טיפולים היום')).toBe('2');
    // Only one distinct employee is assigned today
    expect(statValue('עובדים במשמרת')).toBe('1');
    // The 4th stat: today items with no user_id
    expect(statValue('ממתינים לשיבוץ')).toBe('1');
  });

  it("shows today's timeline with Hebrew status labels and assignment info", async () => {
    render(<ManagerDashboardPage />);
    await screen.findByText('ביקורים היום');

    expect(screen.getByText(/לקוח\/ה: רות מזרחי/)).toBeInTheDocument();
    // Hebrew label for the Confirmed status
    expect(screen.getByText('מאושר')).toBeInTheDocument();
    expect(screen.getByText('תספורת')).toBeInTheDocument();
    expect(screen.getByText('ע"י דנה')).toBeInTheDocument();
    // The unassigned item is flagged
    expect(screen.getByText('טרם שובץ')).toBeInTheDocument();
  });

  it('lists future appointments in the upcoming-days section', async () => {
    render(<ManagerDashboardPage />);
    await screen.findByText('ביקורים היום');

    expect(screen.getByText('הימים הקרובים')).toBeInTheDocument();
    expect(screen.getByText(/יעל\s+כהן/)).toBeInTheDocument();
    expect(screen.getByText('2 טיפולים')).toBeInTheDocument();
  });

  it('shows an empty state when nothing is booked for today', async () => {
    getDashboardData.mockResolvedValue({ appointments: [], staffCount: 0 });
    render(<ManagerDashboardPage />);

    expect(await screen.findByText('אין תורים שנקבעו להיום.')).toBeInTheDocument();
    expect(statValue('ביקורים היום')).toBe('0');
    expect(statValue('ממתינים לשיבוץ')).toBe('0');
    expect(screen.queryByText('הימים הקרובים')).not.toBeInTheDocument();
  });

  it('shows an error message when loading fails', async () => {
    getDashboardData.mockRejectedValue(new Error('network'));
    render(<ManagerDashboardPage />);

    expect(
      await screen.findByText('שגיאה בטעינת נתוני הדאשבורד.')
    ).toBeInTheDocument();
  });

  describe('cancelling an appointment', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('cancels after confirmation and removes the appointment from the view', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      cancelAppointment.mockResolvedValue(null);

      render(<ManagerDashboardPage />);
      await screen.findByText(/לקוח\/ה: רות מזרחי/);

      fireEvent.click(screen.getAllByRole('button', { name: /ביטול/ })[0]);

      await waitFor(() => {
        expect(cancelAppointment).toHaveBeenCalledWith('apt-1');
      });
      expect(await screen.findByText('התור בוטל והשעות שוחררו.')).toBeInTheDocument();
      expect(screen.queryByText(/לקוח\/ה: רות מזרחי/)).not.toBeInTheDocument();
    });

    it('does nothing when the confirmation is dismissed', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false);

      render(<ManagerDashboardPage />);
      await screen.findByText(/לקוח\/ה: רות מזרחי/);

      fireEvent.click(screen.getAllByRole('button', { name: /ביטול/ })[0]);

      expect(cancelAppointment).not.toHaveBeenCalled();
      expect(screen.getByText(/לקוח\/ה: רות מזרחי/)).toBeInTheDocument();
    });

    it('surfaces a friendly error and refetches when the cancel fails', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      cancelAppointment.mockRejectedValue(new Error('FORBIDDEN'));

      render(<ManagerDashboardPage />);
      await screen.findByText(/לקוח\/ה: רות מזרחי/);
      getDashboardData.mockClear();

      fireEvent.click(screen.getAllByRole('button', { name: /ביטול/ })[0]);

      expect(
        await screen.findByText('אין לך הרשאה לבצע פעולה זו.')
      ).toBeInTheDocument();
      await waitFor(() => {
        expect(getDashboardData).toHaveBeenCalledTimes(1);
      });
    });

    it('cancels a future appointment from the upcoming-days section', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      cancelAppointment.mockResolvedValue(null);

      render(<ManagerDashboardPage />);
      await screen.findByText(/יעל כהן/);

      fireEvent.click(screen.getByRole('button', { name: 'ביטול התור של יעל' }));

      await waitFor(() => {
        expect(cancelAppointment).toHaveBeenCalledWith('apt-2');
      });
      expect(await screen.findByText('התור בוטל והשעות שוחררו.')).toBeInTheDocument();
      expect(screen.queryByText(/יעל כהן/)).not.toBeInTheDocument();
    });
  });
});
