import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import RecommendationsPage from './RecommendationsPage';
import { getClaimableShifts, claimShift } from '../lib/api';
import { todayString } from '../lib/dates';

vi.mock('../lib/api', () => ({
  getClaimableShifts: vi.fn(),
  claimShift: vi.fn(),
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

const mockOpenShifts = [
  {
    id: 'r1',
    work_date: '2026-07-20',
    start_time: '10:00:00',
    end_time: '11:00:00',
    service_types: { name: 'צבע' },
    appointments: { visit_date: '2026-07-20', customers: { first_name: 'ישראל', last_name: 'ישראלי' } },
    eligible: true,
    reason: null,
  },
  {
    id: 'r2',
    work_date: '2026-07-21',
    start_time: '12:00:00',
    end_time: '12:30:00',
    service_types: { name: 'תספורת' },
    appointments: { visit_date: '2026-07-21', customers: { first_name: 'יעל', last_name: 'כהן' } },
    eligible: true,
    reason: null,
  },
];

describe('RecommendationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getClaimableShifts.mockResolvedValue(mockOpenShifts);
  });

  it('fetches claimable shifts for the user from today onwards and displays them', async () => {
    render(<RecommendationsPage />);

    expect(await screen.findByText('צבע')).toBeInTheDocument();
    expect(getClaimableShifts).toHaveBeenCalledWith('user-1', todayString());
    expect(screen.getByText(/ישראל\s+ישראלי/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /אני פנוי\/ה/ })).toHaveLength(2);
  });

  it('shows an empty state when there are no open shifts', async () => {
    getClaimableShifts.mockResolvedValue([]);
    render(<RecommendationsPage />);

    expect(
      await screen.findByText('אין משמרות פתוחות כרגע. הכל מתוקתק!')
    ).toBeInTheDocument();
  });

  it('shows ineligible shifts without a claim button and explains why', async () => {
    getClaimableShifts.mockResolvedValue([
      mockOpenShifts[0],
      { ...mockOpenShifts[1], eligible: false, reason: 'NOT_QUALIFIED' },
    ]);
    render(<RecommendationsPage />);
    await screen.findByText('צבע');

    // Only the eligible shift gets a claim button
    expect(screen.getAllByRole('button', { name: /אני פנוי\/ה/ })).toHaveLength(1);
    expect(screen.getByText('דורש מיומנות שאינה משויכת אליך')).toBeInTheDocument();
    expect(
      screen.getByText('משמרות פתוחות נוספות (לא זמינות לך)')
    ).toBeInTheDocument();
  });

  it('claims a shift via the RPC and removes it from the list', async () => {
    claimShift.mockResolvedValue({ item_id: 'r1', user_id: 'user-1' });
    render(<RecommendationsPage />);
    await screen.findByText('צבע');

    fireEvent.click(screen.getAllByRole('button', { name: /אני פנוי\/ה/ })[0]);

    await waitFor(() => {
      expect(claimShift).toHaveBeenCalledWith('r1');
    });
    expect(
      await screen.findByText('מעולה! המשמרת שובצה אליך בהצלחה.')
    ).toBeInTheDocument();
    expect(screen.queryByText('צבע')).not.toBeInTheDocument();
    expect(screen.getByText('תספורת')).toBeInTheDocument();
  });

  it('disables all claim buttons and marks the clicked one while a claim is in flight', async () => {
    let resolveClaim;
    claimShift.mockReturnValue(new Promise((resolve) => { resolveClaim = resolve; }));
    render(<RecommendationsPage />);
    await screen.findByText('צבע');

    fireEvent.click(screen.getAllByRole('button', { name: /אני פנוי\/ה/ })[0]);

    // The clicked item shows the per-item claiming state
    expect(await screen.findByRole('button', { name: /משבץ.../ })).toBeDisabled();
    // The other item is also blocked during the claim
    expect(screen.getByRole('button', { name: /אני פנוי\/ה/ })).toBeDisabled();

    resolveClaim({ item_id: 'r1', user_id: 'user-1' });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /אני פנוי\/ה/ })).not.toBeDisabled();
    });
  });

  it('shows the SHIFT_TAKEN message and refetches when the claim race is lost', async () => {
    claimShift.mockRejectedValue(new Error('SHIFT_TAKEN'));
    // After the lost race the refetch shows the list without the taken shift
    getClaimableShifts
      .mockResolvedValueOnce(mockOpenShifts)
      .mockResolvedValueOnce([mockOpenShifts[1]]);

    render(<RecommendationsPage />);
    await screen.findByText('צבע');

    fireEvent.click(screen.getAllByRole('button', { name: /אני פנוי\/ה/ })[0]);

    expect(
      await screen.findByText('המשמרת כבר שובצה לעובד אחר.')
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(getClaimableShifts).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(screen.queryByText('צבע')).not.toBeInTheDocument();
    });
    expect(screen.getByText('תספורת')).toBeInTheDocument();
  });

  it('shows an error message when loading fails', async () => {
    getClaimableShifts.mockRejectedValue(new Error('network'));
    render(<RecommendationsPage />);

    expect(
      await screen.findByText('שגיאה בטעינת המשמרות הפתוחות.')
    ).toBeInTheDocument();
  });
});
