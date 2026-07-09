import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CustomerBookingPage from './CustomerBookingPage';
import { listServices, getAvailableSlots, bookAppointment } from '../lib/api';
import { addDaysString } from '../lib/dates';

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../lib/api', () => ({
  listServices: vi.fn(),
  getAvailableSlots: vi.fn(),
  bookAppointment: vi.fn(),
}));

const mockServices = [
  { id: 's1', name: 'תספורת', base_price: 150, default_duration: 45 },
  { id: 's2', name: 'צבע', base_price: 200, default_duration: 60 },
];

const mockSlots = [
  { slot_start: '10:00:00', slot_end: '10:45:00' },
  { slot_start: '11:00:00', slot_end: '11:45:00' },
];

const renderPage = () =>
  render(
    <MemoryRouter>
      <CustomerBookingPage />
    </MemoryRouter>
  );

// A valid date for the date input (must sit within its min/max window,
// otherwise jsdom constraint validation blocks the form submission).
const visitDate = addDaysString(7);

// Picks a date + slot and fills personal details (service already selected).
async function completeForm({ phone = '050-1234567' } = {}) {
  fireEvent.change(screen.getByLabelText('תאריך הביקור'), {
    target: { value: visitDate },
  });

  const timeSelect = await screen.findByLabelText('שעות פנויות');
  fireEvent.change(timeSelect, { target: { value: '10:00:00' } });

  fireEvent.change(screen.getByLabelText('שם פרטי'), { target: { value: 'דנה' } });
  fireEvent.change(screen.getByLabelText('שם משפחה'), { target: { value: 'לוי' } });
  fireEvent.change(screen.getByLabelText('טלפון'), { target: { value: phone } });
}

describe('CustomerBookingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listServices.mockResolvedValue(mockServices);
    getAvailableSlots.mockResolvedValue(mockSlots);
  });

  it('fetches services via the api layer and displays them', async () => {
    renderPage();

    expect(await screen.findByText('תספורת')).toBeInTheDocument();
    expect(screen.getByText('₪150')).toBeInTheDocument();
    expect(screen.getByText('צבע')).toBeInTheDocument();
    expect(screen.getByText('₪200')).toBeInTheDocument();
    expect(listServices).toHaveBeenCalledTimes(1);
  });

  it('shows an error state when services fail to load', async () => {
    listServices.mockRejectedValue(new Error('down'));
    renderPage();

    expect(
      await screen.findByText('שגיאה בטעינת השירותים. יש לנסות שוב מאוחר יותר.')
    ).toBeInTheDocument();
  });

  it('sums price and duration for the selected services', async () => {
    renderPage();

    fireEvent.click(await screen.findByText('תספורת'));
    fireEvent.click(screen.getByText('צבע'));

    expect(screen.getByText('₪350')).toBeInTheDocument();
    // 45 + 60 = 105 minutes
    expect(screen.getByText('שעה ו-45 דקות')).toBeInTheDocument();
  });

  it('fetches slots with the chosen date and service ids and lists them as HH:MM', async () => {
    renderPage();

    fireEvent.click(await screen.findByText('תספורת'));
    fireEvent.change(screen.getByLabelText('תאריך הביקור'), {
      target: { value: visitDate },
    });

    await waitFor(() => {
      expect(getAvailableSlots).toHaveBeenCalledWith(visitDate, ['s1']);
    });

    const timeSelect = await screen.findByLabelText('שעות פנויות');
    const options = Array.from(timeSelect.querySelectorAll('option')).map(
      (o) => o.textContent
    );
    expect(options).toContain('10:00');
    expect(options).toContain('11:00');
  });

  it('shows a message when there are no free slots for the date', async () => {
    getAvailableSlots.mockResolvedValue([]);
    renderPage();

    fireEvent.click(await screen.findByText('תספורת'));
    fireEvent.change(screen.getByLabelText('תאריך הביקור'), {
      target: { value: visitDate },
    });

    expect(
      await screen.findByText('אין שעות פנויות בתאריך זה. יש לבחור תאריך אחר.')
    ).toBeInTheDocument();
  });

  it('keeps the submit button disabled until everything is filled', async () => {
    renderPage();

    fireEvent.click(await screen.findByText('תספורת'));
    const submitBtn = screen.getByRole('button', { name: 'אישור הזמנה' });
    expect(submitBtn).toBeDisabled();

    await completeForm();
    expect(submitBtn).not.toBeDisabled();
  });

  it('rejects an invalid phone number with an inline error and does not book', async () => {
    renderPage();
    fireEvent.click(await screen.findByText('תספורת'));
    await completeForm({ phone: 'not-a-phone' });

    fireEvent.click(screen.getByRole('button', { name: 'אישור הזמנה' }));

    expect(await screen.findByText('מספר הטלפון אינו תקין.')).toBeInTheDocument();
    expect(bookAppointment).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('books via the api layer and navigates to /book/success with router state', async () => {
    const booking = {
      id: 'b1',
      visit_date: visitDate,
      start_time: '10:00:00',
      total_duration: 45,
      total_price: 150,
    };
    bookAppointment.mockResolvedValue(booking);

    renderPage();
    fireEvent.click(await screen.findByText('תספורת'));
    await completeForm();

    fireEvent.click(screen.getByRole('button', { name: 'אישור הזמנה' }));

    await waitFor(() => {
      expect(bookAppointment).toHaveBeenCalledWith({
        firstName: 'דנה',
        lastName: 'לוי',
        phone: '050-1234567',
        visitDate,
        startTime: '10:00:00',
        serviceIds: ['s1'],
      });
    });

    expect(mockNavigate).toHaveBeenCalledWith('/book/success', {
      state: { booking, serviceNames: ['תספורת'] },
    });
  });

  it('shows the SLOT_TAKEN message and refreshes the slot list on a lost race', async () => {
    bookAppointment.mockRejectedValue(new Error('SLOT_TAKEN'));

    renderPage();
    fireEvent.click(await screen.findByText('תספורת'));
    await completeForm();
    getAvailableSlots.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'אישור הזמנה' }));

    expect(
      await screen.findByText('השעה שנבחרה נתפסה זה עתה. יש לבחור שעה אחרת.')
    ).toBeInTheDocument();

    // The stale slot list is refetched so the user can pick a new time
    await waitFor(() => {
      expect(getAvailableSlots).toHaveBeenCalledWith(visitDate, ['s1']);
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
