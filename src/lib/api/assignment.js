import { supabase } from '../supabase';
import { unwrap } from './unwrap';
import { listOpenShifts } from './shifts';

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

// Assign an unassigned item to an employee. The assign_shift RPC re-checks
// skill/availability/conflicts server-side (the client-side filter above is
// UX only) and throws SHIFT_TAKEN if a volunteer claimed it concurrently.
export async function assignShift(itemId, userId) {
  return unwrap(
    await supabase.rpc('assign_shift', { p_item_id: itemId, p_user_id: userId })
  );
}

// Return an assigned item to the open pool (admin only, today or future).
export async function unassignShift(itemId) {
  return unwrap(await supabase.rpc('unassign_shift', { p_item_id: itemId }));
}
