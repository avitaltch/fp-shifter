import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requestAuthenticatedNestApi } from './auth';
import {
  createOperatorStaff,
  listOperatorStaff,
  setOperatorStaffActive,
  updateMyOperatorProfile,
  updateOperatorStaffRole,
} from './staffing';

vi.mock('./auth', () => ({ requestAuthenticatedNestApi: vi.fn() }));

describe('Nest staffing API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses tenant-authenticated staff endpoints', async () => {
    await listOperatorStaff();
    await createOperatorStaff({ email: 'new@example.test' });
    await updateMyOperatorProfile({ firstName: 'Dana' });
    await updateOperatorStaffRole('user/1', 'Manager');
    await setOperatorStaffActive('user/1', false);

    expect(requestAuthenticatedNestApi).toHaveBeenNthCalledWith(1, 'operator/staff', undefined);
    expect(requestAuthenticatedNestApi).toHaveBeenNthCalledWith(2, 'operator/staff', {
      method: 'POST',
      body: { email: 'new@example.test' },
    });
    expect(requestAuthenticatedNestApi).toHaveBeenNthCalledWith(3, 'operator/me/profile', {
      method: 'PATCH',
      body: { firstName: 'Dana' },
    });
    expect(requestAuthenticatedNestApi).toHaveBeenNthCalledWith(
      4,
      'operator/staff/user%2F1/role',
      { method: 'PATCH', body: { role: 'Manager' } }
    );
    expect(requestAuthenticatedNestApi).toHaveBeenNthCalledWith(
      5,
      'operator/staff/user%2F1/deactivate',
      { method: 'POST' }
    );
  });
});
