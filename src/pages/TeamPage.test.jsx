import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createOperatorStaff,
  listOperatorServices,
  listOperatorStaff,
  replaceOperatorProviderSkills,
  setOperatorStaffActive,
  updateOperatorStaffRole,
} from '../lib/api';
import TeamPage from './TeamPage';

vi.mock('../lib/api', () => ({
  createOperatorStaff: vi.fn(),
  listOperatorServices: vi.fn(),
  listOperatorStaff: vi.fn(),
  replaceOperatorProviderSkills: vi.fn(),
  setOperatorStaffActive: vi.fn(),
  updateOperatorStaffRole: vi.fn(),
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    session: {
      user: { id: 'owner-1' },
      business: { id: 'business-1', role: 'Owner' },
    },
  }),
}));

const owner = {
  userId: 'owner-1',
  email: 'owner@example.test',
  firstName: 'דנה',
  lastName: 'לוי',
  phoneE164: null,
  role: 'Owner',
  disabledAt: null,
  mustChangePassword: false,
  serviceIds: [],
};
const provider = {
  userId: 'provider-1',
  email: 'provider@example.test',
  firstName: 'יוסי',
  lastName: 'כהן',
  phoneE164: '+972501111111',
  role: 'Provider',
  disabledAt: null,
  mustChangePassword: true,
  serviceIds: ['service-1'],
};
const services = [
  { id: 'service-1', name: 'תספורת', active: true },
  { id: 'service-2', name: 'צבע', active: true },
];

function employeeCard(name) {
  return screen.getByRole('heading', { name }).closest('.team-card');
}

describe('TeamPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listOperatorStaff.mockResolvedValue([owner, provider]);
    listOperatorServices.mockResolvedValue(services);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('renders staff state and current atomic skill selections', async () => {
    render(<TeamPage />);
    await screen.findByRole('heading', { name: 'יוסי כהן' });
    const card = employeeCard('יוסי כהן');
    expect(within(card).getByText('ממתין/ה להחלפת סיסמה')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'תספורת' })).toHaveClass('active');
    expect(within(card).getByRole('button', { name: 'צבע' })).not.toHaveClass('active');
  });

  it('creates a local account with a temporary password', async () => {
    const created = { ...provider, userId: 'provider-2', email: 'new@example.test' };
    createOperatorStaff.mockResolvedValue(created);
    render(<TeamPage />);
    await screen.findByRole('heading', { name: 'יוסי כהן' });

    fireEvent.change(screen.getByLabelText('אימייל לעובד'), {
      target: { value: ' NEW@example.test ' },
    });
    fireEvent.change(screen.getByLabelText('שם פרטי לעובד'), { target: { value: 'נועה' } });
    fireEvent.change(screen.getByLabelText('שם משפחה לעובד'), { target: { value: 'חן' } });
    fireEvent.change(screen.getByLabelText('סיסמה זמנית'), {
      target: { value: 'temporary-secure-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'יצירת חשבון' }));

    await waitFor(() =>
      expect(createOperatorStaff).toHaveBeenCalledWith({
        email: 'new@example.test',
        firstName: 'נועה',
        lastName: 'חן',
        role: 'Provider',
        temporaryPassword: 'temporary-secure-password',
      })
    );
    expect(await screen.findByText(/החשבון נוצר/)).toBeInTheDocument();
  });

  it('replaces the full skill set in one request', async () => {
    replaceOperatorProviderSkills.mockResolvedValue({
      ...provider,
      serviceIds: ['service-1', 'service-2'],
    });
    render(<TeamPage />);
    await screen.findByRole('heading', { name: 'יוסי כהן' });
    const card = employeeCard('יוסי כהן');
    fireEvent.click(within(card).getByRole('button', { name: 'צבע' }));

    await waitFor(() =>
      expect(replaceOperatorProviderSkills).toHaveBeenCalledWith('provider-1', [
        'service-1',
        'service-2',
      ])
    );
    expect(within(card).getByRole('button', { name: 'צבע' })).toHaveClass('active');
  });

  it('changes roles and deactivates through protected operator endpoints', async () => {
    updateOperatorStaffRole.mockResolvedValue({ ...provider, role: 'Manager' });
    setOperatorStaffActive.mockResolvedValue({
      ...provider,
      role: 'Manager',
      disabledAt: '2026-09-06T00:00:00.000Z',
    });
    render(<TeamPage />);
    await screen.findByRole('heading', { name: 'יוסי כהן' });

    fireEvent.change(screen.getByLabelText('תפקיד של יוסי'), {
      target: { value: 'Manager' },
    });
    await waitFor(() =>
      expect(updateOperatorStaffRole).toHaveBeenCalledWith('provider-1', 'Manager')
    );
    fireEvent.click(screen.getByLabelText('השבתת יוסי כהן'));
    await waitFor(() =>
      expect(setOperatorStaffActive).toHaveBeenCalledWith('provider-1', false)
    );
    expect(await screen.findByText('מושבת/ת')).toBeInTheDocument();
  });

  it('shows the reassignment requirement returned by the backend', async () => {
    setOperatorStaffActive.mockRejectedValue({ code: 'STAFF_REASSIGNMENT_REQUIRED' });
    render(<TeamPage />);
    await screen.findByRole('heading', { name: 'יוסי כהן' });
    fireEvent.click(screen.getByLabelText('השבתת יוסי כהן'));
    expect(
      await screen.findByText('יש להעביר תחילה את התורים העתידיים של העובד/ת.')
    ).toBeInTheDocument();
  });
});
