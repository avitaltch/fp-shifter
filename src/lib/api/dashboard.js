import { supabase } from '../supabase';
import { unwrap } from './unwrap';

export async function getDashboardData(fromDate, toDate) {
  const appointments = unwrap(
    await supabase
      .from('appointments')
      .select(
        'id, visit_date, status, customers(first_name, last_name, phone), appointment_items(id, user_id, start_time, end_time, status, service_types(name), users(first_name, last_name))'
      )
      .gte('visit_date', fromDate)
      .lte('visit_date', toDate)
      .neq('status', 'Cancelled')
      .is('deleted_at', null)
      .order('visit_date')
  );
  return { appointments };
}
