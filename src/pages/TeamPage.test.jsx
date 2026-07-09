import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TeamPage from './TeamPage';
import {
  listStaffWithSkills,
  listServices,
  addSkill,
  removeSkill,
  setUserRole,
} from '../lib/api';

vi.mock('../lib/api', () => ({
  listStaffWithSkills: vi.fn(),
  listServices: vi.fn(),
  addSkill: vi.fn(),
  removeSkill: vi.fn(),
  setUserRole: vi.fn(),
}));

// The logged-in admin is admin-1
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    session: { user: { id: 'admin-1' } },
    profile: { first_name: 'דנה', last_name: 'לוי', role: 'Admin' },
    role: 'Admin',
    loading: false,
    signOut: vi.fn(),
  }),
}));

const mockStaff = [
  { id: 'admin-1', first_name: 'דנה', last_name: 'לוי', role: 'Admin' },
  { id: 'emp-2', first_name: 'יוסי', last_name: 'כהן', role: 'Employee' },
];

const mockSkills = [{ id: 'skill-1', user_id: 'emp-2', service_type_id: 'svc-1' }];

const mockServices = [
  { id: 'svc-1', name: 'תספורת' },
  { id: 'svc-2', name: 'צבע' },
];

const employeeCard = (name) =>
  screen.getByRole('heading', { name }).closest('.team-card');

describe('TeamPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listStaffWithSkills.mockResolvedValue({ staff: mockStaff, skills: mockSkills });
    listServices.mockResolvedValue(mockServices);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('renders the staff with a skill chip per service', async () => {
    render(<TeamPage />);

    expect(await screen.findByRole('heading', { name: 'דנה לוי' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'יוסי כהן' })).toBeInTheDocument();

    const yossiCard = employeeCard('יוסי כהן');
    const activeChip = within(yossiCard).getByRole('button', { name: 'תספורת' });
    const inactiveChip = within(yossiCard).getByRole('button', { name: 'צבע' });
    expect(activeChip).toHaveClass('active');
    expect(inactiveChip).not.toHaveClass('active');
  });

  it('adds a missing skill through the api and activates the chip', async () => {
    addSkill.mockResolvedValue({ id: 'skill-2', user_id: 'emp-2', service_type_id: 'svc-2' });
    render(<TeamPage />);
    await screen.findByRole('heading', { name: 'יוסי כהן' });

    const yossiCard = employeeCard('יוסי כהן');
    fireEvent.click(within(yossiCard).getByRole('button', { name: 'צבע' }));

    await waitFor(() => {
      expect(addSkill).toHaveBeenCalledWith('emp-2', 'svc-2');
    });
    await waitFor(() => {
      expect(within(yossiCard).getByRole('button', { name: 'צבע' })).toHaveClass('active');
    });
    expect(removeSkill).not.toHaveBeenCalled();
  });

  it('removes an existing skill through the api and deactivates the chip', async () => {
    removeSkill.mockResolvedValue([mockSkills[0]]);
    render(<TeamPage />);
    await screen.findByRole('heading', { name: 'יוסי כהן' });

    const yossiCard = employeeCard('יוסי כהן');
    fireEvent.click(within(yossiCard).getByRole('button', { name: 'תספורת' }));

    await waitFor(() => {
      expect(removeSkill).toHaveBeenCalledWith('skill-1');
    });
    await waitFor(() => {
      expect(within(yossiCard).getByRole('button', { name: 'תספורת' })).not.toHaveClass('active');
    });
    expect(addSkill).not.toHaveBeenCalled();
  });

  it('changes another employee role via the api after confirmation', async () => {
    setUserRole.mockResolvedValue(null);
    render(<TeamPage />);
    await screen.findByRole('heading', { name: 'יוסי כהן' });

    fireEvent.change(screen.getByLabelText('תפקיד של יוסי'), {
      target: { value: 'Admin' },
    });

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('יוסי'));
    await waitFor(() => {
      expect(setUserRole).toHaveBeenCalledWith('emp-2', 'Admin');
    });
    expect(await screen.findByText('התפקיד עודכן בהצלחה.')).toBeInTheDocument();
    expect(screen.getByLabelText('תפקיד של יוסי')).toHaveValue('Admin');
  });

  it('does not change the role when the confirmation is declined', async () => {
    window.confirm.mockReturnValue(false);
    render(<TeamPage />);
    await screen.findByRole('heading', { name: 'יוסי כהן' });

    fireEvent.change(screen.getByLabelText('תפקיד של יוסי'), {
      target: { value: 'Admin' },
    });

    expect(setUserRole).not.toHaveBeenCalled();
  });

  it('does not allow admins to change their own role', async () => {
    render(<TeamPage />);
    await screen.findByRole('heading', { name: 'דנה לוי' });

    expect(screen.getByLabelText('תפקיד של דנה')).toBeDisabled();
    expect(screen.getByLabelText('תפקיד של יוסי')).not.toBeDisabled();
  });

  it('shows a friendly error when the role update fails', async () => {
    setUserRole.mockRejectedValue(new Error('FORBIDDEN'));
    render(<TeamPage />);
    await screen.findByRole('heading', { name: 'יוסי כהן' });

    fireEvent.change(screen.getByLabelText('תפקיד של יוסי'), {
      target: { value: 'Admin' },
    });

    expect(
      await screen.findByText('אין לך הרשאה לבצע פעולה זו.')
    ).toBeInTheDocument();
  });

  it('shows an empty state when there is no staff', async () => {
    listStaffWithSkills.mockResolvedValue({ staff: [], skills: [] });
    render(<TeamPage />);

    expect(
      await screen.findByText('אין עדיין חברי צוות. הזמינו עובדים דרך לוח הבקרה של Supabase.')
    ).toBeInTheDocument();
  });

  it('shows an error message when loading fails', async () => {
    listStaffWithSkills.mockRejectedValue(new Error('network'));
    render(<TeamPage />);

    expect(await screen.findByText('שגיאה בטעינת נתוני הצוות.')).toBeInTheDocument();
  });
});
