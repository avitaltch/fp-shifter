import { supabase } from './supabase';

// All data access lives here so pages stay presentational.
// Every function throws on error; pages catch and render the message.

function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

// ---------- services ----------

export async function listServices() {
  return unwrap(
    await supabase
      .from('service_types')
      .select('*')
      .is('deleted_at', null)
      .order('name')
  );
}

export async function createService({ name, description, base_price, default_duration }) {
  return unwrap(
    await supabase
      .from('service_types')
      .insert([{ name, description, base_price, default_duration }])
      .select()
      .single()
  );
}

const SERVICE_EDITABLE_FIELDS = ['name', 'description', 'base_price', 'default_duration'];

export async function updateService(id, fields) {
  const safe = Object.fromEntries(
    Object.entries(fields).filter(([key]) => SERVICE_EDITABLE_FIELDS.includes(key))
  );
  return unwrap(
    await supabase.from('service_types').update(safe).eq('id', id).select().single()
  );
}

export async function deleteService(id) {
  return unwrap(
    await supabase
      .from('service_types')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .select()
  );
}

// ---------- booking (security definer RPCs — work for anonymous customers) ----------

export async function getAvailableSlots(date, serviceIds) {
  return unwrap(
    await supabase.rpc('get_available_slots', {
      p_date: date,
      p_service_ids: serviceIds,
    })
  );
}

export async function bookAppointment({ firstName, lastName, phone, email, visitDate, startTime, serviceIds, notes }) {
  return unwrap(
    await supabase.rpc('book_appointment', {
      p_first_name: firstName,
      p_last_name: lastName,
      p_phone: phone,
      p_email: email || null,
      p_visit_date: visitDate,
      p_start_time: startTime,
      p_service_ids: serviceIds,
      p_notes: notes || null,
    })
  );
}

// ---------- availability ----------

export async function listMyAvailability(userId, fromDate) {
  return unwrap(
    await supabase
      .from('availabilities')
      .select('*')
      .eq('user_id', userId)
      .gte('available_date', fromDate)
      .order('available_date')
      .order('start_time')
  );
}

export async function addAvailability({ userId, date, startTime, endTime, notes }) {
  return unwrap(
    await supabase
      .from('availabilities')
      .insert([{ user_id: userId, available_date: date, start_time: startTime, end_time: endTime, notes: notes || null }])
      .select()
      .single()
  );
}

export async function deleteAvailability(id) {
  return unwrap(await supabase.from('availabilities').delete().eq('id', id).select());
}

// ---------- my shifts ----------

export async function listMyShifts(userId, fromDate) {
  return unwrap(
    await supabase
      .from('appointment_items')
      .select('*, service_types(name), appointments(visit_date, customers(first_name, last_name))')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .gte('work_date', fromDate)
      .order('work_date')
      .order('start_time')
  );
}

export async function updateShiftStatus(itemId, userId, status) {
  const rows = unwrap(
    await supabase
      .from('appointment_items')
      .update({ status })
      .eq('id', itemId)
      .eq('user_id', userId)
      .select()
  );
  if (!rows || rows.length === 0) throw new Error('SHIFT_NOT_YOURS');
  return rows[0];
}

// ---------- open shifts (volunteer flow) ----------

export async function listOpenShifts(fromDate) {
  return unwrap(
    await supabase
      .from('appointment_items')
      .select('*, service_types(name), appointments(visit_date, customers(first_name, last_name))')
      .is('user_id', null)
      .is('deleted_at', null)
      .gte('work_date', fromDate)
      .order('work_date')
      .order('start_time')
  );
}

// Claim an unassigned shift via the claim_shift RPC, which enforces
// skills + availability + conflicts server-side and raises SHIFT_TAKEN
// on concurrent claims. (Direct updates of user_id are blocked by the
// column-guard trigger for non-admins.)
export async function claimShift(itemId) {
  return unwrap(await supabase.rpc('claim_shift', { p_item_id: itemId }));
}

// Pure helper: can THIS user claim this open item, and if not — why not.
// Mirrors the server-side checks in claim_shift so the UI can explain
// instead of failing on click.
export function claimEligibility(item, userId, { skills, availabilities, assignments }) {
  const qualified = skills.some(
    (s) => s.user_id === userId && s.service_type_id === item.service_type_id
  );
  if (!qualified) return { eligible: false, reason: 'NOT_QUALIFIED' };

  const available = availabilities.some(
    (a) =>
      a.user_id === userId &&
      a.available_date === item.work_date &&
      a.start_time <= item.start_time &&
      a.end_time >= item.end_time
  );
  if (!available) return { eligible: false, reason: 'NOT_AVAILABLE' };

  const conflict = assignments.some(
    (x) =>
      x.user_id === userId &&
      x.work_date === item.work_date &&
      x.start_time < item.end_time &&
      x.end_time > item.start_time
  );
  if (conflict) return { eligible: false, reason: 'SHIFT_CONFLICT' };

  return { eligible: true, reason: null };
}

// Open shifts annotated with the current user's claim eligibility.
// NOTE: no `await` inside the array — that would serialize the requests.
export async function getClaimableShifts(userId, fromDate) {
  const [open, skills, availabilities, assignments] = await Promise.all([
    listOpenShifts(fromDate),
    supabase
      .from('employee_skills')
      .select('user_id, service_type_id')
      .eq('user_id', userId)
      .then(unwrap),
    supabase
      .from('availabilities')
      .select('user_id, available_date, start_time, end_time')
      .eq('user_id', userId)
      .gte('available_date', fromDate)
      .then(unwrap),
    supabase
      .from('appointment_items')
      .select('user_id, work_date, start_time, end_time')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .gte('work_date', fromDate)
      .then(unwrap),
  ]);
  return open.map((item) => ({
    ...item,
    ...claimEligibility(item, userId, { skills, availabilities, assignments }),
  }));
}

// ---------- assignment (admin) ----------

export async function getAssignmentData(fromDate) {
  const [unassigned, staff, skills, availabilities, assignments] = await Promise.all([
    listOpenShifts(fromDate),
    supabase
      .from('users')
      .select('id, first_name, last_name, role')
      .is('deleted_at', null)
      .order('first_name')
      .then(unwrap),
    supabase.from('employee_skills').select('user_id, service_type_id').then(unwrap),
    supabase.from('availabilities').select('*').gte('available_date', fromDate).then(unwrap),
    supabase
      .from('appointment_items')
      .select('id, user_id, work_date, start_time, end_time')
      .not('user_id', 'is', null)
      .is('deleted_at', null)
      .gte('work_date', fromDate)
      .then(unwrap),
  ]);
  return { unassigned, staff, skills, availabilities, assignments };
}

// Pure helper: which staff members can take this item?
// Qualified (skill), available (window covers the span), and conflict-free.
export function eligibleEmployeesFor(item, { staff, skills, availabilities, assignments }) {
  return staff.filter((emp) => {
    const hasSkill = skills.some(
      (s) => s.user_id === emp.id && s.service_type_id === item.service_type_id
    );
    if (!hasSkill) return false;

    const available = availabilities.some(
      (a) =>
        a.user_id === emp.id &&
        a.available_date === item.work_date &&
        a.start_time <= item.start_time &&
        a.end_time >= item.end_time
    );
    if (!available) return false;

    const conflict = assignments.some(
      (x) =>
        x.user_id === emp.id &&
        x.work_date === item.work_date &&
        x.start_time < item.end_time &&
        x.end_time > item.start_time
    );
    return !conflict;
  });
}

// Assign an unassigned item to an employee; guards against a concurrent
// volunteer claim the same way claimShift does.
export async function assignShift(itemId, userId) {
  const rows = unwrap(
    await supabase
      .from('appointment_items')
      .update({ user_id: userId })
      .eq('id', itemId)
      .is('user_id', null)
      .select()
  );
  if (!rows || rows.length === 0) throw new Error('SHIFT_TAKEN');
  return rows[0];
}

// Cancel an appointment (admin RPC): sets the status AND soft-deletes the
// items atomically so the booked span is actually freed for re-booking.
export async function cancelAppointment(appointmentId) {
  return unwrap(await supabase.rpc('cancel_appointment', { p_appointment_id: appointmentId }));
}

// ---------- dashboard (admin) ----------

export async function getDashboardData(fromDate, toDate) {
  const [appointments, staffCount] = await Promise.all([
    supabase
      .from('appointments')
      .select('*, customers(first_name, last_name), appointment_items(*, service_types(name), users(first_name, last_name))')
      .gte('visit_date', fromDate)
      .lte('visit_date', toDate)
      .neq('status', 'Cancelled')
      .is('deleted_at', null)
      .order('visit_date')
      .then(unwrap),
    supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null)
      .then(({ count, error }) => {
        if (error) throw error;
        return count ?? 0;
      }),
  ]);
  return { appointments, staffCount };
}

// ---------- team (admin) ----------

export async function listStaffWithSkills() {
  const [staff, skills] = await Promise.all([
    supabase
      .from('users')
      .select('id, first_name, last_name, role, phone, hire_date')
      .is('deleted_at', null)
      .order('first_name')
      .then(unwrap),
    supabase.from('employee_skills').select('id, user_id, service_type_id').then(unwrap),
  ]);
  return { staff, skills };
}

export async function addSkill(userId, serviceTypeId) {
  return unwrap(
    await supabase
      .from('employee_skills')
      .insert([{ user_id: userId, service_type_id: serviceTypeId }])
      .select()
      .single()
  );
}

export async function removeSkill(skillId) {
  return unwrap(await supabase.from('employee_skills').delete().eq('id', skillId).select());
}

export async function setUserRole(userId, role) {
  return unwrap(await supabase.rpc('admin_set_user_role', { p_user_id: userId, p_role: role }));
}
