import { render, screen, fireEvent, act } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Navbar from './Navbar';
import { supabase } from '../../lib/supabase';

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
      signOut: vi.fn(),
    }
  }
}));

const renderWithRouter = (ui) => {
  return render(<BrowserRouter>{ui}</BrowserRouter>);
};

describe('Navbar Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default mock implementation
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    supabase.auth.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } }
    });
  });

  it('renders login link when no user is logged in', async () => {
    renderWithRouter(<Navbar />);
    
    const loginLink = await screen.findByRole('link', { name: /התחברות/i });
    expect(loginLink).toBeInTheDocument();
    expect(screen.queryByText(/התנתק/i)).not.toBeInTheDocument();
  });

  it('renders logout button when user is logged in', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id: '1' } } } });
    
    renderWithRouter(<Navbar />);
    
    const logoutBtn = await screen.findByRole('button', { name: /התנתק/i });
    expect(logoutBtn).toBeInTheDocument();
    expect(screen.queryByText(/התחברות/i)).not.toBeInTheDocument();
  });

  it('calls signOut and redirects when logout is clicked', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id: '1' } } } });
    supabase.auth.signOut.mockResolvedValue({ error: null });
    
    renderWithRouter(<Navbar />);
    
    const logoutBtn = await screen.findByText('התנתק');
    
    await act(async () => {
      fireEvent.click(logoutBtn);
    });
    
    expect(supabase.auth.signOut).toHaveBeenCalled();
  });

  it('toggles mobile menu when hamburger icon is clicked', async () => {
    renderWithRouter(<Navbar />);
    
    // The ul has the class 'nav-menu' and gets 'active' when open
    const menuList = document.querySelector('.nav-menu');
    expect(menuList).not.toHaveClass('active');

    const menuIcon = document.querySelector('.menu-icon');
    
    act(() => {
      fireEvent.click(menuIcon);
    });
    
    expect(menuList).toHaveClass('active');
    
    act(() => {
      fireEvent.click(menuIcon);
    });
    
    expect(menuList).not.toHaveClass('active');
  });

  it('closes mobile menu when a navigation link is clicked', async () => {
    renderWithRouter(<Navbar />);
    
    const menuIcon = document.querySelector('.menu-icon');
    
    act(() => {
      fireEvent.click(menuIcon);
    });
    
    const menuList = document.querySelector('.nav-menu');
    expect(menuList).toHaveClass('active');
    
    const bookingLink = await screen.findByText(/הזמנת תור/i);
    
    act(() => {
      fireEvent.click(bookingLink);
    });
    
    expect(menuList).not.toHaveClass('active');
  });
});
