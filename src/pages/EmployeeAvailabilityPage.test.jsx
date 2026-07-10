import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import EmployeeAvailabilityPage from './EmployeeAvailabilityPage';
import { listMyAvailability, addAvailability, addAvailabilityBulk, deleteAvailability } from '../lib/api';
import { todayString, formatHebrewDate } from '../lib/dates';

vi.mock('../lib/api', () => ({
  listMyAvailability: vi.fn(),
  addAvailability: vi.fn(),
  addAvailabilityBulk: vi.fn(),
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

  afterEach(() => {
    vi.useRealTimers();
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
    // The new entry is rendered in the list (scoped — the success message
    // repeats the same times)
    const entries = document.querySelectorAll('.availability-entry');
    const texts = [...entries].map((e) => e.textContent);
    expect(texts.some((t) => /13:00-\s*15:00/.test(t))).toBe(true);
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

  describe('bulk open', () => {
    // Wednesday 2026-07-08 — this week remaining workdays (Sun–Thu default): Wed+Thu
    const WEDNESDAY = new Date(2026, 6, 8, 12, 0, 0);

    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.setSystemTime(WEDNESDAY);
      listMyAvailability.mockResolvedValue([]);
    });

    it('opens this week from today through Saturday, only toggled workdays', async () => {
      addAvailabilityBulk.mockResolvedValue([
        {
          id: 'b1',
          user_id: 'user-1',
          available_date: '2026-07-08',
          start_time: '08:00',
          end_time: '16:00',
        },
        {
          id: 'b2',
          user_id: 'user-1',
          available_date: '2026-07-09',
          start_time: '08:00',
          end_time: '16:00',
        },
      ]);

      render(<EmployeeAvailabilityPage />);
      await screen.findByText('פתיחה מרוכזת');

      fireEvent.click(screen.getByRole('button', { name: 'פתח את השבוע' }));

      await waitFor(() => {
        expect(addAvailabilityBulk).toHaveBeenCalledTimes(1);
      });
      expect(addAvailabilityBulk).toHaveBeenCalledWith([
        {
          user_id: 'user-1',
          available_date: '2026-07-08',
          start_time: '08:00',
          end_time: '16:00',
        },
        {
          user_id: 'user-1',
          available_date: '2026-07-09',
          start_time: '08:00',
          end_time: '16:00',
        },
      ]);
      expect(await screen.findByText('נפתחו 2 ימים')).toBeInTheDocument();
    });

    it('excludes past days when opening this week', async () => {
      // Sunday–Tuesday are before "today" (Wed) and must not be included
      addAvailabilityBulk.mockResolvedValue([]);
      render(<EmployeeAvailabilityPage />);
      await screen.findByText('פתיחה מרוכזת');

      fireEvent.click(screen.getByRole('button', { name: 'פתח את השבוע' }));

      await waitFor(() => {
        expect(addAvailabilityBulk).toHaveBeenCalled();
      });
      const rows = addAvailabilityBulk.mock.calls[0][0];
      expect(rows.every((r) => r.available_date >= '2026-07-08')).toBe(true);
      expect(rows.some((r) => r.available_date < '2026-07-08')).toBe(false);
    });

    it('opens next week Sunday through Saturday for selected workdays', async () => {
      addAvailabilityBulk.mockImplementation(async (rows) =>
        rows.map((r, i) => ({ id: `n${i}`, ...r }))
      );
      render(<EmployeeAvailabilityPage />);
      await screen.findByText('פתיחה מרוכזת');

      fireEvent.click(screen.getByRole('button', { name: 'פתח את השבוע הבא' }));

      await waitFor(() => {
        expect(addAvailabilityBulk).toHaveBeenCalledTimes(1);
      });
      const rows = addAvailabilityBulk.mock.calls[0][0];
      expect(rows.map((r) => r.available_date)).toEqual([
        '2026-07-12', // Sun
        '2026-07-13', // Mon
        '2026-07-14', // Tue
        '2026-07-15', // Wed
        '2026-07-16', // Thu
      ]);
    });

    it('filters by weekday toggles (skips Friday/Saturday by default)', async () => {
      addAvailabilityBulk.mockImplementation(async (rows) =>
        rows.map((r, i) => ({ id: `m${i}`, ...r }))
      );
      render(<EmployeeAvailabilityPage />);
      await screen.findByText('פתיחה מרוכזת');

      fireEvent.click(screen.getByRole('button', { name: 'פתח את החודש' }));

      await waitFor(() => {
        expect(addAvailabilityBulk).toHaveBeenCalled();
      });
      const rows = addAvailabilityBulk.mock.calls[0][0];
      // No Friday (5) or Saturday (6)
      const hasWeekend = rows.some((r) => {
        const day = new Date(r.available_date + 'T12:00:00').getDay();
        return day === 5 || day === 6;
      });
      expect(hasWeekend).toBe(false);
      expect(rows[0].available_date).toBe('2026-07-08');
      expect(rows.every((r) => r.available_date <= '2026-07-31')).toBe(true);
    });

    it('skips overlapping existing entries and reports them in the success message', async () => {
      listMyAvailability.mockResolvedValue([
        {
          id: 'overlap',
          user_id: 'user-1',
          available_date: '2026-07-08',
          start_time: '08:00:00',
          end_time: '16:00:00',
        },
      ]);
      addAvailabilityBulk.mockResolvedValue([
        {
          id: 'b2',
          user_id: 'user-1',
          available_date: '2026-07-09',
          start_time: '08:00',
          end_time: '16:00',
        },
      ]);

      render(<EmployeeAvailabilityPage />);
      await screen.findByText('פתיחה מרוכזת');

      fireEvent.click(screen.getByRole('button', { name: 'פתח את השבוע' }));

      await waitFor(() => {
        expect(addAvailabilityBulk).toHaveBeenCalledWith([
          {
            user_id: 'user-1',
            available_date: '2026-07-09',
            start_time: '08:00',
            end_time: '16:00',
          },
        ]);
      });
      expect(
        await screen.findByText('נפתחו 1 ימים (1 דולגו — קיימת זמינות חופפת)')
      ).toBeInTheDocument();
    });

    it('shows an informative message when nothing qualifies', async () => {
      // Turn off all workdays
      render(<EmployeeAvailabilityPage />);
      await screen.findByText('פתיחה מרוכזת');

      for (const label of ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳']) {
        const chip = screen.getByRole('button', { name: label });
        if (chip.getAttribute('aria-pressed') === 'true') {
          fireEvent.click(chip);
        }
      }

      fireEvent.click(screen.getByRole('button', { name: 'פתח את השבוע' }));

      expect(
        await screen.findByText(
          'כל הימים בטווח כבר פתוחים או שאינם בימי העבודה שנבחרו.'
        )
      ).toBeInTheDocument();
      expect(addAvailabilityBulk).not.toHaveBeenCalled();
    });

    it('validates start < end before bulk insert', async () => {
      render(<EmployeeAvailabilityPage />);
      await screen.findByText('פתיחה מרוכזת');

      fireEvent.change(screen.getByLabelText(/משעה/), { target: { value: '16:00' } });
      fireEvent.change(screen.getByLabelText(/עד שעה/), { target: { value: '08:00' } });
      fireEvent.click(screen.getByRole('button', { name: 'פתח את השבוע הבא' }));

      expect(
        await screen.findByText('שעת הסיום חייבת להיות אחרי שעת ההתחלה.')
      ).toBeInTheDocument();
      expect(addAvailabilityBulk).not.toHaveBeenCalled();
    });

    it('opens next month from the 1st through the last day', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      addAvailabilityBulk.mockImplementation(async (rows) =>
        rows.map((r, i) => ({ id: `nm${i}`, ...r }))
      );
      render(<EmployeeAvailabilityPage />);
      await screen.findByText('פתיחה מרוכזת');

      fireEvent.click(screen.getByRole('button', { name: 'פתח את החודש הבא' }));

      await waitFor(() => {
        expect(addAvailabilityBulk).toHaveBeenCalled();
      });
      const rows = addAvailabilityBulk.mock.calls[0][0];
      expect(rows[0].available_date).toBe('2026-08-02'); // Aug 1 2026 is Saturday (off)
      expect(rows.every((r) => r.available_date.startsWith('2026-08-'))).toBe(true);
      expect(rows.at(-1).available_date).toBe('2026-08-31'); // Monday
      expect(confirmSpy).toHaveBeenCalled(); // >20 Sun–Thu days in August
      confirmSpy.mockRestore();
    });

    it('asks for confirmation when more than 20 rows would be inserted', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
      addAvailabilityBulk.mockResolvedValue([]);

      render(<EmployeeAvailabilityPage />);
      await screen.findByText('פתיחה מרוכזת');

      // Enable Friday+Saturday so next month has many days
      fireEvent.click(screen.getByRole('button', { name: 'ו׳' }));
      fireEvent.click(screen.getByRole('button', { name: 'ש׳' }));
      fireEvent.click(screen.getByRole('button', { name: 'פתח את החודש הבא' }));

      await waitFor(() => {
        expect(confirmSpy).toHaveBeenCalled();
      });
      expect(addAvailabilityBulk).not.toHaveBeenCalled();
      confirmSpy.mockRestore();
    });
  });
});
