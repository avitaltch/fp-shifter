import { supabase } from '../supabase';
import { unwrap } from './unwrap';
import { listOpenShifts } from './shifts';

// ---------- assignment (admin) ----------

export async function getAssignmentData(fromDate) {
  const [unassigned, staff, skills, availabilities, assignments] = await Promise.all([
    listOpenShifts(fromDate),
    supabase
      .from('users')
      .select('id, first_name, last_name')
      .is('deleted_at', null)
      .order('first_name')
      .then(unwrap),
    supabase.from('employee_skills').select('user_id, service_type_id').then(unwrap),
    supabase
      .from('availabilities')
      .select('user_id, available_date, start_time, end_time')
      .gte('available_date', fromDate)
      .then(unwrap),
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
