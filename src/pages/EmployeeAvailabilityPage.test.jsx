import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import EmployeeAvailabilityPage from './EmployeeAvailabilityPage';
import { supabase } from '../lib/supabase';

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
    },
    from: vi.fn()
  }
}));

describe('EmployeeAvailabilityPage', () => {
  let insertMock;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock user session
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: 'user123' } } }
    });

    // Mock insert
    insertMock = vi.fn().mockResolvedValue({ error: null });
    supabase.from.mockReturnValue({
      insert: insertMock
    });

    // Mock window.alert
    vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  it('renders the form correctly', async () => {
    await act(async () => {
      render(<EmployeeAvailabilityPage />);
    });
    
    expect(screen.getByText(/הזנת זמינות - אזור אישי/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /שמירת זמינות/i })).toBeInTheDocument();
  });

  it('shows alert if trying to submit without date', async () => {
    await act(async () => {
      render(<EmployeeAvailabilityPage />);
    });
    
    // Initially the button is disabled if no date is selected.
    // Let's force it or check if it's disabled.
    const submitBtn = screen.getByRole('button', { name: /שמירת זמינות/i });
    expect(submitBtn).toBeDisabled();
  });

  it('submits form successfully and calls supabase insert', async () => {
    await act(async () => {
      render(<EmployeeAvailabilityPage />);
    });
    
    const dateInput = screen.getByLabelText(/תאריך/i);
    fireEvent.change(dateInput, { target: { value: '2023-11-01' } });
    
    const submitBtn = screen.getByRole('button', { name: /שמירת זמינות/i });
    expect(submitBtn).not.toBeDisabled();
    
    await act(async () => {
      fireEvent.submit(submitBtn.closest('form'));
    });
    
    expect(supabase.from).toHaveBeenCalledWith('availabilities');
    expect(insertMock).toHaveBeenCalledWith({
      user_id: 'user123',
      available_date: '2023-11-01',
      start_time: '08:00',
      end_time: '16:00'
    });
    
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('נשמרה בהצלחה'));
  });

  it('shows error if not logged in', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    
    await act(async () => {
      render(<EmployeeAvailabilityPage />);
    });
    
    const dateInput = screen.getByLabelText(/תאריך/i);
    fireEvent.change(dateInput, { target: { value: '2023-11-01' } });
    
    const submitBtn = screen.getByRole('button', { name: /שמירת זמינות/i });
    
    await act(async () => {
      fireEvent.submit(submitBtn.closest('form'));
    });
    
    expect(window.alert).toHaveBeenCalledWith("יש להתחבר כדי להזין זמינות");
    expect(insertMock).not.toHaveBeenCalled();
  });
  
  it('handles supabase insert error gracefully', async () => {
    insertMock.mockResolvedValue({ error: new Error('DB Error') });
    
    await act(async () => {
      render(<EmployeeAvailabilityPage />);
    });
    
    const dateInput = screen.getByLabelText(/תאריך/i);
    fireEvent.change(dateInput, { target: { value: '2023-11-01' } });
    
    const submitBtn = screen.getByRole('button', { name: /שמירת זמינות/i });
    
    await act(async () => {
      fireEvent.submit(submitBtn.closest('form'));
    });
    
    expect(window.alert).toHaveBeenCalledWith("שגיאה בשמירת הזמינות. יש לנסות שוב.");
  });
});
