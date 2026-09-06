import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearStaffAccessToken, loginStaff } from './auth';
import {
  cancelOperatorAppointment,
  listMyOperatorSteps,
  listOperatorAppointments,
  listOperatorReassignmentOptions,
  reassignOperatorStep,
  updateOperatorStepStatus,
} from './operator';

function response(body) {
  return {
    ok: true,
    status: 200,
    headers: { get: vi.fn() },
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
  };
}

describe('NestJS operator scheduling adapter', () => {
  let fetchImpl;
  const options = () => ({ apiBaseUrl: 'http://localhost/api/v1', fetchImpl });

  beforeEach(async () => {
    clearStaffAccessToken();
    fetchImpl = vi.fn().mockResolvedValue(
      response({
        accessToken: 'operator-token',
        expiresInSeconds: 900,
        user: { id: 'user-1' },
        business: { id: 'business-1', role: 'Owner' },
      })
    );
    await loginStaff({ email: 'owner@example.com', password: 'secret' }, options());
    fetchImpl.mockReset();
    fetchImpl.mockResolvedValue(response([]));
  });

  it('builds a bounded inclusive calendar query', async () => {
    await listOperatorAppointments('2030-01-07', '2030-01-13', options());
    const url = new URL(fetchImpl.mock.calls[0][0]);
    expect(url.pathname).toBe('/api/v1/operator/appointments');
    expect(new Date(url.searchParams.get('from'))).toBeInstanceOf(Date);
    expect(
      new Date(url.searchParams.get('to')).getTime() -
        new Date(url.searchParams.get('from')).getTime()
    ).toBe(7 * 86_400_000);
  });

  it('uses authenticated routes for schedule and reassignment mutations', async () => {
    await listMyOperatorSteps('2030-01-07', '2030-01-13', options());
    expect(fetchImpl.mock.calls.at(-1)[0]).toContain('/operator/me/steps?');

    await updateOperatorStepStatus('step/1', 'Completed', options());
    expect(fetchImpl.mock.calls.at(-1)[0]).toContain('/operator/steps/step%2F1/status');
    expect(fetchImpl.mock.calls.at(-1)[1]).toMatchObject({
      method: 'PATCH',
      body: JSON.stringify({ status: 'Completed' }),
    });

    await listOperatorReassignmentOptions('step-1', options());
    expect(fetchImpl.mock.calls.at(-1)[0]).toContain('/reassignment-options');

    await reassignOperatorStep('step-1', 'provider-1', options());
    expect(fetchImpl.mock.calls.at(-1)[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ providerUserId: 'provider-1' }),
    });

    await cancelOperatorAppointment('appointment-1', options());
    expect(fetchImpl.mock.calls.at(-1)[0]).toContain('/appointments/appointment-1/cancel');
  });
});
