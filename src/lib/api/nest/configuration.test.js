import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearStaffAccessToken, loginStaff } from './auth';
import {
  createOperatorAvailability,
  deleteOperatorAvailability,
  listOperatorAvailability,
  listOperatorLocations,
  replaceOperatorProviderSkills,
} from './configuration';

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: vi.fn() },
    text: vi.fn().mockResolvedValue(body === null ? '' : JSON.stringify(body)),
  };
}

describe('NestJS operator configuration adapter', () => {
  let fetchImpl;
  const options = () => ({ apiBaseUrl: 'http://localhost/api/v1', fetchImpl });

  beforeEach(async () => {
    clearStaffAccessToken();
    fetchImpl = vi.fn().mockResolvedValue(
      response({
        accessToken: 'token',
        expiresInSeconds: 900,
        user: { id: 'user-1' },
        business: { id: 'business-1', role: 'Owner' },
      })
    );
    await loginStaff({ email: 'owner@example.com', password: 'secret' }, options());
    fetchImpl.mockReset();
    fetchImpl.mockResolvedValue(response([]));
  });

  it('uses authenticated tenant-derived configuration routes', async () => {
    await listOperatorLocations(options());
    expect(fetchImpl.mock.calls.at(-1)[0]).toContain('/operator/locations');

    await replaceOperatorProviderSkills('provider/1', ['service-1'], options());
    expect(fetchImpl.mock.calls.at(-1)).toEqual([
      expect.stringContaining('/operator/providers/provider%2F1/skills'),
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ serviceIds: ['service-1'] }),
      }),
    ]);
  });

  it('lists, creates, and deletes provider availability', async () => {
    await listOperatorAvailability(
      { from: '2030-01-01T00:00:00.000Z', to: '2030-01-02T00:00:00.000Z' },
      options()
    );
    expect(fetchImpl.mock.calls.at(-1)[0]).toContain('/operator/availability?');

    const intervals = [{ locationId: 'location-1', kind: 'Available' }];
    await createOperatorAvailability(intervals, undefined, options());
    expect(fetchImpl.mock.calls.at(-1)[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ intervals }),
    });

    fetchImpl.mockResolvedValueOnce(response(null, 204));
    await deleteOperatorAvailability('availability-1', options());
    expect(fetchImpl.mock.calls.at(-1)[1].method).toBe('DELETE');
  });
});
