import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import AboutPage from './AboutPage';

const renderWithRouter = (ui) => {
  return render(<BrowserRouter>{ui}</BrowserRouter>);
};

describe('AboutPage Component', () => {
  it('renders about page content', () => {
    renderWithRouter(<AboutPage />);
    
    // Check titles
    expect(screen.getByText(/אודות ShiftSync/i)).toBeInTheDocument();
    
    // Check descriptions
    expect(screen.getByText(/החזון שלנו/i)).toBeInTheDocument();
    expect(screen.getByText(/למה אנחנו/i)).toBeInTheDocument();
    expect(screen.getByText(/לנהל משמרות עובדים בצורה חכמה/i)).toBeInTheDocument();
  });
});
