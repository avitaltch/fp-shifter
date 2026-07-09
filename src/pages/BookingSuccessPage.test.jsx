import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import BookingSuccessPage from './BookingSuccessPage';
import { formatHebrewDate } from '../lib/dates';

const renderWithState = (state) =>
  render(
    <MemoryRouter initialEntries={[{ pathname: '/book/success', state }]}>
      <Routes>
        <Route path="/book/success" element={<BookingSuccessPage />} />
      </Routes>
    </MemoryRouter>
  );

describe('BookingSuccessPage', () => {
  it('renders the booking details passed via router state', () => {
    renderWithState({
      booking: {
        id: 'b1',
        visit_date: '2026-07-20',
        start_time: '10:00:00',
        total_duration: 105,
        total_price: 350,
      },
      serviceNames: ['תספורת', 'צבע'],
    });

    expect(screen.getByText('התור שלך נקבע בהצלחה!')).toBeInTheDocument();
    expect(screen.getByText('תספורת, צבע')).toBeInTheDocument();
    expect(screen.getByText(formatHebrewDate('2026-07-20'))).toBeInTheDocument();
    expect(screen.getByText('10:00')).toBeInTheDocument();
    expect(screen.getByText('שעה ו-45 דקות')).toBeInTheDocument();
    expect(screen.getByText('₪350')).toBeInTheDocument();
  });

  it('falls back to a generic confirmation when there is no router state', () => {
    renderWithState(undefined);

    expect(screen.getByText('התור שלך נקבע בהצלחה!')).toBeInTheDocument();
    expect(screen.getByText('ההזמנה נקלטה במערכת. נתראה בקרוב!')).toBeInTheDocument();
    expect(screen.queryByText('פרטי הביקור:')).not.toBeInTheDocument();
  });

  it('links back to the booking page at /book', () => {
    renderWithState(undefined);

    const backLink = screen.getByRole('link', { name: /חזרה להזמנת תור נוסף/ });
    expect(backLink).toHaveAttribute('href', '/book');
  });
});
