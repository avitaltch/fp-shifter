import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from '../supabase';
import {
  customerGetAppointment,
  customerCancelAppointment,
} from './booking';

vi.mock('../supabase', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}));

describe('customer booking api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('customerGetAppointment calls the RPC with id + phone', async () => {
    const data = {
      appointment_id: 'apt-1',
      visit_date: '2026-07-20',
      status: 'Confirmed',
    };
    supabase.rpc.mockResolvedValue({ data, error: null });

    await expect(customerGetAppointment('apt-1', '050-1234567')).resolves.toEqual(data);
    expect(supabase.rpc).toHaveBeenCalledWith('customer_get_appointment', {
      p_appointment_id: 'apt-1',
      p_phone: '050-1234567',
    });
  });

  it('customerGetAppointment propagates APPOINTMENT_NOT_FOUND', async () => {
    supabase.rpc.mockResolvedValue({
      data: null,
      error: new Error('APPOINTMENT_NOT_FOUND'),
    });

    await expect(customerGetAppointment('bad', '050')).rejects.toThrow(
      'APPOINTMENT_NOT_FOUND'
    );
  });

  it('customerCancelAppointment calls the RPC with id + phone', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: null });

    await expect(customerCancelAppointment('apt-1', '050-1234567')).resolves.toBeNull();
    expect(supabase.rpc).toHaveBeenCalledWith('customer_cancel_appointment', {
      p_appointment_id: 'apt-1',
      p_phone: '050-1234567',
    });
  });

  it('customerCancelAppointment propagates CANCEL_TOO_LATE', async () => {
    supabase.rpc.mockResolvedValue({
      data: null,
      error: new Error('CANCEL_TOO_LATE'),
    });

    await expect(customerCancelAppointment('apt-1', '050')).rejects.toThrow(
      'CANCEL_TOO_LATE'
    );
  });

  it('customerCancelAppointment propagates ALREADY_CANCELLED', async () => {
    supabase.rpc.mockResolvedValue({
      data: null,
      error: new Error('ALREADY_CANCELLED'),
    });

    await expect(customerCancelAppointment('apt-1', '050')).rejects.toThrow(
      'ALREADY_CANCELLED'
    );
  });
});
