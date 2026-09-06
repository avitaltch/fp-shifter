import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ManagerDashboardPage from './ManagerDashboardPage';
import { listOperatorAppointments, cancelOperatorAppointment } from '../lib/api';
import { todayString, addDaysString } from '../lib/dates';

vi.mock('../lib/api', () => ({
  listOperatorAppointments: vi.fn(),
  cancelOperatorAppointment: vi.fn(),
}));

const buildAppointments = () => {
  const today = todayString();
  const future = addDaysString(2);
  return [
    {
      id: 'apt-1',
      startsAt: `${today}T08:00:00.000Z`,
      timezone: 'UTC',
      status: 'Confirmed',
      customerFirstName: 'רות',
      customerLastName: 'מזרחי',
      customerPhoneE164: '+972501234567',
      steps: [
        {
          id: 'item-1',
          providerUserId: 'emp-1',
          startsAt: `${today}T10:00:00.000Z`,
          endsAt: `${today}T11:00:00.000Z`,
          serviceName: 'תספורת',
          providerFirstName: 'דנה',
          providerLastName: 'לוי',
          sequenceNumber: 1,
        },
        {
          id: 'item-2',
          providerUserId: 'emp-2',
          startsAt: `${today}T11:00:00.000Z`,
          endsAt: `${today}T12:00:00.000Z`,
          serviceName: 'צבע',
          providerFirstName: 'יעל',
          providerLastName: 'כהן',
          sequenceNumber: 2,
        },
      ],
    },
    {
      id: 'apt-2',
      startsAt: `${future}T09:00:00.000Z`,
      timezone: 'UTC',
      status: 'RequiresAttention',
      customerFirstName: 'יעל',
      customerLastName: 'כהן',
      steps: [{ id: 'item-3', sequenceNumber: 1 }, { id: 'item-4', sequenceNumber: 2 }],
    },
  ];
};

const statValue = (label) =>
  screen.getByText(label).closest('.stat-content').querySelector('.stat-number')
    .textContent;

describe('ManagerDashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listOperatorAppointments.mockResolvedValue(buildAppointments());
  });

  it('requests a week of data starting today', async () => {
    render(<ManagerDashboardPage />);

    await waitFor(() => {
      expect(listOperatorAppointments).toHaveBeenCalledWith(todayString(), addDaysString(6));
    });
  });

  it('computes the four operational stats', async () => {
    render(<ManagerDashboardPage />);
    await screen.findByText('ביקורים היום');

    expect(statValue('ביקורים היום')).toBe('1');
    expect(statValue('טיפולים היום')).toBe('2');
    expect(statValue('עובדים במשמרת')).toBe('2');
    expect(statValue('דורשים תשומת לב')).toBe('0');
  });

  it("shows today's timeline with Hebrew status labels and assignment info", async () => {
    render(<ManagerDashboardPage />);
    await screen.findByText('ביקורים היום');

    expect(screen.getByText(/לקוח\/ה: רות מזרחי/)).toBeInTheDocument();
    // Hebrew label for the Confirmed status
    expect(screen.getByText('מאושר')).toBeInTheDocument();
    expect(screen.getByText('תספורת')).toBeInTheDocument();
    expect(screen.getByText((_, element) => element.textContent === 'ע"י דנה לוי', {
      selector: 'span',
    })).toBeInTheDocument();
    expect(screen.getByText((_, element) => element.textContent === 'ע"י יעל כהן', {
      selector: 'span',
    })).toBeInTheDocument();
  });

  it('renders the customer phone as a clickable tel: link', async () => {
    render(<ManagerDashboardPage />);
    await screen.findByText(/לקוח\/ה: רות מזרחי/);

    const phoneLink = screen.getByRole('link', { name: /\+972501234567/ });
    expect(phoneLink).toHaveAttribute('href', 'tel:+972501234567');
  });

  it('lists future appointments in the upcoming-days section', async () => {
    render(<ManagerDashboardPage />);
    await screen.findByText('ביקורים היום');

    expect(screen.getByText('הימים הקרובים')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: /יעל כהן/ })).toBeInTheDocument();
    expect(screen.getByText('2 טיפולים')).toBeInTheDocument();
  });

  it('shows an empty state when nothing is booked for today', async () => {
    listOperatorAppointments.mockResolvedValue([]);
    render(<ManagerDashboardPage />);

    expect(await screen.findByText('אין תורים שנקבעו להיום.')).toBeInTheDocument();
    expect(statValue('ביקורים היום')).toBe('0');
    expect(statValue('דורשים תשומת לב')).toBe('0');
    expect(screen.queryByText('הימים הקרובים')).not.toBeInTheDocument();
  });

  it('shows an error message when loading fails', async () => {
    listOperatorAppointments.mockRejectedValue(new Error('network'));
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
      cancelOperatorAppointment.mockResolvedValue(null);

      render(<ManagerDashboardPage />);
      await screen.findByText(/לקוח\/ה: רות מזרחי/);

      fireEvent.click(screen.getAllByRole('button', { name: /ביטול/ })[0]);

      await waitFor(() => {
        expect(cancelOperatorAppointment).toHaveBeenCalledWith('apt-1');
      });
      expect(await screen.findByText('התור בוטל והשעות שוחררו.')).toBeInTheDocument();
      expect(screen.queryByText(/לקוח\/ה: רות מזרחי/)).not.toBeInTheDocument();
    });

    it('does nothing when the confirmation is dismissed', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false);

      render(<ManagerDashboardPage />);
      await screen.findByText(/לקוח\/ה: רות מזרחי/);

      fireEvent.click(screen.getAllByRole('button', { name: /ביטול/ })[0]);

      expect(cancelOperatorAppointment).not.toHaveBeenCalled();
      expect(screen.getByText(/לקוח\/ה: רות מזרחי/)).toBeInTheDocument();
    });

    it('surfaces a friendly error and refetches when the cancel fails', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      cancelOperatorAppointment.mockRejectedValue(new Error('FORBIDDEN'));

      render(<ManagerDashboardPage />);
      await screen.findByText(/לקוח\/ה: רות מזרחי/);
      listOperatorAppointments.mockClear();

      fireEvent.click(screen.getAllByRole('button', { name: /ביטול/ })[0]);

      expect(
        await screen.findByText('אין לך הרשאה לבצע פעולה זו.')
      ).toBeInTheDocument();
      await waitFor(() => {
        expect(listOperatorAppointments).toHaveBeenCalledTimes(1);
      });
    });

    it('cancels a future appointment from the upcoming-days section', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      cancelOperatorAppointment.mockResolvedValue(null);

      render(<ManagerDashboardPage />);
      await screen.findByRole('button', { name: 'ביטול התור של יעל' });

      fireEvent.click(screen.getByRole('button', { name: 'ביטול התור של יעל' }));

      await waitFor(() => {
        expect(cancelOperatorAppointment).toHaveBeenCalledWith('apt-2');
      });
      expect(await screen.findByText('התור בוטל והשעות שוחררו.')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'ביטול התור של יעל' })).not.toBeInTheDocument();
    });
  });

});
