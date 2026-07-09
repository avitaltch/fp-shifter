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

export async function updateService(id, fields) {
  return unwrap(
    await supabase.from('service_types').update(fields).eq('id', id).select().single()
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

// Claim an unassigned shift. A concurrent claim makes the guarded update
// match 0 rows — Supabase does NOT treat that as an error, so we must
// check the returned row count ourselves.
export async function claimShift(itemId, userId) {
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

// ---------- assignment (admin) ----------

export async function getAssignmentData(fromDate) {
  const [unassigned, staff, skills, availabilities, assignments] = await Promise.all([
    listOpenShifts(fromDate),
    unwrap(
      await supabase
        .from('users')
        .select('id, first_name, last_name, role')
        .is('deleted_at', null)
        .order('first_name')
    ),
    unwrap(await supabase.from('employee_skills').select('user_id, service_type_id')),
    unwrap(await supabase.from('availabilities').select('*').gte('available_date', fromDate)),
    unwrap(
      await supabase
        .from('appointment_items')
        .select('id, user_id, work_date, start_time, end_time')
        .not('user_id', 'is', null)
        .is('deleted_at', null)
        .gte('work_date', fromDate)
    ),
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

// ---------- dashboard (admin) ----------

export async function getDashboardData(fromDate, toDate) {
  const [appointments, staffCount] = await Promise.all([
    unwrap(
      await supabase
        .from('appointments')
        .select('*, customers(first_name, last_name), appointment_items(*, service_types(name), users(first_name, last_name))')
        .gte('visit_date', fromDate)
        .lte('visit_date', toDate)
        .neq('status', 'Cancelled')
        .is('deleted_at', null)
        .order('visit_date')
    ),
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
    unwrap(
      await supabase
        .from('users')
        .select('id, first_name, last_name, role, phone, hire_date')
        .is('deleted_at', null)
        .order('first_name')
    ),
    unwrap(await supabase.from('employee_skills').select('id, user_id, service_type_id')),
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
