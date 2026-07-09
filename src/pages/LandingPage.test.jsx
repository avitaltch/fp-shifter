import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import LandingPage from './LandingPage';

const renderWithRouter = (ui) => {
  return render(<BrowserRouter>{ui}</BrowserRouter>);
};

describe('LandingPage Component', () => {
  it('renders the hero section with generic title', () => {
    renderWithRouter(<LandingPage />);
    // Verify our new generic title is rendered
    expect(screen.getByText(/ניהול משמרות, עכשיו/i)).toBeInTheDocument();
    expect(screen.getByText(/ללא חיכוך/i)).toBeInTheDocument();
  });

  it('renders action buttons', () => {
    renderWithRouter(<LandingPage />);
    const link = screen.getByRole('link', { name: /הזמנת תור חדש/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/book/1');
  });

  it('renders feature cards', () => {
    renderWithRouter(<LandingPage />);
    expect(screen.getByText(/תכנון מהיר/i)).toBeInTheDocument();
    expect(screen.getByText(/ניהול צוותים/i)).toBeInTheDocument();
    expect(screen.getByText(/התראות זמן אמת/i)).toBeInTheDocument();
  });
});
