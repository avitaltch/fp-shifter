import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ShiftAssignmentPage from './ShiftAssignmentPage';
import { supabase } from '../lib/supabase';

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  }
}));

describe('ShiftAssignmentPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', () => {
    const selectMock = vi.fn().mockResolvedValue(new Promise(() => {}));
    supabase.from.mockReturnValue({ select: vi.fn().mockReturnValue({ is: vi.fn().mockReturnValue({ order: selectMock }) }) });
    
    render(<ShiftAssignmentPage />);
    expect(screen.getByText('טוען נתונים...')).toBeInTheDocument();
  });

  it('renders empty state if no unassigned items', async () => {
    // Mock items fetch
    const orderMock = vi.fn().mockResolvedValue({ data: [], error: null });
    const isMock = vi.fn().mockReturnValue({ order: orderMock });
    const selectMock = vi.fn().mockReturnValue({ is: isMock });
    
    // Mock employees fetch
    const eqMock = vi.fn().mockResolvedValue({ data: [], error: null });
    const empSelectMock = vi.fn().mockReturnValue({ eq: eqMock });
    
    supabase.from.mockImplementation((table) => {
      if (table === 'appointment_items') return { select: selectMock };
      if (table === 'users') return { select: empSelectMock };
    });

    render(<ShiftAssignmentPage />);
    
    await waitFor(() => {
      expect(screen.getByText(/מעולה! כל הטיפולים שובצו בהצלחה./i)).toBeInTheDocument();
    });
  });

  it('renders list of unassigned items', async () => {
    const mockItems = [
      {
        id: '1',
        start_time: '10:00:00',
        end_time: '10:30:00',
        appointments: { visit_date: '2026-10-15', customers: { first_name: 'John', last_name: 'Doe' } },
        service_types: { name: 'Haircut' }
      }
    ];

    const mockEmps = [
      { id: 'e1', first_name: 'Jane', last_name: 'Smith' }
    ];

    const orderMock = vi.fn().mockResolvedValue({ data: mockItems, error: null });
    const isMock = vi.fn().mockReturnValue({ order: orderMock });
    const selectMock = vi.fn().mockReturnValue({ is: isMock });
    
    const eqMock = vi.fn().mockResolvedValue({ data: mockEmps, error: null });
    const empSelectMock = vi.fn().mockReturnValue({ eq: eqMock });
    
    supabase.from.mockImplementation((table) => {
      if (table === 'appointment_items') return { select: selectMock };
      if (table === 'users') return { select: empSelectMock };
    });

    render(<ShiftAssignmentPage />);
    
    await waitFor(() => {
      expect(screen.getByText('Haircut')).toBeInTheDocument();
      expect(screen.getByText(/John Doe/i)).toBeInTheDocument();
      expect(screen.getByText(/10:00/i)).toBeInTheDocument();
      expect(screen.getByText(/Jane Smith/i)).toBeInTheDocument();
    });
  });
});
