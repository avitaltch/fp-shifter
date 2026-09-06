import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BookingEntryPage from './BookingEntryPage';

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => navigate,
}));

describe('BookingEntryPage', () => {
  beforeEach(() => navigate.mockClear());

  it('opens a normalized tenant-specific booking URL', () => {
    render(<MemoryRouter><BookingEntryPage /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('קוד העסק'), {
      target: { value: ' Happy-Pets-Demo ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'המשך להזמנה' }));
    expect(navigate).toHaveBeenCalledWith('/book/happy-pets-demo');
  });

  it('rejects malformed tenant codes', () => {
    render(<MemoryRouter><BookingEntryPage /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('קוד העסק'), { target: { value: '../other' } });
    fireEvent.click(screen.getByRole('button', { name: 'המשך להזמנה' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });
});
