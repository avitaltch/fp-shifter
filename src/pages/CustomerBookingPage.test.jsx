import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loadPublicBookingCatalog,
  loadPublicBookingSlots,
  submitPublicBooking,
  submitPublicWaitlist,
} from '../lib/api';
import { businessDateRangeToInstants, jerusalemAddDaysString } from '../lib/dates';
import { BOOKING_CONFIRMATION_KEY } from './BookingSuccessPage';
import CustomerBookingPage from './CustomerBookingPage';

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => mockNavigate,
}));
vi.mock('../lib/api', () => ({
  loadPublicBookingCatalog: vi.fn(),
  loadPublicBookingSlots: vi.fn(),
  submitPublicBooking: vi.fn(),
  submitPublicWaitlist: vi.fn(),
}));

const visitDate = jerusalemAddDaysString(7);
const startsAt = `${visitDate}T07:00:00.000Z`;
const endsAt = `${visitDate}T08:00:00.000Z`;
const service = {
  id: 'service-1',
  name: 'טיפוח מלא',
  base_price: 125,
  default_duration: 60,
  currency: 'ILS',
};
const catalog = {
  business: { slug: 'happy-pets-demo', name: 'Happy Pets' },
  location: { name: 'תל אביב', timezone: 'Asia/Jerusalem' },
  services: [service],
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/book/happy-pets-demo']}>
      <Routes>
        <Route path="/book/:businessSlug" element={<CustomerBookingPage />} />
      </Routes>
    </MemoryRouter>
  );
}

async function selectServiceAndDate() {
  fireEvent.click(await screen.findByText(service.name));
  fireEvent.change(screen.getByLabelText('תאריך הביקור'), {
    target: { value: visitDate },
  });
}

async function completeForm() {
  await selectServiceAndDate();
  fireEvent.click(await screen.findByRole('button', { name: '10:00' }));
  fireEvent.change(screen.getByLabelText('שם פרטי'), { target: { value: 'דנה' } });
  fireEvent.change(screen.getByLabelText('שם משפחה'), { target: { value: 'לוי' } });
  fireEvent.change(screen.getByLabelText('טלפון'), { target: { value: '050-1234567' } });
}

describe('CustomerBookingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    loadPublicBookingCatalog.mockResolvedValue(catalog);
    loadPublicBookingSlots.mockResolvedValue([
      { slot_start: startsAt, slot_end: endsAt },
    ]);
    submitPublicWaitlist.mockResolvedValue({ waitlistEntryId: 'waitlist-1' });
  });

  it('loads the tenant catalog and compound availability', async () => {
    renderPage();
    expect(
      await screen.findByRole('heading', { name: 'הזמנת תור אצל Happy Pets' })
    ).toBeInTheDocument();
    await selectServiceAndDate();
    await waitFor(() =>
      expect(loadPublicBookingSlots).toHaveBeenCalledWith(
        'happy-pets-demo',
        visitDate,
        ['service-1'],
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      )
    );
    expect(await screen.findByRole('button', { name: '10:00' })).toBeInTheDocument();
  });

  it('submits an idempotent booking and keeps bearer capability out of storage', async () => {
    const booking = {
      appointment_id: 'appointment-1',
      visit_date: visitDate,
      start_time: startsAt,
      end_time: endsAt,
      total_duration: 60,
      total_price: 125,
      managementToken: `sm_${'m'.repeat(43)}`,
    };
    submitPublicBooking.mockResolvedValue(booking);
    renderPage();
    await completeForm();
    fireEvent.click(screen.getByRole('button', { name: 'אישור הזמנה' }));

    await waitFor(() =>
      expect(submitPublicBooking).toHaveBeenCalledWith(
        'happy-pets-demo',
        {
          firstName: 'דנה',
          lastName: 'לוי',
          phoneE164: '+972501234567',
          visitDate,
          startsAt,
          serviceIds: ['service-1'],
        },
        { idempotencyKey: expect.any(String) }
      )
    );
    expect(mockNavigate).toHaveBeenCalledWith('/book/happy-pets-demo/success', {
      state: expect.objectContaining({ booking, bookingPath: '/book/happy-pets-demo' }),
    });
    const stored = JSON.parse(sessionStorage.getItem(BOOKING_CONFIRMATION_KEY));
    expect(stored.booking.managementToken).toBeUndefined();
  });

  it('refreshes server-authoritative slots after a lost booking race', async () => {
    submitPublicBooking.mockRejectedValue({ code: 'SLOT_TAKEN' });
    renderPage();
    await completeForm();
    loadPublicBookingSlots.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'אישור הזמנה' }));
    expect(
      await screen.findByText('השעה שנבחרה נתפסה זה עתה. יש לבחור שעה אחרת.')
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(loadPublicBookingSlots).toHaveBeenCalledWith(
        'happy-pets-demo',
        visitDate,
        ['service-1']
      )
    );
  });

  it('joins the compound-service waitlist when no slot is available', async () => {
    loadPublicBookingSlots.mockResolvedValue([]);
    renderPage();
    await selectServiceAndDate();
    expect(await screen.findByText(/אין כרגע זמן/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('שם פרטי'), { target: { value: 'דנה' } });
    fireEvent.change(screen.getByLabelText('שם משפחה'), { target: { value: 'לוי' } });
    fireEvent.change(screen.getByLabelText('טלפון'), { target: { value: '050-1234567' } });
    fireEvent.click(screen.getByRole('button', { name: 'הצטרפות לרשימת ההמתנה' }));
    await waitFor(() =>
      expect(submitPublicWaitlist).toHaveBeenCalledWith('happy-pets-demo', {
        firstName: 'דנה',
        lastName: 'לוי',
        phoneE164: '+972501234567',
        serviceIds: ['service-1'],
        ...businessDateRangeToInstants(visitDate, 'Asia/Jerusalem'),
      })
    );
  });

  it('shows catalog and availability failures in their local states', async () => {
    loadPublicBookingCatalog.mockRejectedValueOnce(new Error('network'));
    const first = renderPage();
    expect(await screen.findByText(/שגיאה בטעינת השירותים/)).toBeInTheDocument();
    first.unmount();

    loadPublicBookingCatalog.mockResolvedValue(catalog);
    loadPublicBookingSlots.mockRejectedValue(new Error('network'));
    renderPage();
    await selectServiceAndDate();
    expect(await screen.findByText('שגיאה בטעינת השעות הפנויות.')).toBeInTheDocument();
  });
});
