import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ServiceManagementPage from './ServiceManagementPage';
import { supabase } from '../lib/supabase';
import { act } from 'react-dom/test-utils';

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  }
}));

const mockServices = [
  { id: '1', name: 'תספורת גברים', base_price: 100, default_duration: 30, description: 'תספורת פשוטה' }
];

const renderWithRouter = (ui) => {
  return render(<BrowserRouter>{ui}</BrowserRouter>);
};

describe('ServiceManagementPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', async () => {
    supabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        is: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [], error: null })
        })
      })
    });
    
    await act(async () => {
      renderWithRouter(<ServiceManagementPage />);
    });
    
    expect(screen.getByText(/ניהול שירותים/i)).toBeInTheDocument();
  });

  it('displays services correctly', async () => {
    supabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        is: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: mockServices, error: null })
        })
      })
    });

    await act(async () => {
      renderWithRouter(<ServiceManagementPage />);
    });

    await waitFor(() => {
      expect(screen.getByText('תספורת גברים')).toBeInTheDocument();
      expect(screen.getByText('₪100')).toBeInTheDocument();
      expect(screen.getByText("30 דק'")).toBeInTheDocument();
    });
  });

  it('handles empty state', async () => {
    supabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        is: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [], error: null })
        })
      })
    });

    await act(async () => {
      renderWithRouter(<ServiceManagementPage />);
    });

    await waitFor(() => {
      expect(screen.getByText(/לא נמצאו שירותים/i)).toBeInTheDocument();
    });
  });
});
