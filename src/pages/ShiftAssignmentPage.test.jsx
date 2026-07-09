import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ShiftAssignmentPage from './ShiftAssignmentPage';
import { getAssignmentData, assignShift } from '../lib/api';
import { todayString } from '../lib/dates';

// Keep the real (pure) eligibleEmployeesFor so the dropdown filtering is the
// actual production logic; mock only the data-fetching functions.
vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getAssignmentData: vi.fn(),
    assignShift: vi.fn(),
  };
});

vi.mock('../lib/supabase', () => ({ supabase: {} }));

const item = {
  id: 'item-1',
  service_type_id: 'svc-1',
  work_date: '2026-07-20',
  start_time: '10:00:00',
  end_time: '11:00:00',
  service_types: { name: 'תספורת' },
  appointments: { visit_date: '2026-07-20', customers: { first_name: 'רות', last_name: 'מזרחי' } },
};

// דנה is skilled + available; יוסי lacks the skill; רות is skilled but has a
// conflicting assignment in the same window.
const assignmentData = {
  unassigned: [item],
  staff: [
    { id: 'emp-1', first_name: 'דנה', last_name: 'לוי', role: 'Employee' },
    { id: 'emp-2', first_name: 'יוסי', last_name: 'כהן', role: 'Employee' },
    { id: 'emp-3', first_name: 'רות', last_name: 'אדרי', role: 'Employee' },
  ],
  skills: [
    { user_id: 'emp-1', service_type_id: 'svc-1' },
    { user_id: 'emp-3', service_type_id: 'svc-1' },
  ],
  availabilities: [
    { user_id: 'emp-1', available_date: '2026-07-20', start_time: '08:00:00', end_time: '16:00:00' },
    { user_id: 'emp-2', available_date: '2026-07-20', start_time: '08:00:00', end_time: '16:00:00' },
    { user_id: 'emp-3', available_date: '2026-07-20', start_time: '08:00:00', end_time: '16:00:00' },
  ],
  assignments: [
    { id: 'x1', user_id: 'emp-3', work_date: '2026-07-20', start_time: '10:30:00', end_time: '11:30:00' },
  ],
};

describe('ShiftAssignmentPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAssignmentData.mockResolvedValue(assignmentData);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('fetches assignment data from today and renders the unassigned item', async () => {
    render(<ShiftAssignmentPage />);

    expect(await screen.findByText('תספורת')).toBeInTheDocument();
    expect(getAssignmentData).toHaveBeenCalledWith(todayString());
    expect(screen.getByText(/רות\s+מזרחי/)).toBeInTheDocument();
  });

  it('offers only skilled, available and conflict-free employees in the dropdown', async () => {
    render(<ShiftAssignmentPage />);
    const select = await screen.findByRole('combobox');

    const options = within(select).getAllByRole('option');
    const names = options.map((o) => o.textContent);
    expect(names).toContain('דנה לוי');
    // No skill:
    expect(names).not.toContain('יוסי כהן');
    // Overlapping assignment:
    expect(names).not.toContain('רות אדרי');
  });

  it('shows a no-eligible message when nobody fits the window', async () => {
    getAssignmentData.mockResolvedValue({ ...assignmentData, skills: [] });
    render(<ShiftAssignmentPage />);

    expect(
      await screen.findByText('אין עובד מיומן וזמין לחלון זה')
    ).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('asks for confirmation and assigns the shift via the api', async () => {
    assignShift.mockResolvedValue({ id: 'item-1', user_id: 'emp-1' });
    render(<ShiftAssignmentPage />);
    const select = await screen.findByRole('combobox');

    fireEvent.change(select, { target: { value: 'emp-1' } });

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('דנה לוי'));
    await waitFor(() => {
      expect(assignShift).toHaveBeenCalledWith('item-1', 'emp-1');
    });
    expect(await screen.findByText('השיבוץ בוצע בהצלחה.')).toBeInTheDocument();
    // The item leaves the unassigned list -> empty state
    expect(
      await screen.findByText('מעולה! כל הטיפולים שובצו בהצלחה.')
    ).toBeInTheDocument();
  });

  it('does not assign when the confirmation is declined', async () => {
    window.confirm.mockReturnValue(false);
    render(<ShiftAssignmentPage />);
    const select = await screen.findByRole('combobox');

    fireEvent.change(select, { target: { value: 'emp-1' } });

    expect(window.confirm).toHaveBeenCalled();
    expect(assignShift).not.toHaveBeenCalled();
    expect(screen.getByText('תספורת')).toBeInTheDocument();
  });

  it('shows the SHIFT_TAKEN message and refetches when a volunteer won the race', async () => {
    assignShift.mockRejectedValue(new Error('SHIFT_TAKEN'));
    render(<ShiftAssignmentPage />);
    const select = await screen.findByRole('combobox');

    fireEvent.change(select, { target: { value: 'emp-1' } });

    expect(
      await screen.findByText('המשמרת כבר שובצה לעובד אחר.')
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(getAssignmentData).toHaveBeenCalledTimes(2);
    });
  });

  it('shows an empty state when nothing waits for assignment', async () => {
    getAssignmentData.mockResolvedValue({ ...assignmentData, unassigned: [] });
    render(<ShiftAssignmentPage />);

    expect(
      await screen.findByText('מעולה! כל הטיפולים שובצו בהצלחה.')
    ).toBeInTheDocument();
  });

  it('shows an error message when loading fails', async () => {
    getAssignmentData.mockRejectedValue(new Error('network'));
    render(<ShiftAssignmentPage />);

    expect(await screen.findByText('שגיאה בטעינת הנתונים.')).toBeInTheDocument();
  });
});
