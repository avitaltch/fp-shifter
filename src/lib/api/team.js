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
