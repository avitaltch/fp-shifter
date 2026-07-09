import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import MyShiftsPage from './MyShiftsPage';
import { supabase } from '../lib/supabase';

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
    },
    from: vi.fn()
  }
}));

describe('MyShiftsPage', () => {
  let selectMock, eqMock, eqMock2, orderMock, updateMock, updateEqMock;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock user session
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: 'user123', user_metadata: { full_name: 'Test User' } } } }
    });

    // Mock chaining for select
    orderMock = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'task1',
          start_time: '10:00:00',
          end_time: '11:00:00',
          status: 'Scheduled',
          appointments: { customers: { first_name: 'Jane', last_name: 'Doe' } },
          service_types: { name: 'Haircut' }
        }
      ],
      error: null
    });
    
    eqMock2 = vi.fn().mockReturnValue({ order: orderMock });
    eqMock = vi.fn().mockReturnValue({ eq: eqMock2 });
    selectMock = vi.fn().mockReturnValue({ eq: eqMock });

    // Mock chaining for update
    updateEqMock = vi.fn().mockResolvedValue({ error: null });
    updateMock = vi.fn().mockReturnValue({ eq: updateEqMock });

    supabase.from.mockImplementation((table) => {
      if (table === 'appointment_items') {
        return {
          select: selectMock,
          update: updateMock
        };
      }
      return {};
    });
    
    vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  it('renders loading state initially and then shifts', async () => {
    render(<MyShiftsPage />);
    
    await waitFor(() => {
      expect(screen.getByText(/טוען משמרות/i)).toBeInTheDocument();
    });
    
    await waitFor(() => {
      expect(screen.queryByText(/טוען משמרות/i)).not.toBeInTheDocument();
    });
    
    expect(screen.getByText(/המשמרות שלי - Test User/i)).toBeInTheDocument();
    expect(screen.getByText(/Haircut/i)).toBeInTheDocument();
    expect(screen.getByText(/Jane Doe/i)).toBeInTheDocument();
  });

  it('displays empty state if no shifts are found', async () => {
    orderMock.mockResolvedValue({ data: [], error: null });
    
    render(<MyShiftsPage />);
    
    await waitFor(() => {
      expect(screen.getByText(/אין טיפולים שנקבעו להיום/i)).toBeInTheDocument();
    });
  });

  it('toggles a shift status', async () => {
    render(<MyShiftsPage />);
    
    await waitFor(() => {
      expect(screen.getByText(/מתוכנן/i)).toBeInTheDocument();
    });
    
    const statusBtn = screen.getByText(/מתוכנן/i);
    
    await act(async () => {
      fireEvent.click(statusBtn);
    });
    
    expect(supabase.from).toHaveBeenCalledWith('appointment_items');
    expect(updateMock).toHaveBeenCalledWith({ status: 'In_Progress' });
    expect(updateEqMock).toHaveBeenCalledWith('id', 'task1');
    
    expect(screen.getByText(/בביצוע/i)).toBeInTheDocument();
  });

  it('handles fetch error gracefully', async () => {
    orderMock.mockRejectedValue(new Error('Network error'));
    
    render(<MyShiftsPage />);
    
    await waitFor(() => {
      expect(screen.getByText(/שגיאה בטעינת משמרות/i)).toBeInTheDocument();
    });
  });

  it('handles update error gracefully', async () => {
    updateEqMock.mockRejectedValue(new Error('Update failed'));
    
    render(<MyShiftsPage />);
    
    await waitFor(() => {
      expect(screen.getByText(/מתוכנן/i)).toBeInTheDocument();
    });
    
    const statusBtn = screen.getByText(/מתוכנן/i);
    
    await act(async () => {
      fireEvent.click(statusBtn);
    });
    
    expect(window.alert).toHaveBeenCalledWith("שגיאה בעדכון הסטטוס");
  });

  it('shows please login if no session', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    
    await act(async () => {
      render(<MyShiftsPage />);
    });
    
    expect(screen.getByText(/יש להתחבר כדי לצפות במשמרות/i)).toBeInTheDocument();
  });
});
