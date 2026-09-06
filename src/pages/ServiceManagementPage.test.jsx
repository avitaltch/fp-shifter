import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ServiceManagementPage from './ServiceManagementPage';
import { listOperatorServices, createOperatorService, updateOperatorService, deactivateOperatorService } from '../lib/api';

vi.mock('../lib/api', () => ({
  listOperatorServices: vi.fn(),
  createOperatorService: vi.fn(),
  updateOperatorService: vi.fn(),
  deactivateOperatorService: vi.fn(),
}));

const mockServices = [
  { id: 'svc-1', name: 'תספורת', description: 'תספורת קלאסית', priceMinor: 15000, durationMinutes: 45, currency: 'ILS', active: true },
];

async function openAddForm() {
  fireEvent.click(await screen.findByRole('button', { name: /הוסף שירות חדש/ }));
}

function fillForm({ name, price, duration }) {
  if (name !== undefined) {
    fireEvent.change(screen.getByLabelText(/שם השירות/), { target: { value: name } });
  }
  if (price !== undefined) {
    fireEvent.change(screen.getByLabelText(/מחיר בסיסי/), { target: { value: price } });
  }
  if (duration !== undefined) {
    fireEvent.change(screen.getByLabelText(/משך זמן בדקות/), { target: { value: duration } });
  }
}

const clickSave = () => fireEvent.click(screen.getByRole('button', { name: /שמור/ }));

describe('ServiceManagementPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listOperatorServices.mockResolvedValue(mockServices);
  });

  it('lists services from the api layer', async () => {
    render(<ServiceManagementPage />);

    expect(await screen.findByText('תספורת')).toBeInTheDocument();
    expect(screen.getByText('₪150')).toBeInTheDocument();
    expect(screen.getByText("45 דק'")).toBeInTheDocument();
    expect(listOperatorServices).toHaveBeenCalledTimes(1);
  });

  it('shows an empty state when there are no services', async () => {
    listOperatorServices.mockResolvedValue([]);
    render(<ServiceManagementPage />);

    expect(
      await screen.findByText('לא נמצאו שירותים. הוסף את השירות הראשון שלך!')
    ).toBeInTheDocument();
  });

  it('requires a service name', async () => {
    render(<ServiceManagementPage />);
    await openAddForm();

    fillForm({ name: '   ', price: '100', duration: '30' });
    clickSave();

    expect(await screen.findByText('נא להזין שם שירות.')).toBeInTheDocument();
    expect(createOperatorService).not.toHaveBeenCalled();
  });

  it('rejects a negative or non-numeric price', async () => {
    render(<ServiceManagementPage />);
    await openAddForm();

    fillForm({ name: 'פן', price: '-5', duration: '30' });
    clickSave();
    expect(await screen.findByText('המחיר חייב להיות מספר חיובי.')).toBeInTheDocument();

    fillForm({ price: '' });
    clickSave();
    expect(await screen.findByText('המחיר חייב להיות מספר חיובי.')).toBeInTheDocument();

    expect(createOperatorService).not.toHaveBeenCalled();
  });

  it('rejects a non-positive duration', async () => {
    render(<ServiceManagementPage />);
    await openAddForm();

    fillForm({ name: 'פן', price: '80', duration: '0' });
    clickSave();

    expect(
      await screen.findByText('משך הטיפול חייב להיות מספר דקות חיובי.')
    ).toBeInTheDocument();
    expect(createOperatorService).not.toHaveBeenCalled();
  });

  it('creates a service with parsed numeric fields and refreshes the list', async () => {
    createOperatorService.mockResolvedValue({ id: 'svc-2' });
    render(<ServiceManagementPage />);
    await openAddForm();

    fillForm({ name: '  פן  ', price: '80.5', duration: '30' });
    clickSave();

    await waitFor(() => {
      expect(createOperatorService).toHaveBeenCalledWith({
        name: 'פן',
        description: '',
        priceMinor: 8050,
        durationMinutes: 30,
        currency: 'ILS',
      });
    });
    // List is refetched after a successful save
    expect(listOperatorServices).toHaveBeenCalledTimes(2);
  });

  it('maps the duplicate-name constraint to a Hebrew message', async () => {
    createOperatorService.mockRejectedValue({ code: 'SERVICE_NAME_EXISTS' });
    render(<ServiceManagementPage />);
    await openAddForm();

    fillForm({ name: 'תספורת', price: '150', duration: '45' });
    clickSave();

    expect(await screen.findByText('כבר קיים שירות בשם זה.')).toBeInTheDocument();
  });

  it('edits an existing service through updateOperatorService', async () => {
    updateOperatorService.mockResolvedValue({ id: 'svc-1' });
    render(<ServiceManagementPage />);
    await screen.findByText('תספורת');

    fireEvent.click(screen.getByTitle('ערוך'));
    expect(screen.getByText('עריכת שירות')).toBeInTheDocument();
    // Form is pre-filled from the service
    expect(screen.getByLabelText(/שם השירות/)).toHaveValue('תספורת');

    fillForm({ price: '175' });
    clickSave();

    await waitFor(() => {
      expect(updateOperatorService).toHaveBeenCalledWith('svc-1', {
        name: 'תספורת',
        description: 'תספורת קלאסית',
        priceMinor: 17500,
        durationMinutes: 45,
        currency: 'ILS',
      });
    });
  });

  it('soft-deletes a service after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    deactivateOperatorService.mockResolvedValue(mockServices[0]);
    render(<ServiceManagementPage />);
    await screen.findByText('תספורת');

    fireEvent.click(screen.getByTitle('מחק'));

    expect(window.confirm).toHaveBeenCalled();
    await waitFor(() => {
      expect(deactivateOperatorService).toHaveBeenCalledWith('svc-1');
    });
  });

  it('does not delete when the confirmation is declined', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<ServiceManagementPage />);
    await screen.findByText('תספורת');

    fireEvent.click(screen.getByTitle('מחק'));

    expect(deactivateOperatorService).not.toHaveBeenCalled();
  });

  it('shows an error message when loading fails', async () => {
    listOperatorServices.mockRejectedValue(new Error('network'));
    render(<ServiceManagementPage />);

    expect(await screen.findByText('שגיאה בטעינת השירותים.')).toBeInTheDocument();
  });
});
