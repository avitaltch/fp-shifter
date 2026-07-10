import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CustomerBookingPage from './CustomerBookingPage';
import { BOOKING_CONFIRMATION_KEY } from './BookingSuccessPage';
import { listServices, getAvailableSlots, bookAppointment } from '../lib/api';
import { jerusalemAddDaysString } from '../lib/dates';

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

// A valid date for the date input (must sit within its Jerusalem-based
// min/max window, otherwise jsdom constraint validation blocks the form
// submission).
const visitDate = jerusalemAddDaysString(7);

// Picks a date + slot chip and fills personal details (service already selected).
async function completeForm({ phone = '050-1234567' } = {}) {
  fireEvent.change(screen.getByLabelText('תאריך הביקור'), {
    target: { value: visitDate },
  });

  fireEvent.click(await screen.findByRole('button', { name: '10:00' }));

  fireEvent.change(screen.getByLabelText('שם פרטי'), { target: { value: 'דנה' } });
  fireEvent.change(screen.getByLabelText('שם משפחה'), { target: { value: 'לוי' } });
  fireEvent.change(screen.getByLabelText('טלפון'), { target: { value: phone } });
}

describe('CustomerBookingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
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

  it('fetches slots with the chosen date and service ids and shows them as HH:MM chips', async () => {
    renderPage();

    fireEvent.click(await screen.findByText('תספורת'));
    fireEvent.change(screen.getByLabelText('תאריך הביקור'), {
      target: { value: visitDate },
    });

    await waitFor(() => {
      expect(getAvailableSlots).toHaveBeenCalledWith(visitDate, ['s1']);
    });

    expect(await screen.findByRole('button', { name: '10:00' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '11:00' })).toBeInTheDocument();
  });

  it('marks the chosen slot chip as selected', async () => {
    renderPage();

    fireEvent.click(await screen.findByText('תספורת'));
    fireEvent.change(screen.getByLabelText('תאריך הביקור'), {
      target: { value: visitDate },
    });

    const chip = await screen.findByRole('button', { name: '10:00' });
    fireEvent.click(chip);

    expect(chip).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '11:00' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it("bounds the date picker by the salon's Jerusalem calendar day", async () => {
    renderPage();

    fireEvent.click(await screen.findByText('תספורת'));
    const dateInput = screen.getByLabelText('תאריך הביקור');
    expect(dateInput).toHaveAttribute('min', jerusalemAddDaysString(0));
    expect(dateInput).toHaveAttribute('max', jerusalemAddDaysString(60));
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
      appointment_id: 'b1',
      visit_date: visitDate,
      start_time: '10:00:00',
      end_time: '10:45:00',
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

    const expectedConfirmation = {
      booking,
      serviceNames: ['תספורת'],
      customerName: 'דנה לוי',
    };
    expect(mockNavigate).toHaveBeenCalledWith('/book/success', {
      state: expectedConfirmation,
    });
    // The confirmation also survives a refresh of the success page
    expect(JSON.parse(sessionStorage.getItem(BOOKING_CONFIRMATION_KEY))).toEqual(
      expectedConfirmation
    );
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

  it('shows the SLOT_IN_PAST message, clears the selection and refreshes slots', async () => {
    bookAppointment.mockRejectedValue(new Error('SLOT_IN_PAST'));

    renderPage();
    fireEvent.click(await screen.findByText('תספורת'));
    await completeForm();
    getAvailableSlots.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'אישור הזמנה' }));

    expect(
      await screen.findByText('לא ניתן לקבוע תור בזמן שכבר עבר.')
    ).toBeInTheDocument();

    // The stale slot list is refetched so the user can pick a new time
    await waitFor(() => {
      expect(getAvailableSlots).toHaveBeenCalledWith(visitDate, ['s1']);
    });
    expect(screen.getByRole('button', { name: '10:00' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('shows a fetch error inside the slots area, not the "no free slots" message', async () => {
    getAvailableSlots.mockRejectedValue(new Error('network'));

    renderPage();
    fireEvent.click(await screen.findByText('תספורת'));
    fireEvent.change(screen.getByLabelText('תאריך הביקור'), {
      target: { value: visitDate },
    });

    const slotsArea = await screen.findByRole('group', { name: 'שעות פנויות' });
    const inlineError = await screen.findByText('שגיאה בטעינת השעות הפנויות.');
    expect(slotsArea).toContainElement(inlineError);
    expect(
      screen.queryByText('אין שעות פנויות בתאריך זה. יש לבחור תאריך אחר.')
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '10:00' })).not.toBeInTheDocument();
  });

  it('clears the slot fetch error once a retry succeeds', async () => {
    getAvailableSlots.mockRejectedValueOnce(new Error('network'));

    renderPage();
    fireEvent.click(await screen.findByText('תספורת'));
    fireEvent.change(screen.getByLabelText('תאריך הביקור'), {
      target: { value: visitDate },
    });

    expect(
      await screen.findByText('שגיאה בטעינת השעות הפנויות.')
    ).toBeInTheDocument();

    // Choosing another date triggers a refetch that now succeeds
    fireEvent.change(screen.getByLabelText('תאריך הביקור'), {
      target: { value: jerusalemAddDaysString(8) },
    });

    expect(await screen.findByRole('button', { name: '10:00' })).toBeInTheDocument();
    expect(
      screen.queryByText('שגיאה בטעינת השעות הפנויות.')
    ).not.toBeInTheDocument();
  });

  it('keeps the SLOT_TAKEN message and clears chips when the post-race refetch also fails', async () => {
    bookAppointment.mockRejectedValue(new Error('SLOT_TAKEN'));

    renderPage();
    fireEvent.click(await screen.findByText('תספורת'));
    await completeForm();

    // After the lost race, the refresh of free slots also fails
    getAvailableSlots.mockRejectedValue(new Error('network'));

    fireEvent.click(screen.getByRole('button', { name: 'אישור הזמנה' }));

    expect(
      await screen.findByText('השעה שנבחרה נתפסה זה עתה. יש לבחור שעה אחרת.')
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: '10:00' })).not.toBeInTheDocument();
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
