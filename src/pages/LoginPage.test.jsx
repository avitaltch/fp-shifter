import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LoginPage from './LoginPage';
import { supabase } from '../lib/supabase';

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      signUp: vi.fn(),
      signInWithPassword: vi.fn(),
    }
  }
}));

const renderWithRouter = (ui) => {
  return render(<BrowserRouter>{ui}</BrowserRouter>);
};

describe('LoginPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders login form by default', () => {
    renderWithRouter(<LoginPage />);
    expect(screen.getByText('התחברות למערכת')).toBeInTheDocument();
    expect(screen.getByLabelText(/אימייל/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/סיסמה/i)).toBeInTheDocument();
  });

  it('toggles to sign up form', () => {
    renderWithRouter(<LoginPage />);
    fireEvent.click(screen.getByRole('button', { name: /הרשמה/i }));
    
    expect(screen.getByText('יצירת משתמש חדש')).toBeInTheDocument();
    expect(screen.getByLabelText(/שם מלא/i)).toBeInTheDocument();
  });

  it('calls signUp on submit when in signup mode', async () => {
    supabase.auth.signUp.mockResolvedValue({ data: {}, error: null });
    
    renderWithRouter(<LoginPage />);
    fireEvent.click(screen.getByText('הרשמה עכשיו')); // Switch to signup
    
    fireEvent.change(screen.getByLabelText(/שם מלא/i), { target: { value: 'Test User' } });
    fireEvent.change(screen.getByLabelText(/אימייל/i), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByLabelText(/סיסמה/i), { target: { value: 'password123' } });
    
    fireEvent.click(screen.getByRole('button', { name: 'הרשמה' }));
    
    await waitFor(() => {
      expect(supabase.auth.signUp).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
        options: {
          data: {
            full_name: 'Test User',
            role: 'Employee'
          }
        }
      });
    });
  });

  it('calls signInWithPassword on submit when in login mode', async () => {
    supabase.auth.signInWithPassword.mockResolvedValue({ data: {}, error: null });
    
    renderWithRouter(<LoginPage />);
    
    fireEvent.change(screen.getByLabelText(/אימייל/i), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByLabelText(/סיסמה/i), { target: { value: 'password123' } });
    
    fireEvent.click(screen.getByRole('button', { name: 'התחברות' }));
    
    await waitFor(() => {
      expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
      });
    });
  });

  it('displays error message on auth failure', async () => {
    supabase.auth.signInWithPassword.mockResolvedValue({ data: null, error: new Error('Invalid credentials') });
    
    renderWithRouter(<LoginPage />);
    
    fireEvent.change(screen.getByLabelText(/אימייל/i), { target: { value: 'wrong@example.com' } });
    fireEvent.change(screen.getByLabelText(/סיסמה/i), { target: { value: 'wrongpass' } });
    fireEvent.click(screen.getByRole('button', { name: 'התחברות' }));
    
    expect(await screen.findByText('Invalid credentials')).toBeInTheDocument();
  });
});
