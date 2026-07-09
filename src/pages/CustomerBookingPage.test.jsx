import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CustomerBookingPage from './CustomerBookingPage';
import { supabase } from '../lib/supabase';

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  }
}));

const mockServices = [
  { id: 's1', name: 'תספורת', base_price: 150 },
  { id: 's2', name: 'צבע', base_price: 200 }
];

const renderWithRouter = (ui) => {
  return render(<BrowserRouter>{ui}</BrowserRouter>);
};

describe('CustomerBookingPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock the Supabase chain: supabase.from().select()
    const selectMock = vi.fn().mockResolvedValue({ data: mockServices, error: null });
    supabase.from.mockReturnValue({ select: selectMock });
  });

  it('fetches and displays services on load', async () => {
    renderWithRouter(<CustomerBookingPage />);
    
    expect(supabase.from).toHaveBeenCalledWith('service_types');
    
    await waitFor(() => {
      expect(screen.getByText(/תספורת/i)).toBeInTheDocument();
      expect(screen.getByText(/₪150/i)).toBeInTheDocument();
      expect(screen.getByText(/צבע/i)).toBeInTheDocument();
      expect(screen.getByText(/₪200/i)).toBeInTheDocument();
    });
  });

  it('selects multiple services and calculates correct total price', async () => {
    renderWithRouter(<CustomerBookingPage />);
    
    await waitFor(() => {
      expect(screen.getByText(/תספורת/i)).toBeInTheDocument();
    });

    // Toggle on both services
    fireEvent.click(screen.getByText(/תספורת/i));
    fireEvent.click(screen.getByText(/צבע/i));
    
    // Total should be 150 + 200 = 350
    expect(screen.getByText(/₪350/i)).toBeInTheDocument();
  });

  it('requires date and time before allowing submission', async () => {
    renderWithRouter(<CustomerBookingPage />);
    
    await waitFor(() => {
      expect(screen.getByText(/תספורת/i)).toBeInTheDocument();
    });

    // Select a service (shows datetime section)
    fireEvent.click(screen.getByText(/תספורת/i));
    
    // The submit button should be disabled initially
    const submitBtn = screen.getByRole('button', { name: /אישור הזמנה/i });
    expect(submitBtn).toBeDisabled();

    // Fill date
    const dateInput = screen.getByLabelText('תאריך הביקור');
    fireEvent.change(dateInput, { target: { value: '2026-10-15' } });
    
    // Select should appear
    const timeSelect = await screen.findByRole('combobox');
    fireEvent.change(timeSelect, { target: { value: '10:00' } });

    // Still disabled because missing personal details
    expect(submitBtn).toBeDisabled();

    // Fill personal details
    fireEvent.change(screen.getByLabelText('שם פרטי'), { target: { value: 'John' } });
    fireEvent.change(screen.getByLabelText('שם משפחה'), { target: { value: 'Doe' } });
    fireEvent.change(screen.getByLabelText('טלפון'), { target: { value: '0501234567' } });

    // Now it should be enabled
    expect(submitBtn).not.toBeDisabled();
  });
});
