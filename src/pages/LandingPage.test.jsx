import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import LandingPage from './LandingPage';

const renderWithRouter = (ui) => {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
};

describe('LandingPage Component', () => {
  it('renders the hero section with generic title', () => {
    renderWithRouter(<LandingPage />);
    expect(screen.getByText(/ניהול משמרות, עכשיו/i)).toBeInTheDocument();
    expect(screen.getByText(/ללא חיכוך/i)).toBeInTheDocument();
  });

  it('links the booking action to the single-tenant /book route', () => {
    renderWithRouter(<LandingPage />);
    const link = screen.getByRole('link', { name: /הזמנת תור חדש/i });
    expect(link).toHaveAttribute('href', '/book');
    expect(screen.getByRole('link', { name: /קרא עוד/i })).toHaveAttribute('href', '/about');
  });

  it('renders feature cards', () => {
    renderWithRouter(<LandingPage />);
    expect(screen.getByText(/תכנון מהיר/i)).toBeInTheDocument();
    expect(screen.getByText(/ניהול צוותים/i)).toBeInTheDocument();
    expect(screen.getByText(/זמינות חכמה/i)).toBeInTheDocument();
  });
});
