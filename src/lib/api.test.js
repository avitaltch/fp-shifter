import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from './supabase';
import {
  claimShift,
  assignShift,
  updateShiftStatus,
  eligibleEmployeesFor,
} from './api';

vi.mock('./supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

// Chainable query mock: every builder method returns the query itself, and
// awaiting the query resolves with the configured result (like supabase-js).
function createQuery(result) {
  const query = {};
  const methods = [
    'select', 'insert', 'update', 'delete',
    'eq', 'neq', 'is', 'not', 'gte', 'lte', 'order', 'single',
  ];
  for (const m of methods) {
    query[m] = vi.fn(() => query);
  }
  query.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return query;
}

describe('claimShift', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws SHIFT_TAKEN when the guarded update matches 0 rows', async () => {
    const query = createQuery({ data: [], error: null });
    supabase.from.mockReturnValue(query);

    await expect(claimShift('item-1', 'user-1')).rejects.toThrow('SHIFT_TAKEN');
  });

  it('throws SHIFT_TAKEN when rows are null', async () => {
    const query = createQuery({ data: null, error: null });
    supabase.from.mockReturnValue(query);

    await expect(claimShift('item-1', 'user-1')).rejects.toThrow('SHIFT_TAKEN');
  });

  it('returns the claimed row and guards on user_id being null', async () => {
    const row = { id: 'item-1', user_id: 'user-1' };
    const query = createQuery({ data: [row], error: null });
    supabase.from.mockReturnValue(query);

    await expect(claimShift('item-1', 'user-1')).resolves.toEqual(row);

    expect(supabase.from).toHaveBeenCalledWith('appointment_items');
    expect(query.update).toHaveBeenCalledWith({ user_id: 'user-1' });
    expect(query.eq).toHaveBeenCalledWith('id', 'item-1');
    // The race guard: only rows that are still unassigned may be updated
    expect(query.is).toHaveBeenCalledWith('user_id', null);
    expect(query.select).toHaveBeenCalled();
  });

  it('propagates supabase errors', async () => {
    const query = createQuery({ data: null, error: new Error('boom') });
    supabase.from.mockReturnValue(query);

    await expect(claimShift('item-1', 'user-1')).rejects.toThrow('boom');
  });
});

describe('assignShift', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws SHIFT_TAKEN when a concurrent claim emptied the match', async () => {
    const query = createQuery({ data: [], error: null });
    supabase.from.mockReturnValue(query);

    await expect(assignShift('item-9', 'emp-2')).rejects.toThrow('SHIFT_TAKEN');
    expect(query.is).toHaveBeenCalledWith('user_id', null);
  });

  it('returns the assigned row on success', async () => {
    const row = { id: 'item-9', user_id: 'emp-2' };
    const query = createQuery({ data: [row], error: null });
    supabase.from.mockReturnValue(query);

    await expect(assignShift('item-9', 'emp-2')).resolves.toEqual(row);
    expect(query.update).toHaveBeenCalledWith({ user_id: 'emp-2' });
    expect(query.eq).toHaveBeenCalledWith('id', 'item-9');
  });
});

describe('updateShiftStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws SHIFT_NOT_YOURS when no row matches the item + owner', async () => {
    const query = createQuery({ data: [], error: null });
    supabase.from.mockReturnValue(query);

    await expect(updateShiftStatus('item-1', 'user-1', 'Done')).rejects.toThrow(
      'SHIFT_NOT_YOURS'
    );
  });

  it('updates status scoped to the owning user and returns the row', async () => {
    const row = { id: 'item-1', user_id: 'user-1', status: 'In_Progress' };
    const query = createQuery({ data: [row], error: null });
    supabase.from.mockReturnValue(query);

    await expect(
      updateShiftStatus('item-1', 'user-1', 'In_Progress')
    ).resolves.toEqual(row);

    expect(query.update).toHaveBeenCalledWith({ status: 'In_Progress' });
    expect(query.eq).toHaveBeenCalledWith('id', 'item-1');
    // Ownership guard: another user's shift must match 0 rows
    expect(query.eq).toHaveBeenCalledWith('user_id', 'user-1');
  });
});

describe('eligibleEmployeesFor (pure)', () => {
  const item = {
    id: 'item-1',
    service_type_id: 'svc-1',
    work_date: '2026-07-20',
    start_time: '10:00:00',
    end_time: '11:00:00',
  };

  const staff = [
    { id: 'emp-1', first_name: 'דנה', last_name: 'לוי' },
    { id: 'emp-2', first_name: 'יוסי', last_name: 'כהן' },
    { id: 'emp-3', first_name: 'רות', last_name: 'מזרחי' },
  ];

  const baseData = {
    staff,
    skills: [
      { user_id: 'emp-1', service_type_id: 'svc-1' },
      { user_id: 'emp-2', service_type_id: 'svc-1' },
      // emp-3 has a different skill only
      { user_id: 'emp-3', service_type_id: 'svc-2' },
    ],
    availabilities: [
      { user_id: 'emp-1', available_date: '2026-07-20', start_time: '08:00:00', end_time: '16:00:00' },
      { user_id: 'emp-2', available_date: '2026-07-20', start_time: '08:00:00', end_time: '16:00:00' },
      { user_id: 'emp-3', available_date: '2026-07-20', start_time: '08:00:00', end_time: '16:00:00' },
    ],
    assignments: [],
  };

  it('returns skilled, available, conflict-free employees', () => {
    const result = eligibleEmployeesFor(item, baseData);
    expect(result.map((e) => e.id)).toEqual(['emp-1', 'emp-2']);
  });

  it('excludes employees without the required skill', () => {
    const result = eligibleEmployeesFor(item, baseData);
    expect(result.map((e) => e.id)).not.toContain('emp-3');
  });

  it('excludes employees with no availability on the work date', () => {
    const data = {
      ...baseData,
      availabilities: [
        { user_id: 'emp-1', available_date: '2026-07-21', start_time: '08:00:00', end_time: '16:00:00' },
        { user_id: 'emp-2', available_date: '2026-07-20', start_time: '08:00:00', end_time: '16:00:00' },
      ],
    };
    expect(eligibleEmployeesFor(item, data).map((e) => e.id)).toEqual(['emp-2']);
  });

  it('excludes employees whose availability window does not cover the whole span', () => {
    const data = {
      ...baseData,
      availabilities: [
        // Starts too late
        { user_id: 'emp-1', available_date: '2026-07-20', start_time: '10:30:00', end_time: '16:00:00' },
        // Ends too early
        { user_id: 'emp-2', available_date: '2026-07-20', start_time: '08:00:00', end_time: '10:30:00' },
      ],
    };
    expect(eligibleEmployeesFor(item, data)).toEqual([]);
  });

  it('accepts availability that exactly matches the item span', () => {
    const data = {
      ...baseData,
      availabilities: [
        { user_id: 'emp-1', available_date: '2026-07-20', start_time: '10:00:00', end_time: '11:00:00' },
      ],
    };
    expect(eligibleEmployeesFor(item, data).map((e) => e.id)).toEqual(['emp-1']);
  });

  it('excludes employees with an overlapping existing assignment', () => {
    const data = {
      ...baseData,
      assignments: [
        { user_id: 'emp-1', work_date: '2026-07-20', start_time: '10:30:00', end_time: '11:30:00' },
      ],
    };
    expect(eligibleEmployeesFor(item, data).map((e) => e.id)).toEqual(['emp-2']);
  });

  it('does not treat back-to-back assignments as conflicts', () => {
    const data = {
      ...baseData,
      assignments: [
        // Ends exactly when the item starts, and one starting exactly at its end
        { user_id: 'emp-1', work_date: '2026-07-20', start_time: '09:00:00', end_time: '10:00:00' },
        { user_id: 'emp-2', work_date: '2026-07-20', start_time: '11:00:00', end_time: '12:00:00' },
      ],
    };
    expect(eligibleEmployeesFor(item, data).map((e) => e.id)).toEqual(['emp-1', 'emp-2']);
  });

  it('ignores overlapping assignments on a different date', () => {
    const data = {
      ...baseData,
      assignments: [
        { user_id: 'emp-1', work_date: '2026-07-21', start_time: '10:00:00', end_time: '11:00:00' },
      ],
    };
    expect(eligibleEmployeesFor(item, data).map((e) => e.id)).toEqual(['emp-1', 'emp-2']);
  });
});
