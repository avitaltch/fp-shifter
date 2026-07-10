import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TeamPage from './TeamPage';
import {
  listStaffWithSkills,
  listServices,
  addSkill,
  removeSkill,
  setUserRole,
  updateStaffProfile,
} from '../lib/api';

vi.mock('../lib/api', () => ({
  listStaffWithSkills: vi.fn(),
  listServices: vi.fn(),
  addSkill: vi.fn(),
  removeSkill: vi.fn(),
  setUserRole: vi.fn(),
  updateStaffProfile: vi.fn(),
}));

const mockRetryProfile = vi.fn();

// The logged-in admin is admin-1
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    session: { user: { id: 'admin-1' } },
    profile: { first_name: 'דנה', last_name: 'לוי', role: 'Admin' },
    role: 'Admin',
    loading: false,
    signOut: vi.fn(),
    retryProfile: mockRetryProfile,
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

  it('shows a friendly error and keeps the chip inactive when adding a skill fails', async () => {
    addSkill.mockRejectedValue(new Error('network'));
    render(<TeamPage />);
    await screen.findByRole('heading', { name: 'יוסי כהן' });
    const card = employeeCard('יוסי כהן');

    fireEvent.click(within(card).getByRole('button', { name: 'צבע' }));

    expect(
      await screen.findByText('שגיאה בעדכון המיומנות.')
    ).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'צבע' })).not.toHaveClass('active');
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

  it('lets an admin edit another employee name', async () => {
    updateStaffProfile.mockResolvedValue({
      id: 'emp-2',
      first_name: 'יוסף',
      last_name: 'כהן',
    });
    render(<TeamPage />);
    await screen.findByRole('heading', { name: 'יוסי כהן' });

    fireEvent.click(screen.getByLabelText('ערוך שם של יוסי'));
    fireEvent.change(screen.getByLabelText('שם פרטי של יוסי'), {
      target: { value: 'יוסף' },
    });
    fireEvent.click(screen.getByLabelText('שמור שם'));

    await waitFor(() => {
      expect(updateStaffProfile).toHaveBeenCalledWith('emp-2', {
        first_name: 'יוסף',
        last_name: 'כהן',
      });
    });
    expect(await screen.findByText('השם עודכן בהצלחה.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'יוסף כהן' })).toBeInTheDocument();
    expect(mockRetryProfile).not.toHaveBeenCalled();
  });

  it('refreshes the auth profile when the admin renames themselves', async () => {
    updateStaffProfile.mockResolvedValue({
      id: 'admin-1',
      first_name: 'דנית',
      last_name: 'לוי',
    });
    render(<TeamPage />);
    await screen.findByRole('heading', { name: 'דנה לוי' });

    fireEvent.click(screen.getByLabelText('ערוך שם של דנה'));
    fireEvent.change(screen.getByLabelText('שם פרטי של דנה'), {
      target: { value: 'דנית' },
    });
    fireEvent.click(screen.getByLabelText('שמור שם'));

    await waitFor(() => {
      expect(updateStaffProfile).toHaveBeenCalledWith('admin-1', {
        first_name: 'דנית',
        last_name: 'לוי',
      });
    });
    expect(mockRetryProfile).toHaveBeenCalled();
  });

  it('blocks saving an empty name without calling the api', async () => {
    render(<TeamPage />);
    await screen.findByRole('heading', { name: 'יוסי כהן' });

    fireEvent.click(screen.getByLabelText('ערוך שם של יוסי'));
    fireEvent.change(screen.getByLabelText('שם פרטי של יוסי'), {
      target: { value: '   ' },
    });
    fireEvent.click(screen.getByLabelText('שמור שם'));

    expect(await screen.findByText('נא להזין שם פרטי ושם משפחה.')).toBeInTheDocument();
    expect(updateStaffProfile).not.toHaveBeenCalled();
  });
});
