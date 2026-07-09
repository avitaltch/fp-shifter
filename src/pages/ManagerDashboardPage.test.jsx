import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ManagerDashboardPage from './ManagerDashboardPage';
import { supabase } from '../lib/supabase';

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn()
  }
}));

describe('ManagerDashboardPage', () => {
  let selectMock, gteMock, lteMock, orderMock;

  beforeEach(() => {
    vi.clearAllMocks();
    
    const todayStr = new Date().toISOString().split('T')[0];
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 2);
    const futureStr = futureDate.toISOString().split('T')[0];

    // Mock chaining
    orderMock = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'apt1',
          visit_date: todayStr,
          status: 'Confirmed',
          customers: { first_name: 'Jane', last_name: 'Doe' },
          appointment_items: [
            {
              id: 'item1',
              start_time: '10:00:00',
              end_time: '11:00:00',
              service_types: { name: 'Haircut' },
              users: { first_name: 'Employee1' }
            }
          ]
        },
        {
          id: 'apt2',
          visit_date: futureStr, // Future appointment
          status: 'Confirmed',
          customers: { first_name: 'John', last_name: 'Smith' },
          appointment_items: [
            { id: 'item2' }, { id: 'item3' }
          ]
        }
      ],
      error: null
    });
    lteMock = vi.fn().mockReturnValue({ order: orderMock });
    gteMock = vi.fn().mockReturnValue({ lte: lteMock });
    selectMock = vi.fn().mockReturnValue({ gte: gteMock });

    supabase.from.mockImplementation(() => ({
      select: selectMock
    }));
  });

  it('renders loading state initially', () => {
    render(<ManagerDashboardPage />);
    expect(screen.getByText(/טוען נתונים/i)).toBeInTheDocument();
  });

  it('fetches and displays dashboard data correctly', async () => {
    render(<ManagerDashboardPage />);
    
    await waitFor(() => {
      expect(screen.queryByText(/טוען נתונים/i)).not.toBeInTheDocument();
    });
    
    // Verify Stats
    expect(screen.getByText('ביקורים היום')).toBeInTheDocument();
    // 1 today appointment
    const statNumbers = screen.getAllByText('1');
    expect(statNumbers.length).toBeGreaterThan(0);
    
    // Verify Today Timeline
    expect(screen.getByText(/לקוח\/ה: Jane Doe/i)).toBeInTheDocument();
    expect(screen.getByText(/Haircut/i)).toBeInTheDocument();
    expect(screen.getByText(/Employee1/i)).toBeInTheDocument();
    
    // Verify Future Section
    expect(screen.getByText(/המשך השבוע/i)).toBeInTheDocument();
    expect(screen.getByText(/John Smith/i)).toBeInTheDocument();
    expect(screen.getByText(/2 טיפולים/i)).toBeInTheDocument();
  });

  it('handles empty state for today', async () => {
    orderMock.mockResolvedValue({ data: [], error: null });
    
    render(<ManagerDashboardPage />);
    
    await waitFor(() => {
      expect(screen.getByText(/אין תורים שנקבעו להיום/i)).toBeInTheDocument();
    });
    
    // Stats should be 0
    const zeroStats = screen.getAllByText('0');
    expect(zeroStats.length).toBe(3); // Visits, Items, Employees
    
    // Future section should NOT be rendered
    expect(screen.queryByText(/המשך השבוע/i)).not.toBeInTheDocument();
  });

  it('handles error gracefully', async () => {
    orderMock.mockRejectedValue(new Error('Network error'));
    
    render(<ManagerDashboardPage />);
    
    await waitFor(() => {
      expect(screen.getByText(/שגיאה בטעינת נתוני הדאשבורד/i)).toBeInTheDocument();
    });
  });
});
