import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import RecommendationsPage from './RecommendationsPage';
import { supabase } from '../lib/supabase';
import { act } from 'react-dom/test-utils';

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn()
    },
    from: vi.fn(),
  }
}));

const mockRecommendations = [
  { 
    id: '1', 
    start_time: '10:00', 
    end_time: '11:00', 
    service_types: { name: 'צבע', default_duration: 60 },
    appointments: { visit_date: '2023-12-01', customers: { first_name: 'ישראל', last_name: 'ישראלי' } }
  }
];

const renderWithRouter = (ui) => {
  return render(<BrowserRouter>{ui}</BrowserRouter>);
};

describe('RecommendationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders login prompt when unauthenticated', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    
    await act(async () => {
      renderWithRouter(<RecommendationsPage />);
    });
    
    expect(screen.getByText(/יש להתחבר כדי לצפות בהמלצות/i)).toBeInTheDocument();
  });

  it('displays recommendations correctly when authenticated', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'user1' } } } });
    supabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        is: vi.fn().mockReturnValue({
          is: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: mockRecommendations, error: null })
          })
        })
      })
    });

    await act(async () => {
      renderWithRouter(<RecommendationsPage />);
    });

    await waitFor(() => {
      expect(screen.getByText('צבע')).toBeInTheDocument();
      expect(screen.getByText(/ישראל ישראלי/i)).toBeInTheDocument();
    });
  });
});
