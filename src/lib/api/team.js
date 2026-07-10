import { supabase } from '../supabase';
import { unwrap } from './unwrap';

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

// Name (and later phone) only — never role. Role changes go through admin_set_user_role.
const PROFILE_EDITABLE_FIELDS = ['first_name', 'last_name', 'phone'];

export async function updateStaffProfile(userId, fields) {
  const safe = Object.fromEntries(
    Object.entries(fields).filter(([key]) => PROFILE_EDITABLE_FIELDS.includes(key))
  );
  if (safe.first_name !== undefined) safe.first_name = String(safe.first_name).trim();
  if (safe.last_name !== undefined) safe.last_name = String(safe.last_name).trim();
  if (safe.first_name === '' || safe.last_name === '') {
    throw new Error('INVALID_NAME');
  }
  return unwrap(
    await supabase.from('users').update(safe).eq('id', userId).select().single()
  );
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
