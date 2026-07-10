import { supabase } from '../supabase';
import { unwrap } from './unwrap';

export async function getDashboardData(fromDate, toDate) {
  const [appointments, staffCount] = await Promise.all([
    supabase
      .from('appointments')
      .select('*, customers(first_name, last_name, phone), appointment_items(*, service_types(name), users(first_name, last_name))')
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
