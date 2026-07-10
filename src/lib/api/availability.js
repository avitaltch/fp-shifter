import { supabase } from '../supabase';
import { unwrap } from './unwrap';

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

/** Bulk-insert availability rows. Each entry: { user_id, available_date, start_time, end_time }. */
export async function addAvailabilityBulk(entries) {
  return unwrap(
    await supabase
      .from('availabilities')
      .insert(entries)
      .select()
  );
}

export async function deleteAvailability(id) {
  return unwrap(await supabase.from('availabilities').delete().eq('id', id).select());
}
