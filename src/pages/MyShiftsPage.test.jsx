import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import MyShiftsPage from './MyShiftsPage';
import { listMyOperatorSteps, updateOperatorStepStatus } from '../lib/api';
import { addDaysString, todayString, formatHebrewDate } from '../lib/dates';

vi.mock('../lib/api', () => ({
  listMyOperatorSteps: vi.fn(),
  updateOperatorStepStatus: vi.fn(),
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

const mockShifts = [
  {
    id: 't1',
    startsAt: '2026-07-20T10:00:00.000Z',
    endsAt: '2026-07-20T11:00:00.000Z',
    timezone: 'UTC',
    status: 'Scheduled',
    serviceName: 'תספורת',
    customerFirstName: 'רות',
    customerLastName: 'מזרחי',
  },
  {
    id: 't2',
    startsAt: '2026-07-20T12:00:00.000Z',
    endsAt: '2026-07-20T13:00:00.000Z',
    timezone: 'UTC',
    status: 'Completed',
    serviceName: 'צבע',
    customerFirstName: 'רות',
    customerLastName: 'מזרחי',
  },
  {
    id: 't3',
    startsAt: '2026-07-21T09:00:00.000Z',
    endsAt: '2026-07-21T09:30:00.000Z',
    timezone: 'UTC',
    status: 'InProgress',
    serviceName: 'פן',
    customerFirstName: 'יעל',
    customerLastName: 'כהן',
  },
];

describe('MyShiftsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listMyOperatorSteps.mockResolvedValue(mockShifts);
  });

  it('fetches shifts for the logged-in user from today onwards', async () => {
    render(<MyShiftsPage />);

    await waitFor(() => {
      expect(listMyOperatorSteps).toHaveBeenCalledWith(todayString(), addDaysString(30));
    });
    expect(await screen.findByText('תספורת')).toBeInTheDocument();
  });

  it('shows the profile name from AuthContext in the header', async () => {
    render(<MyShiftsPage />);
    expect(await screen.findByText('המשמרות שלי - דנה לוי')).toBeInTheDocument();
  });

  it('groups shifts by work date with a Hebrew date heading per group', async () => {
    render(<MyShiftsPage />);
    await screen.findByText('תספורת');

    const headings = screen.getAllByRole('heading', { level: 2 });
    const texts = headings.map((h) => h.textContent);
    expect(texts).toHaveLength(2);
    expect(texts[0]).toContain(formatHebrewDate('2026-07-20'));
    expect(texts[1]).toContain(formatHebrewDate('2026-07-21'));

    // Two tasks under the first date, one under the second
    expect(screen.getByText('תספורת')).toBeInTheDocument();
    expect(screen.getByText('צבע')).toBeInTheDocument();
    expect(screen.getByText('פן')).toBeInTheDocument();
  });

  it('advances Scheduled -> InProgress through the authenticated api', async () => {
    updateOperatorStepStatus.mockResolvedValue({ id: 't1', status: 'InProgress' });
    render(<MyShiftsPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'מתוכנן - לחץ להתחלה' }));

    await waitFor(() => {
      expect(updateOperatorStepStatus).toHaveBeenCalledWith('t1', 'InProgress');
    });
    // t1 and t3 are now both In_Progress
    expect(screen.getAllByRole('button', { name: 'בביצוע - לחץ לסיום' })).toHaveLength(2);
  });

  it('advances InProgress -> Completed', async () => {
    updateOperatorStepStatus.mockResolvedValue({ id: 't3', status: 'Completed' });
    render(<MyShiftsPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'בביצוע - לחץ לסיום' }));

    await waitFor(() => {
      expect(updateOperatorStepStatus).toHaveBeenCalledWith('t3', 'Completed');
    });
  });

  it('renders Completed as terminal: button disabled and clicking never calls the api', async () => {
    render(<MyShiftsPage />);
    const doneBtn = await screen.findByRole('button', { name: /הסתיים/ });

    expect(doneBtn).toBeDisabled();
    fireEvent.click(doneBtn);
    expect(updateOperatorStepStatus).not.toHaveBeenCalled();
  });

  it('shows a friendly error when the status update is rejected (not the owner)', async () => {
    updateOperatorStepStatus.mockRejectedValue(new Error('SHIFT_NOT_YOURS'));
    render(<MyShiftsPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'מתוכנן - לחץ להתחלה' }));

    expect(await screen.findByText('המשמרת אינה משויכת אליך.')).toBeInTheDocument();
    // Status must not advance locally on failure
    expect(screen.getByRole('button', { name: 'מתוכנן - לחץ להתחלה' })).toBeInTheDocument();
  });

  it('shows an empty state when there are no shifts', async () => {
    listMyOperatorSteps.mockResolvedValue([]);
    render(<MyShiftsPage />);

    expect(
      await screen.findByText('אין טיפולים מתוכננים. איזה כיף!')
    ).toBeInTheDocument();
  });

  it('shows an error message when fetching fails', async () => {
    listMyOperatorSteps.mockRejectedValue(new Error('network'));
    render(<MyShiftsPage />);

    expect(await screen.findByText('שגיאה בטעינת משמרות. יש לרענן.')).toBeInTheDocument();
  });

  it('falls back to "לקוח לא ידוע" when the customer join is missing', async () => {
    listMyOperatorSteps.mockResolvedValue([
      {
        ...mockShifts[0],
        customerFirstName: null,
        customerLastName: null,
      },
    ]);
    render(<MyShiftsPage />);

    expect(await screen.findByText(/לקוח לא ידוע/)).toBeInTheDocument();
  });
});
