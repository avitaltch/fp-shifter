import { supabase } from '../supabase';
import { unwrap } from './unwrap';

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
