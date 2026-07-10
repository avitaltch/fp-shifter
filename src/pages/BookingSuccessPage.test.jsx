import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, beforeEach } from 'vitest';
import BookingSuccessPage, { BOOKING_CONFIRMATION_KEY } from './BookingSuccessPage';
import { formatHebrewDate } from '../lib/dates';

const confirmation = {
  booking: {
    appointment_id: 'apt-42',
    visit_date: '2026-07-20',
    start_time: '10:00:00',
    end_time: '11:45:00',
    total_duration: 105,
    total_price: 350,
  },
  serviceNames: ['תספורת', 'צבע'],
  customerName: 'דנה לוי',
};

const renderWithState = (state) =>
  render(
    <MemoryRouter initialEntries={[{ pathname: '/book/success', state }]}>
      <Routes>
        <Route path="/book/success" element={<BookingSuccessPage />} />
      </Routes>
    </MemoryRouter>
  );

const expectFullDetails = () => {
  expect(screen.getByText('התור שלך נקבע בהצלחה!')).toBeInTheDocument();
  expect(screen.getByText('apt-42')).toBeInTheDocument();
  expect(screen.getByText('דנה לוי')).toBeInTheDocument();
  expect(screen.getByText('תספורת, צבע')).toBeInTheDocument();
  expect(screen.getByText(formatHebrewDate('2026-07-20'))).toBeInTheDocument();
  expect(screen.getByText('10:00 עד 11:45')).toBeInTheDocument();
  expect(screen.getByText('שעה ו-45 דקות')).toBeInTheDocument();
  expect(screen.getByText('₪350')).toBeInTheDocument();
  expect(
    screen.getByRole('link', { name: 'לביטול או שינוי התור' })
  ).toHaveAttribute('href', '/book/manage');
};

describe('BookingSuccessPage', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('renders confirmation number, name, times and the call-to-change note from router state', () => {
    renderWithState(confirmation);
    expectFullDetails();
  });

  it('falls back to sessionStorage when there is no router state (refresh / direct visit)', () => {
    sessionStorage.setItem(BOOKING_CONFIRMATION_KEY, JSON.stringify(confirmation));
    renderWithState(undefined);
    expectFullDetails();
  });

  it('shows only the start time when end_time is missing', () => {
    renderWithState({
      booking: {
        appointment_id: 'apt-42',
        visit_date: '2026-07-20',
        start_time: '10:00:00',
        total_duration: 105,
        total_price: 350,
      },
      serviceNames: [],
    });

    expect(screen.getByText('10:00')).toBeInTheDocument();
    expect(screen.queryByText(/עד/)).not.toBeInTheDocument();
  });

  it('falls back to a generic confirmation when there is no state and no stored copy', () => {
    renderWithState(undefined);

    expect(screen.getByText('התור שלך נקבע בהצלחה!')).toBeInTheDocument();
    expect(screen.getByText('ההזמנה נקלטה במערכת. נתראה בקרוב!')).toBeInTheDocument();
    expect(screen.queryByText('פרטי הביקור:')).not.toBeInTheDocument();
  });

  it('shows the generic confirmation when the stored copy is corrupt JSON', () => {
    sessionStorage.setItem(BOOKING_CONFIRMATION_KEY, '{not json');
    renderWithState(undefined);

    expect(screen.getByText('ההזמנה נקלטה במערכת. נתראה בקרוב!')).toBeInTheDocument();
  });

  it('links back to the booking page at /book', () => {
    renderWithState(undefined);

    const backLink = screen.getByRole('link', { name: /חזרה להזמנת תור נוסף/ });
    expect(backLink).toHaveAttribute('href', '/book');
  });

  it('links to /book/manage for cancel or change', () => {
    renderWithState(confirmation);

    expect(
      screen.getByRole('link', { name: 'לביטול או שינוי התור' })
    ).toHaveAttribute('href', '/book/manage');
  });
});
