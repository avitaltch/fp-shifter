import { requestAuthenticatedNestApi } from './auth';

export function listOperatorStaff(options) {
  return requestAuthenticatedNestApi('operator/staff', options);
}

export function createOperatorStaff(staff, options = {}) {
  return requestAuthenticatedNestApi('operator/staff', {
    ...options,
    method: 'POST',
    body: staff,
  });
}

export function updateMyOperatorProfile(profile, options = {}) {
  return requestAuthenticatedNestApi('operator/me/profile', {
    ...options,
    method: 'PATCH',
    body: profile,
  });
}

export function updateOperatorStaffRole(userId, role, options = {}) {
  return requestAuthenticatedNestApi(
    `operator/staff/${encodeURIComponent(userId)}/role`,
    { ...options, method: 'PATCH', body: { role } }
  );
}

export function setOperatorStaffActive(userId, active, options = {}) {
  return requestAuthenticatedNestApi(
    `operator/staff/${encodeURIComponent(userId)}/${active ? 'reactivate' : 'deactivate'}`,
    { ...options, method: 'POST' }
  );
}
