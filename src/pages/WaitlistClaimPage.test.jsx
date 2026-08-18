import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  acceptPublicWaitlistOffer,
  loadPublicBookingCatalog,
} from '../lib/api';
import WaitlistClaimPage from './WaitlistClaimPage';

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    acceptPublicWaitlistOffer: vi.fn(),
    loadPublicBookingCatalog: vi.fn(),
  };
});

const token = `wo_${'a'.repeat(43)}`;
const accepted = {
  appointmentId: 'appointment-1',
  status: 'Confirmed',
  startsAt: '2030-01-07T07:00:00.000Z',
  endsAt: '2030-01-07T08:00:00.000Z',
  totalPriceMinor: 12_500,
  currency: 'ILS',
  managementToken: `sm_${'b'.repeat(43)}`,
  managementTokenExpiresAt: '2031-01-07T07:00:00.000Z',
  steps: [
    { sequenceNumber: 1, serviceId: 'service-2' },
    { sequenceNumber: 2, serviceId: 'service-1' },
  ],
};

function renderPage(hashToken = token) {
  return render(
    <MemoryRouter
      initialEntries={[
        `/waitlist/claim/happy-pets-demo#token=${hashToken}`,
      ]}
    >
      <Routes>
        <Route
          path="/waitlist/claim/:businessSlug"
          element={<WaitlistClaimPage />}
        />
      </Routes>
    </MemoryRouter>
  );
}

describe('WaitlistClaimPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    loadPublicBookingCatalog.mockResolvedValue({
      business: { name: 'Happy Pets' },
      location: { timezone: 'Asia/Jerusalem' },
      services: [
        { id: 'service-1', name: 'חיסון' },
        { id: 'service-2', name: 'תספורת' },
      ],
    });
    acceptPublicWaitlistOffer.mockResolvedValue(accepted);
  });

  it('accepts a valid one-use offer and navigates with ordered confirmation data', async () => {
    renderPage();

    expect(acceptPublicWaitlistOffer).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'אישור וקביעת התור' }));
    expect(screen.getByText('שומרים את הזמן ומאשרים את התור...')).toBeInTheDocument();
    await waitFor(() => {
      expect(acceptPublicWaitlistOffer).toHaveBeenCalledWith(
        'happy-pets-demo',
        token
      );
    });
    expect(mockNavigate).toHaveBeenCalledWith(
      '/book/happy-pets-demo/success',
      {
        replace: true,
        state: expect.objectContaining({
          serviceNames: ['תספורת', 'חיסון'],
          bookingPath: '/book/happy-pets-demo',
          timezone: 'Asia/Jerusalem',
          booking: expect.objectContaining({
            appointment_id: 'appointment-1',
            visit_date: '2030-01-07',
            total_price: 125,
          }),
        }),
      }
    );
    expect(sessionStorage.getItem('bookingConfirmation')).toBeNull();
  });

  it('rejects malformed offer capabilities without contacting the API', async () => {
    renderPage('not-a-capability');

    expect(
      await screen.findByText('קישור ההמתנה חסר או אינו תקין.')
    ).toBeInTheDocument();
    expect(acceptPublicWaitlistOffer).not.toHaveBeenCalled();
    expect(loadPublicBookingCatalog).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'חזרה להזמנת תור' })).toHaveAttribute(
      'href',
      '/book/happy-pets-demo'
    );
  });

  it('shows an actionable message when the offer has expired', async () => {
    acceptPublicWaitlistOffer.mockRejectedValue({
      code: 'WAITLIST_OFFER_EXPIRED',
      message: 'expired',
    });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'אישור וקביעת התור' }));

    expect(
      await screen.findByText(
        'הזמן שהוצע כבר אינו שמור. נמשיך לעדכן אותך כשיתפנה זמן נוסף.'
      )
    ).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
