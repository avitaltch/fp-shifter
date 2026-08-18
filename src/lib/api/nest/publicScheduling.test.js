import { describe, expect, it, vi } from 'vitest';
import {
  createPublicBooking,
  getPublicCatalog,
  loadPublicBookingCatalog,
  loadPublicBookingSlots,
  searchPublicAvailability,
  submitPublicBooking,
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

  it('adapts the Nest catalog to the existing booking view model', async () => {
    const fetchImpl = successfulFetch({
      business: { slug: 'happy-pets-demo', name: 'Happy Pets' },
      location: { name: 'Tel Aviv', timezone: 'Asia/Jerusalem' },
      services: [
        {
          id: 'service-1',
          name: 'Trim',
          description: 'Full trim',
          durationMinutes: 45,
          priceMinor: 12_500,
          currency: 'ILS',
        },
      ],
    });

    await expect(
      loadPublicBookingCatalog('happy-pets-demo', optionsFor(fetchImpl))
    ).resolves.toMatchObject({
      services: [
        {
          id: 'service-1',
          base_price: 125,
          default_duration: 45,
        },
      ],
    });
  });

  it('adapts ISO availability slots to the booking view model', async () => {
    const fetchImpl = successfulFetch({
      slots: [
        {
          startsAt: '2030-01-07T07:00:00.000Z',
          endsAt: '2030-01-07T08:00:00.000Z',
        },
      ],
    });

    await expect(
      loadPublicBookingSlots(
        'happy-pets-demo',
        '2030-01-07',
        ['service-1'],
        optionsFor(fetchImpl)
      )
    ).resolves.toEqual([
      {
        slot_start: '2030-01-07T07:00:00.000Z',
        slot_end: '2030-01-07T08:00:00.000Z',
      },
    ]);
  });

  it('submits E.164 customer data and adapts the booking confirmation', async () => {
    const fetchImpl = successfulFetch({
      appointmentId: 'appointment-1',
      status: 'Confirmed',
      startsAt: '2030-01-07T07:00:00.000Z',
      endsAt: '2030-01-07T08:00:00.000Z',
      totalPriceMinor: 12_500,
      currency: 'ILS',
      steps: [],
    });

    const result = await submitPublicBooking(
      'happy-pets-demo',
      {
        firstName: 'Ari',
        lastName: 'Cohen',
        phoneE164: '+972501234567',
        visitDate: '2030-01-07',
        startsAt: '2030-01-07T07:00:00.000Z',
        serviceIds: ['service-1'],
      },
      optionsFor(fetchImpl)
    );

    expect(result).toMatchObject({
      appointment_id: 'appointment-1',
      visit_date: '2030-01-07',
      start_time: '2030-01-07T07:00:00.000Z',
      end_time: '2030-01-07T08:00:00.000Z',
      total_duration: 60,
      total_price: 125,
    });
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toMatchObject({
      customer: { phoneE164: '+972501234567' },
    });
  });
});
