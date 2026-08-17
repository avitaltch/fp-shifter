import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import LandingPage from './LandingPage';

const renderWithRouter = (ui) => {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
};

describe('LandingPage Component', () => {
  it('renders the compound-booking value proposition', () => {
    renderWithRouter(<LandingPage />);
    expect(screen.getByText(/ביקור אחד. כמה שירותים./i)).toBeInTheDocument();
    expect(screen.getByText(/הכל מתחבר/i)).toBeInTheDocument();
    expect(screen.getByLabelText('שלושה שירותים רצופים')).toBeInTheDocument();
  });

  it('links the booking action to the single-tenant /book route', () => {
    renderWithRouter(<LandingPage />);
    const link = screen.getByRole('link', { name: /הזמנת תור חדש/i });
    expect(link).toHaveAttribute('href', '/book');
    expect(screen.getByRole('link', { name: /קרא עוד/i })).toHaveAttribute('href', '/about');
  });

  it('renders feature cards', () => {
    renderWithRouter(<LandingPage />);
    expect(screen.getByText(/ביקור מורכב, מסלול אחד/i)).toBeInTheDocument();
    expect(screen.getByText(/הצוות נשאר מסונכרן/i)).toBeInTheDocument();
    expect(screen.getByText(/היומן עובד בשבילכם/i)).toBeInTheDocument();
  });
});
