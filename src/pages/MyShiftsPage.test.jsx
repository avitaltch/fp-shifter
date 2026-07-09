import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import MyShiftsPage from './MyShiftsPage';
import { listMyShifts, updateShiftStatus } from '../lib/api';
import { todayString, formatHebrewDate } from '../lib/dates';

vi.mock('../lib/api', () => ({
  listMyShifts: vi.fn(),
  updateShiftStatus: vi.fn(),
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
    work_date: '2026-07-20',
    start_time: '10:00:00',
    end_time: '11:00:00',
    status: 'Scheduled',
    service_types: { name: 'תספורת' },
    appointments: { visit_date: '2026-07-20', customers: { first_name: 'רות', last_name: 'מזרחי' } },
  },
  {
    id: 't2',
    work_date: '2026-07-20',
    start_time: '12:00:00',
    end_time: '13:00:00',
    status: 'Done',
    service_types: { name: 'צבע' },
    appointments: { visit_date: '2026-07-20', customers: { first_name: 'רות', last_name: 'מזרחי' } },
  },
  {
    id: 't3',
    work_date: '2026-07-21',
    start_time: '09:00:00',
    end_time: '09:30:00',
    status: 'In_Progress',
    service_types: { name: 'פן' },
    appointments: { visit_date: '2026-07-21', customers: { first_name: 'יעל', last_name: 'כהן' } },
  },
];

describe('MyShiftsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listMyShifts.mockResolvedValue(mockShifts);
  });

  it('fetches shifts for the logged-in user from today onwards', async () => {
    render(<MyShiftsPage />);

    await waitFor(() => {
      expect(listMyShifts).toHaveBeenCalledWith('user-1', todayString());
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

  it('advances Scheduled -> In_Progress through the api with the owner id', async () => {
    updateShiftStatus.mockResolvedValue({ id: 't1', status: 'In_Progress' });
    render(<MyShiftsPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'מתוכנן - לחץ להתחלה' }));

    await waitFor(() => {
      expect(updateShiftStatus).toHaveBeenCalledWith('t1', 'user-1', 'In_Progress');
    });
    // t1 and t3 are now both In_Progress
    expect(screen.getAllByRole('button', { name: 'בביצוע - לחץ לסיום' })).toHaveLength(2);
  });

  it('advances In_Progress -> Done', async () => {
    updateShiftStatus.mockResolvedValue({ id: 't3', status: 'Done' });
    render(<MyShiftsPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'בביצוע - לחץ לסיום' }));

    await waitFor(() => {
      expect(updateShiftStatus).toHaveBeenCalledWith('t3', 'user-1', 'Done');
    });
  });

  it('renders Done as terminal: button disabled and clicking never calls the api', async () => {
    render(<MyShiftsPage />);
    const doneBtn = await screen.findByRole('button', { name: /הסתיים/ });

    expect(doneBtn).toBeDisabled();
    fireEvent.click(doneBtn);
    expect(updateShiftStatus).not.toHaveBeenCalled();
  });

  it('shows a friendly error when the status update is rejected (not the owner)', async () => {
    updateShiftStatus.mockRejectedValue(new Error('SHIFT_NOT_YOURS'));
    render(<MyShiftsPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'מתוכנן - לחץ להתחלה' }));

    expect(await screen.findByText('המשמרת אינה משויכת אליך.')).toBeInTheDocument();
    // Status must not advance locally on failure
    expect(screen.getByRole('button', { name: 'מתוכנן - לחץ להתחלה' })).toBeInTheDocument();
  });

  it('shows an empty state when there are no shifts', async () => {
    listMyShifts.mockResolvedValue([]);
    render(<MyShiftsPage />);

    expect(
      await screen.findByText('אין טיפולים מתוכננים. איזה כיף!')
    ).toBeInTheDocument();
  });

  it('shows an error message when fetching fails', async () => {
    listMyShifts.mockRejectedValue(new Error('network'));
    render(<MyShiftsPage />);

    expect(await screen.findByText('שגיאה בטעינת משמרות. יש לרענן.')).toBeInTheDocument();
  });

  it('falls back to "לקוח לא ידוע" when the customer join is missing', async () => {
    listMyShifts.mockResolvedValue([
      {
        ...mockShifts[0],
        appointments: { visit_date: '2026-07-20', customers: null },
      },
    ]);
    render(<MyShiftsPage />);

    expect(await screen.findByText(/לקוח לא ידוע/)).toBeInTheDocument();
  });
});
