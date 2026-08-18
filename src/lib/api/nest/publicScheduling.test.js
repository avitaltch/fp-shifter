import { describe, expect, it, vi } from 'vitest';
import {
  createPublicBooking,
  getPublicCatalog,
  searchPublicAvailability,
} from './publicScheduling';

function successfulFetch(body) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: { get: vi.fn().mockReturnValue('request-1') },
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
  });
}

const optionsFor = (fetchImpl) => ({
  apiBaseUrl: 'http://127.0.0.1:3000/api/v1',
  fetchImpl,
});

describe('NestJS public scheduling adapter', () => {
  it('loads the public business catalog', async () => {
    const catalog = { business: { slug: 'happy-pets-demo' }, services: [] };
    const fetchImpl = successfulFetch(catalog);

    await expect(
      getPublicCatalog('happy-pets-demo', optionsFor(fetchImpl))
    ).resolves.toEqual(catalog);
    expect(fetchImpl.mock.calls[0][0]).toMatch(
      /\/public\/businesses\/happy-pets-demo\/catalog$/
    );
    expect(fetchImpl.mock.calls[0][1].method).toBe('GET');
  });

  it('searches complete availability with ordered service identifiers', async () => {
    const request = {
      date: '2030-01-07',
      serviceIds: ['service-1', 'service-2'],
    };
    const fetchImpl = successfulFetch({ slots: [] });

    await searchPublicAvailability('happy-pets-demo', request, optionsFor(fetchImpl));

    expect(fetchImpl.mock.calls[0][0]).toMatch(
      /\/public\/businesses\/happy-pets-demo\/availability\/search$/
    );
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify(request),
    });
  });

  it('submits an atomic public booking', async () => {
    const request = {
      date: '2030-01-07',
      startsAt: '2030-01-07T07:00:00.000Z',
      serviceIds: ['service-1'],
      customer: { firstName: 'Ari', lastName: 'Cohen', phoneE164: '+972501234567' },
    };
    const fetchImpl = successfulFetch({ appointmentId: 'appointment-1' });

    await createPublicBooking('happy-pets-demo', request, optionsFor(fetchImpl));

    expect(fetchImpl.mock.calls[0][0]).toMatch(
      /\/public\/businesses\/happy-pets-demo\/bookings$/
    );
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify(request),
    });
  });
});
