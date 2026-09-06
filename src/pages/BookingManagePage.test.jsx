import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cancelPublicManagedBooking,
  loadPublicManagedAppointment,
} from '../lib/api';
import BookingManagePage from './BookingManagePage';

vi.mock('../lib/api', () => ({
  cancelPublicManagedBooking: vi.fn(),
  loadPublicManagedAppointment: vi.fn(),
}));

const managementToken = `sm_${'m'.repeat(43)}`;
const appointment = {
  appointment_id: 'appointment-1',
  visit_date: '2030-01-07',
  start_time: '2030-01-07T07:00:00.000Z',
  end_time: '2030-01-07T08:00:00.000Z',
  timezone: 'Asia/Jerusalem',
  status: 'Confirmed',
  service_names: ['טיפוח', 'חיסון'],
  customer_first_name: 'דנה',
};

function renderPage(hashToken = managementToken) {
  return render(
    <MemoryRouter initialEntries={[`/book/happy-pets-demo/manage#token=${hashToken}`]}>
      <Routes>
        <Route path="/book/:businessSlug/manage" element={<BookingManagePage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('BookingManagePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    loadPublicManagedAppointment.mockResolvedValue(appointment);
  });

  it('loads an appointment only with its fragment capability', async () => {
    renderPage();
    expect(await screen.findByText('פרטי התור')).toBeInTheDocument();
    expect(loadPublicManagedAppointment).toHaveBeenCalledWith(
      'happy-pets-demo',
      managementToken
    );
    expect(screen.getByText('טיפוח, חיסון')).toBeInTheDocument();
  });

  it('cancels through the same scoped capability', async () => {
    cancelPublicManagedBooking.mockResolvedValue({ ...appointment, status: 'Cancelled' });
    renderPage();
    await screen.findByText('פרטי התור');
    fireEvent.click(screen.getByRole('button', { name: 'ביטול התור' }));
    await waitFor(() =>
      expect(cancelPublicManagedBooking).toHaveBeenCalledWith(
        'happy-pets-demo',
        managementToken
      )
    );
    expect(await screen.findByText('התור בוטל בהצלחה.')).toBeInTheDocument();
  });

  it('does not expose the legacy phone lookup when the token is missing', async () => {
    render(
      <MemoryRouter initialEntries={['/book/happy-pets-demo/manage']}>
        <Routes>
          <Route path="/book/:businessSlug/manage" element={<BookingManagePage />} />
        </Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText('קישור ניהול התור חסר או אינו תקין.')).toBeInTheDocument();
    expect(screen.queryByLabelText('טלפון')).not.toBeInTheDocument();
    expect(loadPublicManagedAppointment).not.toHaveBeenCalled();
  });
});
