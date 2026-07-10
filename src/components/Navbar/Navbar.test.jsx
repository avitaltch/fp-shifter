import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Navbar from './Navbar';
import { useAuth } from '../../context/AuthContext';

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../../context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

const signOut = vi.fn();

const authAs = (role) =>
  useAuth.mockReturnValue({
    session: role ? { user: { id: 'user-1' } } : null,
    profile: role ? { first_name: 'דנה', last_name: 'לוי', role } : null,
    role: role ?? null,
    loading: false,
    signOut,
  });

const renderNavbar = () =>
  render(
    <MemoryRouter>
      <Navbar />
    </MemoryRouter>
  );

describe('Navbar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signOut.mockResolvedValue();
  });

  it('shows only the public booking link and staff login when logged out', () => {
    authAs(null);
    renderNavbar();

    expect(screen.getByRole('link', { name: /הזמנת תור/ })).toHaveAttribute('href', '/book');
    expect(screen.getByRole('link', { name: /כניסת צוות/ })).toBeInTheDocument();

    expect(screen.queryByText('המשמרות שלי')).not.toBeInTheDocument();
    expect(screen.queryByText('לוח בקרה')).not.toBeInTheDocument();
    expect(screen.queryByText('התנתק')).not.toBeInTheDocument();
  });

  it('shows employee links but no admin links for role Employee', () => {
    authAs('Employee');
    renderNavbar();

    expect(screen.getByRole('link', { name: /המשמרות שלי/ })).toHaveAttribute('href', '/employee/shifts');
    expect(screen.getByRole('link', { name: /הזנת זמינות/ })).toHaveAttribute('href', '/employee/availability');
    expect(screen.getByRole('link', { name: /משמרות פתוחות/ })).toHaveAttribute('href', '/employee/recommendations');
    expect(screen.getByRole('link', { name: /הפרופיל שלי/ })).toHaveAttribute('href', '/employee/profile');

    expect(screen.queryByText('לוח בקרה')).not.toBeInTheDocument();
    expect(screen.queryByText('שיבוץ משמרות')).not.toBeInTheDocument();
    expect(screen.queryByText('ניהול צוות')).not.toBeInTheDocument();

    expect(screen.getByRole('button', { name: /התנתק/ })).toBeInTheDocument();
    expect(screen.queryByText('כניסת צוות')).not.toBeInTheDocument();
  });

  it('shows both admin and employee links for role Admin', () => {
    authAs('Admin');
    renderNavbar();

    expect(screen.getByRole('link', { name: /לוח בקרה/ })).toHaveAttribute('href', '/admin/dashboard');
    expect(screen.getByRole('link', { name: /שיבוץ משמרות/ })).toHaveAttribute('href', '/admin/assign');
    expect(screen.getByRole('link', { name: /ניהול שירותים/ })).toHaveAttribute('href', '/admin/services');
    expect(screen.getByRole('link', { name: /ניהול צוות/ })).toHaveAttribute('href', '/admin/team');
    expect(screen.getByRole('link', { name: /המשמרות שלי/ })).toBeInTheDocument();
  });

  it('signs out via AuthContext and navigates to /login', async () => {
    authAs('Employee');
    renderNavbar();

    fireEvent.click(screen.getByRole('button', { name: /התנתק/ }));

    await waitFor(() => {
      expect(signOut).toHaveBeenCalled();
    });
    expect(mockNavigate).toHaveBeenCalledWith('/login');
  });

  it('toggles the mobile menu open and closed', () => {
    authAs(null);
    renderNavbar();

    const menuList = document.querySelector('.nav-menu');
    const menuToggle = document.querySelector('.menu-icon');
    expect(menuList).not.toHaveClass('active');
    expect(menuToggle).toHaveAttribute('aria-expanded', 'false');
    expect(menuToggle).toHaveAttribute('aria-label', 'פתח תפריט');

    fireEvent.click(menuToggle);
    expect(menuList).toHaveClass('active');
    expect(menuToggle).toHaveAttribute('aria-expanded', 'true');
    expect(menuToggle).toHaveAttribute('aria-label', 'סגור תפריט');
    expect(document.querySelector('.nav-backdrop')).toBeInTheDocument();

    fireEvent.click(menuToggle);
    expect(menuList).not.toHaveClass('active');
    expect(document.querySelector('.nav-backdrop')).not.toBeInTheDocument();
  });

  it('closes the mobile menu when a navigation link is clicked', () => {
    authAs(null);
    renderNavbar();

    fireEvent.click(document.querySelector('.menu-icon'));
    const menuList = document.querySelector('.nav-menu');
    expect(menuList).toHaveClass('active');

    fireEvent.click(screen.getByRole('link', { name: /הזמנת תור/ }));
    expect(menuList).not.toHaveClass('active');
  });

  it('closes the mobile menu when the backdrop is clicked', () => {
    authAs(null);
    renderNavbar();

    fireEvent.click(document.querySelector('.menu-icon'));
    expect(document.querySelector('.nav-menu')).toHaveClass('active');

    fireEvent.click(document.querySelector('.nav-backdrop'));
    expect(document.querySelector('.nav-menu')).not.toHaveClass('active');
  });
});
