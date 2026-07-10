import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from './supabase';
import {
  claimShift,
  claimEligibility,
  assignShift,
  updateShiftStatus,
  updateService,
  cancelAppointment,
  eligibleEmployeesFor,
  listServices,
  createService,
  deleteService,
  getAvailableSlots,
  bookAppointment,
  listMyAvailability,
  addAvailability,
  deleteAvailability,
  listMyShifts,
  listOpenShifts,
  getClaimableShifts,
  getAssignmentData,
  getDashboardData,
  listStaffWithSkills,
  addSkill,
  removeSkill,
  setUserRole,
  updateStaffProfile,
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

// Route supabase.from(table) to per-table queries. An array value acts as a
// queue for tables queried more than once in a single call.
function fromByTable(map) {
  supabase.from.mockImplementation((table) => {
    const entry = map[table];
    return Array.isArray(entry) ? entry.shift() : entry;
  });
}

describe('claimShift', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('claims via the claim_shift RPC (server enforces skills/availability/races)', async () => {
    const result = { item_id: 'item-1', user_id: 'user-1' };
    supabase.rpc.mockResolvedValue({ data: result, error: null });

    await expect(claimShift('item-1')).resolves.toEqual(result);
    expect(supabase.rpc).toHaveBeenCalledWith('claim_shift', { p_item_id: 'item-1' });
  });

  it('propagates RPC errors (SHIFT_TAKEN on a lost race)', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: new Error('SHIFT_TAKEN') });

    await expect(claimShift('item-1')).rejects.toThrow('SHIFT_TAKEN');
  });

  it('propagates NOT_QUALIFIED from the server-side skill check', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: new Error('NOT_QUALIFIED') });

    await expect(claimShift('item-1')).rejects.toThrow('NOT_QUALIFIED');
  });
});

describe('claimEligibility (pure)', () => {
  const item = {
    service_type_id: 'svc-1',
    work_date: '2026-07-20',
    start_time: '10:00:00',
    end_time: '11:00:00',
  };
  const base = {
    skills: [{ user_id: 'me', service_type_id: 'svc-1' }],
    availabilities: [
      { user_id: 'me', available_date: '2026-07-20', start_time: '08:00:00', end_time: '16:00:00' },
    ],
    assignments: [],
  };

  it('is eligible when qualified, available and conflict-free', () => {
    expect(claimEligibility(item, 'me', base)).toEqual({ eligible: true, reason: null });
  });

  it('returns NOT_QUALIFIED without the matching skill', () => {
    expect(claimEligibility(item, 'me', { ...base, skills: [] })).toEqual({
      eligible: false,
      reason: 'NOT_QUALIFIED',
    });
  });

  it('returns NOT_AVAILABLE when no window covers the span', () => {
    const data = {
      ...base,
      availabilities: [
        { user_id: 'me', available_date: '2026-07-20', start_time: '10:30:00', end_time: '16:00:00' },
      ],
    };
    expect(claimEligibility(item, 'me', data)).toEqual({
      eligible: false,
      reason: 'NOT_AVAILABLE',
    });
  });

  it('returns SHIFT_CONFLICT on an overlapping existing assignment', () => {
    const data = {
      ...base,
      assignments: [
        { user_id: 'me', work_date: '2026-07-20', start_time: '10:30:00', end_time: '11:30:00' },
      ],
    };
    expect(claimEligibility(item, 'me', data)).toEqual({
      eligible: false,
      reason: 'SHIFT_CONFLICT',
    });
  });

  it('does not treat back-to-back assignments as conflicts', () => {
    const data = {
      ...base,
      assignments: [
        { user_id: 'me', work_date: '2026-07-20', start_time: '09:00:00', end_time: '10:00:00' },
      ],
    };
    expect(claimEligibility(item, 'me', data).eligible).toBe(true);
  });
});

describe('updateService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('only sends allowlisted fields (no deleted_at smuggling)', async () => {
    const row = { id: 'svc-1', name: 'צבע' };
    const query = createQuery({ data: row, error: null });
    supabase.from.mockReturnValue(query);

    await updateService('svc-1', {
      name: 'צבע',
      base_price: 200,
      deleted_at: '2026-01-01',
      id: 'evil',
    });

    expect(query.update).toHaveBeenCalledWith({ name: 'צבע', base_price: 200 });
  });
});

describe('cancelAppointment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cancels via the cancel_appointment RPC', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: null });

    await cancelAppointment('apt-1');
    expect(supabase.rpc).toHaveBeenCalledWith('cancel_appointment', {
      p_appointment_id: 'apt-1',
    });
  });

  it('propagates RPC errors', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: new Error('FORBIDDEN') });

    await expect(cancelAppointment('apt-1')).rejects.toThrow('FORBIDDEN');
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

describe('services api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('listServices filters soft-deleted rows and orders by name', async () => {
    const rows = [{ id: 'svc-1', name: 'תספורת' }];
    const query = createQuery({ data: rows, error: null });
    supabase.from.mockReturnValue(query);

    await expect(listServices()).resolves.toEqual(rows);
    expect(supabase.from).toHaveBeenCalledWith('service_types');
    expect(query.is).toHaveBeenCalledWith('deleted_at', null);
    expect(query.order).toHaveBeenCalledWith('name');
  });

  it('createService inserts the row and returns it', async () => {
    const row = { id: 'svc-1', name: 'צבע' };
    const query = createQuery({ data: row, error: null });
    supabase.from.mockReturnValue(query);

    await expect(
      createService({ name: 'צבע', description: '', base_price: 200, default_duration: 60 })
    ).resolves.toEqual(row);
    expect(query.insert).toHaveBeenCalledWith([
      { name: 'צבע', description: '', base_price: 200, default_duration: 60 },
    ]);
  });

  it('deleteService soft-deletes by setting deleted_at', async () => {
    const query = createQuery({ data: [{ id: 'svc-1' }], error: null });
    supabase.from.mockReturnValue(query);

    await deleteService('svc-1');
    const [payload] = query.update.mock.calls[0];
    expect(payload.deleted_at).toEqual(expect.any(String));
    expect(query.eq).toHaveBeenCalledWith('id', 'svc-1');
  });
});

describe('booking api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getAvailableSlots calls the RPC with date + services', async () => {
    supabase.rpc.mockResolvedValue({ data: ['10:00:00'], error: null });

    await expect(getAvailableSlots('2026-07-20', ['svc-1'])).resolves.toEqual(['10:00:00']);
    expect(supabase.rpc).toHaveBeenCalledWith('get_available_slots', {
      p_date: '2026-07-20',
      p_service_ids: ['svc-1'],
    });
  });

  it('bookAppointment maps camelCase fields to RPC params (empty email/notes -> null)', async () => {
    supabase.rpc.mockResolvedValue({ data: { appointment_id: 'apt-1' }, error: null });

    await bookAppointment({
      firstName: 'דנה',
      lastName: 'לוי',
      phone: '050-1234567',
      email: '',
      visitDate: '2026-07-20',
      startTime: '10:00:00',
      serviceIds: ['svc-1'],
      notes: '',
    });

    expect(supabase.rpc).toHaveBeenCalledWith('book_appointment', {
      p_first_name: 'דנה',
      p_last_name: 'לוי',
      p_phone: '050-1234567',
      p_email: null,
      p_visit_date: '2026-07-20',
      p_start_time: '10:00:00',
      p_service_ids: ['svc-1'],
      p_notes: null,
    });
  });

  it('bookAppointment propagates RPC errors (e.g. SLOT_TAKEN)', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: new Error('SLOT_TAKEN') });

    await expect(
      bookAppointment({
        firstName: 'א',
        lastName: 'ב',
        phone: '050',
        visitDate: '2026-07-20',
        startTime: '10:00:00',
        serviceIds: ['svc-1'],
      })
    ).rejects.toThrow('SLOT_TAKEN');
  });
});

describe('availability api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('listMyAvailability scopes to the user from a date onwards', async () => {
    const rows = [{ id: 'a1' }];
    const query = createQuery({ data: rows, error: null });
    supabase.from.mockReturnValue(query);

    await expect(listMyAvailability('user-1', '2026-07-20')).resolves.toEqual(rows);
    expect(query.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(query.gte).toHaveBeenCalledWith('available_date', '2026-07-20');
  });

  it('addAvailability inserts the mapped row', async () => {
    const row = { id: 'a2' };
    const query = createQuery({ data: row, error: null });
    supabase.from.mockReturnValue(query);

    await expect(
      addAvailability({ userId: 'user-1', date: '2026-07-20', startTime: '08:00', endTime: '16:00' })
    ).resolves.toEqual(row);
    expect(query.insert).toHaveBeenCalledWith([
      {
        user_id: 'user-1',
        available_date: '2026-07-20',
        start_time: '08:00',
        end_time: '16:00',
        notes: null,
      },
    ]);
  });

  it('deleteAvailability deletes by id', async () => {
    const query = createQuery({ data: [], error: null });
    supabase.from.mockReturnValue(query);

    await deleteAvailability('a1');
    expect(query.delete).toHaveBeenCalled();
    expect(query.eq).toHaveBeenCalledWith('id', 'a1');
  });
});

describe('shift list api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('listMyShifts scopes to the user, live rows, from a date onwards', async () => {
    const rows = [{ id: 'item-1' }];
    const query = createQuery({ data: rows, error: null });
    supabase.from.mockReturnValue(query);

    await expect(listMyShifts('user-1', '2026-07-20')).resolves.toEqual(rows);
    expect(query.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(query.is).toHaveBeenCalledWith('deleted_at', null);
    expect(query.gte).toHaveBeenCalledWith('work_date', '2026-07-20');
  });

  it('listOpenShifts returns only unassigned live rows', async () => {
    const rows = [{ id: 'item-2' }];
    const query = createQuery({ data: rows, error: null });
    supabase.from.mockReturnValue(query);

    await expect(listOpenShifts('2026-07-20')).resolves.toEqual(rows);
    expect(query.is).toHaveBeenCalledWith('user_id', null);
    expect(query.is).toHaveBeenCalledWith('deleted_at', null);
  });

  it('getClaimableShifts annotates open shifts with eligibility for the user', async () => {
    const openItem = {
      id: 'item-1',
      service_type_id: 'svc-1',
      work_date: '2026-07-20',
      start_time: '10:00:00',
      end_time: '11:00:00',
    };
    fromByTable({
      appointment_items: [
        createQuery({ data: [openItem], error: null }), // open shifts
        createQuery({ data: [], error: null }), // my assignments
      ],
      employee_skills: createQuery({
        data: [{ user_id: 'me', service_type_id: 'svc-1' }],
        error: null,
      }),
      availabilities: createQuery({
        data: [
          { user_id: 'me', available_date: '2026-07-20', start_time: '08:00:00', end_time: '16:00:00' },
        ],
        error: null,
      }),
    });

    const result = await getClaimableShifts('me', '2026-07-20');
    expect(result).toEqual([{ ...openItem, eligible: true, reason: null }]);
  });

  it('getClaimableShifts marks unqualified shifts with a reason', async () => {
    const openItem = {
      id: 'item-1',
      service_type_id: 'svc-1',
      work_date: '2026-07-20',
      start_time: '10:00:00',
      end_time: '11:00:00',
    };
    fromByTable({
      appointment_items: [
        createQuery({ data: [openItem], error: null }),
        createQuery({ data: [], error: null }),
      ],
      employee_skills: createQuery({ data: [], error: null }),
      availabilities: createQuery({ data: [], error: null }),
    });

    const result = await getClaimableShifts('me', '2026-07-20');
    expect(result[0]).toMatchObject({ eligible: false, reason: 'NOT_QUALIFIED' });
  });
});

describe('getAssignmentData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches all datasets in parallel and returns them keyed', async () => {
    const unassigned = [{ id: 'item-1' }];
    const staff = [{ id: 'emp-1' }];
    const skills = [{ user_id: 'emp-1', service_type_id: 'svc-1' }];
    const availabilities = [{ id: 'a1' }];
    const assignments = [{ id: 'item-2', user_id: 'emp-1' }];
    fromByTable({
      appointment_items: [
        createQuery({ data: unassigned, error: null }),
        createQuery({ data: assignments, error: null }),
      ],
      users: createQuery({ data: staff, error: null }),
      employee_skills: createQuery({ data: skills, error: null }),
      availabilities: createQuery({ data: availabilities, error: null }),
    });

    await expect(getAssignmentData('2026-07-20')).resolves.toEqual({
      unassigned,
      staff,
      skills,
      availabilities,
      assignments,
    });
  });
});

describe('getDashboardData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns appointments and the staff count', async () => {
    const appointments = [{ id: 'apt-1' }];
    const aptQuery = createQuery({ data: appointments, error: null });
    const countQuery = createQuery({ count: 4, error: null });
    fromByTable({ appointments: aptQuery, users: countQuery });

    await expect(getDashboardData('2026-07-20', '2026-07-26')).resolves.toEqual({
      appointments,
      staffCount: 4,
    });
    expect(aptQuery.neq).toHaveBeenCalledWith('status', 'Cancelled');
  });

  it('throws when the count query fails', async () => {
    fromByTable({
      appointments: createQuery({ data: [], error: null }),
      users: createQuery({ count: null, error: new Error('boom') }),
    });

    await expect(getDashboardData('2026-07-20', '2026-07-26')).rejects.toThrow('boom');
  });

  it('coalesces a null staff count to 0', async () => {
    fromByTable({
      appointments: createQuery({ data: [], error: null }),
      users: createQuery({ count: null, error: null }),
    });

    await expect(getDashboardData('2026-07-20', '2026-07-26')).resolves.toEqual({
      appointments: [],
      staffCount: 0,
    });
  });
});

describe('team api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('listStaffWithSkills returns staff and skills together', async () => {
    const staff = [{ id: 'emp-1' }];
    const skills = [{ id: 's1', user_id: 'emp-1' }];
    fromByTable({
      users: createQuery({ data: staff, error: null }),
      employee_skills: createQuery({ data: skills, error: null }),
    });

    await expect(listStaffWithSkills()).resolves.toEqual({ staff, skills });
  });

  it('addSkill inserts the pair and returns the created row', async () => {
    const row = { id: 's1', user_id: 'emp-1', service_type_id: 'svc-1' };
    const query = createQuery({ data: row, error: null });
    supabase.from.mockReturnValue(query);

    await expect(addSkill('emp-1', 'svc-1')).resolves.toEqual(row);
    expect(query.insert).toHaveBeenCalledWith([{ user_id: 'emp-1', service_type_id: 'svc-1' }]);
  });

  it('removeSkill deletes by skill id', async () => {
    const query = createQuery({ data: [], error: null });
    supabase.from.mockReturnValue(query);

    await removeSkill('s1');
    expect(query.delete).toHaveBeenCalled();
    expect(query.eq).toHaveBeenCalledWith('id', 's1');
  });

  it('setUserRole goes through the hardened admin RPC', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: null });

    await setUserRole('emp-1', 'Admin');
    expect(supabase.rpc).toHaveBeenCalledWith('admin_set_user_role', {
      p_user_id: 'emp-1',
      p_role: 'Admin',
    });
  });

  it('setUserRole propagates CANNOT_CHANGE_OWN_ROLE', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: new Error('CANNOT_CHANGE_OWN_ROLE') });

    await expect(setUserRole('me', 'Employee')).rejects.toThrow('CANNOT_CHANGE_OWN_ROLE');
  });

  it('updateStaffProfile updates allowlisted name fields', async () => {
    const row = { id: 'emp-1', first_name: 'דנה', last_name: 'לוי' };
    const query = createQuery({ data: row, error: null });
    supabase.from.mockReturnValue(query);

    await expect(
      updateStaffProfile('emp-1', { first_name: ' דנה ', last_name: 'לוי', role: 'Admin' })
    ).resolves.toEqual(row);
    expect(query.update).toHaveBeenCalledWith({ first_name: 'דנה', last_name: 'לוי' });
    expect(query.eq).toHaveBeenCalledWith('id', 'emp-1');
  });

  it('updateStaffProfile rejects empty names', async () => {
    await expect(
      updateStaffProfile('emp-1', { first_name: '  ', last_name: 'לוי' })
    ).rejects.toThrow('INVALID_NAME');
    expect(supabase.from).not.toHaveBeenCalled();
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
