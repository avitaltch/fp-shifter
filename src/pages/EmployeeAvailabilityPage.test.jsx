import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EmployeeAvailabilityPage from './EmployeeAvailabilityPage';
import {
  createOperatorAvailability,
  deleteOperatorAvailability,
  listOperatorAvailability,
  listOperatorLocations,
} from '../lib/api';
import { businessLocalDateTimeToInstant, formatHebrewDate } from '../lib/dates';

vi.mock('../lib/api', () => ({
  createOperatorAvailability: vi.fn(),
  deleteOperatorAvailability: vi.fn(),
  listOperatorAvailability: vi.fn(),
  listOperatorLocations: vi.fn(),
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ session: { user: { id: 'user-1' } } }),
}));

const location = {
  id: '00000000-0000-4000-8000-000000000101',
  name: 'תל אביב',
  timezone: 'Asia/Jerusalem',
  isPrimary: true,
};

const interval = (id, date, start, end) => ({
  id,
  locationId: location.id,
  providerUserId: 'user-1',
  kind: 'Available',
  startsAt: businessLocalDateTimeToInstant(date, start, location.timezone),
  endsAt: businessLocalDateTimeToInstant(date, end, location.timezone),
  notes: null,
});

const existingEntry = interval('a1', '2099-01-05', '10:00', '12:00');

function chooseDate(date, start = '08:00', end = '16:00') {
  fireEvent.change(screen.getByLabelText(/תאריך/), { target: { value: date } });
  fireEvent.change(screen.getByLabelText(/משעה/), { target: { value: start } });
  fireEvent.change(screen.getByLabelText(/עד שעה/), { target: { value: end } });
}

function submitForm() {
  fireEvent.submit(screen.getByRole('button', { name: /שמור זמינות/ }).closest('form'));
}

describe('EmployeeAvailabilityPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listOperatorLocations.mockResolvedValue([location]);
    listOperatorAvailability.mockResolvedValue([existingEntry]);
  });

  it('loads locations and the authenticated provider availability', async () => {
    render(<EmployeeAvailabilityPage />);

    expect(await screen.findByText(/תל אביב/)).toBeInTheDocument();
    expect(listOperatorLocations).toHaveBeenCalled();
    expect(listOperatorAvailability).toHaveBeenCalledWith({
      from: expect.any(String),
      to: expect.any(String),
    });
    expect(
      screen.getByText(new RegExp(`${formatHebrewDate('2099-01-05')} · 10:00-\\s*12:00`))
    ).toBeInTheDocument();
  });

  it('rejects overlapping local windows before sending them', async () => {
    render(<EmployeeAvailabilityPage />);
    await screen.findByText('הזמינות שלי הקרובה');
    chooseDate('2099-01-05');
    submitForm();

    expect(await screen.findByText('כבר קיימת זמינות חופפת בתאריך זה.')).toBeInTheDocument();
    expect(createOperatorAvailability).not.toHaveBeenCalled();
  });

  it('creates an interval using the location timezone', async () => {
    const created = interval('a2', '2099-01-05', '13:00', '15:00');
    createOperatorAvailability.mockResolvedValue([created]);
    render(<EmployeeAvailabilityPage />);
    await screen.findByText('הזמינות שלי הקרובה');
    chooseDate('2099-01-05', '13:00', '15:00');
    submitForm();

    await waitFor(() => {
      expect(createOperatorAvailability).toHaveBeenCalledWith([
        {
          locationId: location.id,
          kind: 'Available',
          startsAt: created.startsAt,
          endsAt: created.endsAt,
        },
      ]);
    });
    expect(await screen.findByText(/זמינות נשמרה/)).toBeInTheDocument();
  });

  it('bulk-creates selected weekdays in one API request', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 6, 8, 12));
    listOperatorAvailability.mockResolvedValue([]);
    createOperatorAvailability.mockImplementation(async (entries) =>
      entries.map((entry, index) => ({ id: `bulk-${index}`, providerUserId: 'user-1', ...entry }))
    );
    render(<EmployeeAvailabilityPage />);
    await screen.findByText('פתיחה מרוכזת');
    fireEvent.click(screen.getByRole('button', { name: 'פתח את השבוע' }));

    await waitFor(() => expect(createOperatorAvailability).toHaveBeenCalledTimes(1));
    const entries = createOperatorAvailability.mock.calls[0][0];
    expect(entries).toHaveLength(2);
    expect(entries.every((entry) => entry.locationId === location.id)).toBe(true);
    vi.useRealTimers();
  });

  it('deletes an interval and preserves an empty state', async () => {
    deleteOperatorAvailability.mockResolvedValue(null);
    render(<EmployeeAvailabilityPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'מחיקת זמינות' }));

    await waitFor(() => expect(deleteOperatorAvailability).toHaveBeenCalledWith('a1'));
    expect(await screen.findByText('עדיין לא הוזנה זמינות עתידית.')).toBeInTheDocument();
  });
});
