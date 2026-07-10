import { supabase } from '../supabase';
import { unwrap } from './unwrap';

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
