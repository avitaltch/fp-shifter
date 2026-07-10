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

// Assign an unassigned item to an employee; guards against a concurrent
// volunteer claim with the same row-count check the claim flow uses.
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
