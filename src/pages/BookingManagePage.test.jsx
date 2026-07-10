import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import BookingManagePage from './BookingManagePage';
import { BOOKING_CONFIRMATION_KEY } from './BookingSuccessPage';
import { customerGetAppointment, customerCancelAppointment } from '../lib/api';
import { formatHebrewDate } from '../lib/dates';

vi.mock('../lib/api', () => ({
  customerGetAppointment: vi.fn(),
  customerCancelAppointment: vi.fn(),
}));

const appointment = {
  appointment_id: 'apt-42',
  visit_date: '2026-07-20',
  start_time: '10:00:00',
  end_time: '11:00:00',
  status: 'Confirmed',
  service_names: ['תספורת', 'צבע'],
  customer_first_name: 'דנה',
};

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/book/manage']}>
      <Routes>
        <Route path="/book/manage" element={<BookingManagePage />} />
        <Route path="/book" element={<div>booking page</div>} />
      </Routes>
    </MemoryRouter>
  );

async function lookupAppointment() {
  fireEvent.change(screen.getByLabelText('מספר אישור'), {
    target: { value: 'apt-42' },
  });
  fireEvent.change(screen.getByLabelText('טלפון'), {
    target: { value: '050-1234567' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'איתור תור' }));
}

describe('BookingManagePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    window.confirm = vi.fn(() => true);
  });

  it('looks up an appointment and shows Hebrew details', async () => {
    customerGetAppointment.mockResolvedValue(appointment);
    renderPage();

    await lookupAppointment();

    await waitFor(() => {
      expect(customerGetAppointment).toHaveBeenCalledWith('apt-42', '050-1234567');
    });
    expect(screen.getByText('דנה')).toBeInTheDocument();
    expect(screen.getByText(formatHebrewDate('2026-07-20'))).toBeInTheDocument();
    expect(screen.getByText('10:00 עד 11:00')).toBeInTheDocument();
    expect(screen.getByText('תספורת, צבע')).toBeInTheDocument();
    expect(screen.getByText('מאושר')).toBeInTheDocument();
  });

  it('shows not-found error when lookup fails', async () => {
    customerGetAppointment.mockRejectedValue(new Error('APPOINTMENT_NOT_FOUND'));
    renderPage();

    await lookupAppointment();

    expect(
      await screen.findByText('התור לא נמצא או שכבר בוטל.')
    ).toBeInTheDocument();
    expect(screen.queryByText('פרטי התור')).not.toBeInTheDocument();
  });

  it('cancels after confirm and shows the rebook path', async () => {
    customerGetAppointment.mockResolvedValue(appointment);
    customerCancelAppointment.mockResolvedValue(null);
    renderPage();

    await lookupAppointment();
    await screen.findByText('פרטי התור');

    fireEvent.click(screen.getByRole('button', { name: 'ביטול התור' }));

    await waitFor(() => {
      expect(customerCancelAppointment).toHaveBeenCalledWith('apt-42', '050-1234567');
    });
    expect(window.confirm).toHaveBeenCalled();
    expect(await screen.findByText('התור בוטל בהצלחה.')).toBeInTheDocument();
    expect(screen.getByText('התור בוטל. לקביעת תור חדש:')).toBeInTheDocument();
    const rebook = screen.getByRole('link', { name: 'קביעת תור חדש' });
    expect(rebook).toHaveAttribute('href', '/book');
    expect(screen.getByText('בוטל')).toBeInTheDocument();
  });

  it('shows CANCEL_TOO_LATE when cancel is rejected as too late', async () => {
    customerGetAppointment.mockResolvedValue(appointment);
    customerCancelAppointment.mockRejectedValue(new Error('CANCEL_TOO_LATE'));
    renderPage();

    await lookupAppointment();
    await screen.findByText('פרטי התור');
    fireEvent.click(screen.getByRole('button', { name: 'ביטול התור' }));

    expect(
      await screen.findByText('לא ניתן לבטל תור שכבר התחיל או שעבר.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ביטול התור' })).toBeInTheDocument();
  });

  it('shows ALREADY_CANCELLED when the appointment was already cancelled', async () => {
    customerGetAppointment.mockResolvedValue(appointment);
    customerCancelAppointment.mockRejectedValue(new Error('ALREADY_CANCELLED'));
    renderPage();

    await lookupAppointment();
    await screen.findByText('פרטי התור');
    fireEvent.click(screen.getByRole('button', { name: 'ביטול התור' }));

    expect(await screen.findByText('התור כבר בוטל.')).toBeInTheDocument();
  });

  it('prefills confirmation number and phone from sessionStorage', () => {
    sessionStorage.setItem(
      BOOKING_CONFIRMATION_KEY,
      JSON.stringify({
        booking: { appointment_id: 'apt-99' },
        phone: '052-9998887',
      })
    );

    renderPage();

    expect(screen.getByLabelText('מספר אישור')).toHaveValue('apt-99');
    expect(screen.getByLabelText('טלפון')).toHaveValue('052-9998887');
  });

  it('does not cancel when the user declines the confirm dialog', async () => {
    window.confirm = vi.fn(() => false);
    customerGetAppointment.mockResolvedValue(appointment);
    renderPage();

    await lookupAppointment();
    await screen.findByText('פרטי התור');
    fireEvent.click(screen.getByRole('button', { name: 'ביטול התור' }));

    expect(customerCancelAppointment).not.toHaveBeenCalled();
  });
});
