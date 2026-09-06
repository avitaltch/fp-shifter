import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ShiftAssignmentPage from './ShiftAssignmentPage';
import {
  listOperatorAppointments,
  listOperatorReassignmentOptions,
  reassignOperatorStep,
} from '../lib/api';
import { addDaysString, todayString } from '../lib/dates';

vi.mock('../lib/api', () => ({
  listOperatorAppointments: vi.fn(),
  listOperatorReassignmentOptions: vi.fn(),
  reassignOperatorStep: vi.fn(),
}));

const today = todayString();
const step = {
  id: 'item-1',
  status: 'Scheduled',
  serviceName: 'תספורת',
  providerUserId: 'provider-current',
  providerFirstName: 'דנה',
  providerLastName: 'לוי',
  startsAt: `${today}T10:00:00.000Z`,
  endsAt: `${today}T11:00:00.000Z`,
  timezone: 'UTC',
};

const appointments = [
  {
    id: 'appointment-1',
    customerFirstName: 'רות',
    customerLastName: 'מזרחי',
    timezone: 'UTC',
    steps: [step],
  },
];

const options = [
  {
    providerUserId: 'provider-current',
    firstName: 'דנה',
    lastName: 'לוי',
    eligible: true,
    reasons: [],
  },
  {
    providerUserId: 'provider-next',
    firstName: 'נועה',
    lastName: 'כהן',
    eligible: true,
    reasons: [],
  },
  {
    providerUserId: 'provider-busy',
    firstName: 'יוסי',
    lastName: 'אדרי',
    eligible: false,
    reasons: ['NOT_QUALIFIED', 'SCHEDULE_CONFLICT'],
  },
];

describe('ShiftAssignmentPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listOperatorAppointments.mockResolvedValue(appointments);
    listOperatorReassignmentOptions.mockResolvedValue(options);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('loads the bounded operator schedule and current assignment', async () => {
    render(<ShiftAssignmentPage />);

    expect(await screen.findByText('תספורת')).toBeInTheDocument();
    expect(listOperatorAppointments).toHaveBeenCalledWith(todayString(), addDaysString(13));
    expect(screen.getByText(/רות\s+מזרחי/)).toBeInTheDocument();
    expect(screen.getByText(/דנה\s+לוי/)).toBeInTheDocument();
  });

  it('loads server-authoritative alternatives and explains ineligible providers', async () => {
    render(<ShiftAssignmentPage />);
    fireEvent.click(await screen.findByRole('button', { name: /בדיקת חלופות/ }));

    const select = await screen.findByRole('combobox', { name: /שינוי שיבוץ/ });
    expect(listOperatorReassignmentOptions).toHaveBeenCalledWith('item-1');
    expect(within(select).getByRole('option', { name: 'נועה כהן' })).toBeInTheDocument();
    expect(within(select).queryByRole('option', { name: 'דנה לוי' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('למה אחרים לא זמינים?'));
    expect(screen.getByText(/יוסי אדרי.*ללא מיומנות מתאימה.*קיים שיבוץ חופף/)).toBeInTheDocument();
  });

  it('confirms and atomically reassigns through the NestJS API', async () => {
    reassignOperatorStep.mockResolvedValue({
      ...step,
      providerUserId: 'provider-next',
      providerFirstName: 'נועה',
      providerLastName: 'כהן',
    });
    render(<ShiftAssignmentPage />);
    fireEvent.click(await screen.findByRole('button', { name: /בדיקת חלופות/ }));
    const select = await screen.findByRole('combobox', { name: /שינוי שיבוץ/ });
    fireEvent.change(select, { target: { value: 'provider-next' } });

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('נועה כהן'));
    await waitFor(() => {
      expect(reassignOperatorStep).toHaveBeenCalledWith('item-1', 'provider-next');
    });
    expect(await screen.findByText('השיבוץ עודכן בהצלחה.')).toBeInTheDocument();
    expect(screen.getByText(/נועה\s+כהן/)).toBeInTheDocument();
  });

  it('does not mutate when reassignment confirmation is dismissed', async () => {
    window.confirm.mockReturnValue(false);
    render(<ShiftAssignmentPage />);
    fireEvent.click(await screen.findByRole('button', { name: /בדיקת חלופות/ }));
    fireEvent.change(await screen.findByRole('combobox'), {
      target: { value: 'provider-next' },
    });
    expect(reassignOperatorStep).not.toHaveBeenCalled();
  });

  it('shows the no-alternative state and fetch errors', async () => {
    listOperatorReassignmentOptions.mockResolvedValue([options[0], options[2]]);
    const { unmount } = render(<ShiftAssignmentPage />);
    fireEvent.click(await screen.findByRole('button', { name: /בדיקת חלופות/ }));
    expect(
      await screen.findByText('אין ספק/ית חלופי/ת פנוי/ה לחלון זה')
    ).toBeInTheDocument();
    unmount();

    listOperatorAppointments.mockRejectedValue(new Error('network'));
    render(<ShiftAssignmentPage />);
    expect(await screen.findByText('שגיאה בטעינת הנתונים.')).toBeInTheDocument();
  });
});
