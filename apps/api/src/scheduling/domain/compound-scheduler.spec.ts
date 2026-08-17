import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import type {
  ActiveAppointmentStepRecord,
  BusinessHoursRecord,
  ProviderAvailabilityRecord,
  ProviderSkillRecord,
} from '../scheduling.types';
import {
  findCompoundAppointmentPlans,
  localDateRangeToInstants,
  SchedulerInputError,
} from './compound-scheduler';
import type {
  CompoundSchedulingInput,
  RequestedServiceStep,
} from './compound-scheduler.types';

const TRIM = 'service-trim';
const VACCINE = 'service-vaccine';
const GROOMER = 'provider-groomer';
const VET = 'provider-vet';
const SEARCH_START = new Date('2030-01-07T07:00:00.000Z');
const SEARCH_END = new Date('2030-01-07T10:00:00.000Z');

function hours(
  startsAt = '09:00:00',
  endsAt = '12:00:00',
  isoWeekday = 1,
): BusinessHoursRecord {
  return { isoWeekday, startsAt, endsAt };
}

function skill(providerUserId: string, serviceId: string): ProviderSkillRecord {
  return { providerUserId, serviceId };
}

function availability(
  providerUserId: string,
  startsAt = '2030-01-07T06:30:00.000Z',
  endsAt = '2030-01-07T10:30:00.000Z',
  kind: ProviderAvailabilityRecord['kind'] = 'Available',
): ProviderAvailabilityRecord {
  return {
    providerUserId,
    kind,
    startsAt: new Date(startsAt),
    endsAt: new Date(endsAt),
  };
}

function reservation(
  providerUserId: string,
  startsAt: string,
  endsAt: string,
): ActiveAppointmentStepRecord {
  return {
    appointmentId: `appointment-${providerUserId}-${startsAt}`,
    providerUserId,
    startsAt: new Date(startsAt),
    endsAt: new Date(endsAt),
  };
}

function baseInput(
  overrides: Partial<CompoundSchedulingInput> = {},
): CompoundSchedulingInput {
  const services: readonly RequestedServiceStep[] = [
    { serviceId: TRIM, durationMinutes: 45 },
    { serviceId: VACCINE, durationMinutes: 15 },
  ];
  return {
    timezone: 'Asia/Jerusalem',
    rangeStart: SEARCH_START,
    rangeEnd: SEARCH_END,
    services,
    businessHours: [hours()],
    providerSkills: [skill(GROOMER, TRIM), skill(VET, VACCINE)],
    providerAvailability: [availability(GROOMER), availability(VET)],
    reservations: [],
    maxPlans: 20,
    ...overrides,
  };
}

describe('findCompoundAppointmentPlans', () => {
  it('creates a back-to-back groomer-to-veterinarian handoff', () => {
    const result = findCompoundAppointmentPlans(baseInput());

    expect(result.plans[0]).toEqual({
      startsAt: new Date('2030-01-07T07:00:00.000Z'),
      endsAt: new Date('2030-01-07T08:00:00.000Z'),
      handoffCount: 1,
      steps: [
        {
          sequenceNumber: 1,
          serviceId: TRIM,
          providerUserId: GROOMER,
          startsAt: new Date('2030-01-07T07:00:00.000Z'),
          endsAt: new Date('2030-01-07T07:45:00.000Z'),
        },
        {
          sequenceNumber: 2,
          serviceId: VACCINE,
          providerUserId: VET,
          startsAt: new Date('2030-01-07T07:45:00.000Z'),
          endsAt: new Date('2030-01-07T08:00:00.000Z'),
        },
      ],
    });
  });

  it('reports the public-safe sequence when a service has no qualified provider', () => {
    const result = findCompoundAppointmentPlans(
      baseInput({ providerSkills: [skill(GROOMER, TRIM)] }),
    );

    expect(result.plans).toEqual([]);
    expect(result.diagnostics).toEqual([
      { code: 'NO_QUALIFIED_PROVIDER', serviceSequence: 2 },
    ]);
  });

  it('subtracts existing reservations and accepts half-open adjacency', () => {
    const result = findCompoundAppointmentPlans(
      baseInput({
        reservations: [
          reservation(
            GROOMER,
            '2030-01-07T07:00:00.000Z',
            '2030-01-07T07:45:00.000Z',
          ),
        ],
      }),
    );

    expect(result.plans[0]?.startsAt).toEqual(
      new Date('2030-01-07T07:45:00.000Z'),
    );
  });

  it('subtracts an unavailable break without leaking provider details', () => {
    const result = findCompoundAppointmentPlans(
      baseInput({
        providerAvailability: [
          availability(GROOMER),
          availability(VET),
          availability(
            VET,
            '2030-01-07T07:45:00.000Z',
            '2030-01-07T08:00:00.000Z',
            'Unavailable',
          ),
        ],
      }),
    );

    expect(result.plans[0]?.startsAt).toEqual(
      new Date('2030-01-07T07:15:00.000Z'),
    );
    expect(result.diagnostics).toEqual([]);
  });

  it('minimizes handoffs before preferring a less-loaded provider', () => {
    const result = findCompoundAppointmentPlans(
      baseInput({
        providerSkills: [
          skill(GROOMER, TRIM),
          skill(GROOMER, VACCINE),
          skill(VET, VACCINE),
        ],
        reservations: [
          reservation(
            GROOMER,
            '2030-01-07T09:00:00.000Z',
            '2030-01-07T09:30:00.000Z',
          ),
        ],
      }),
    );

    expect(result.plans[0]?.handoffCount).toBe(0);
    expect(result.plans[0]?.steps.map((step) => step.providerUserId)).toEqual([
      GROOMER,
      GROOMER,
    ]);
  });

  it('uses provider preference before load and stable identifiers', () => {
    const result = findCompoundAppointmentPlans(
      baseInput({
        services: [
          {
            serviceId: TRIM,
            durationMinutes: 30,
            preferredProviderUserId: GROOMER,
          },
        ],
        providerSkills: [skill(GROOMER, TRIM), skill(VET, TRIM)],
        reservations: [
          reservation(
            GROOMER,
            '2030-01-07T09:00:00.000Z',
            '2030-01-07T09:30:00.000Z',
          ),
        ],
      }),
    );

    expect(result.plans[0]?.steps[0]?.providerUserId).toBe(GROOMER);
  });

  it('uses buffers for provider occupancy while keeping service steps contiguous', () => {
    const result = findCompoundAppointmentPlans(
      baseInput({
        services: [
          { serviceId: TRIM, durationMinutes: 30, bufferAfterMinutes: 15 },
          { serviceId: VACCINE, durationMinutes: 30 },
        ],
        providerSkills: [
          skill(GROOMER, TRIM),
          skill(GROOMER, VACCINE),
          skill(VET, VACCINE),
        ],
      }),
    );

    expect(result.plans[0]?.steps.map((step) => step.providerUserId)).toEqual([
      GROOMER,
      VET,
    ]);
    expect(result.plans[0]?.steps[0]?.endsAt).toEqual(
      result.plans[0]?.steps[1]?.startsAt,
    );
  });

  it('handles a DST jump using real elapsed time and no phantom local hour', () => {
    const result = findCompoundAppointmentPlans(
      baseInput({
        timezone: 'America/New_York',
        rangeStart: new Date('2030-03-10T05:00:00.000Z'),
        rangeEnd: new Date('2030-03-10T09:00:00.000Z'),
        services: [{ serviceId: TRIM, durationMinutes: 30 }],
        businessHours: [hours('01:00:00', '04:00:00', 7)],
        providerSkills: [skill(GROOMER, TRIM)],
        providerAvailability: [
          availability(
            GROOMER,
            '2030-03-10T05:00:00.000Z',
            '2030-03-10T09:00:00.000Z',
          ),
        ],
        maxPlans: 10,
      }),
    );

    expect(result.plans.map((plan) => plan.startsAt.toISOString())).toEqual([
      '2030-03-10T06:00:00.000Z',
      '2030-03-10T06:15:00.000Z',
      '2030-03-10T06:30:00.000Z',
      '2030-03-10T06:45:00.000Z',
      '2030-03-10T07:00:00.000Z',
      '2030-03-10T07:15:00.000Z',
      '2030-03-10T07:30:00.000Z',
    ]);
  });

  it('resolves local calendar days across DST boundaries', () => {
    const springForward = localDateRangeToInstants(
      '2030-03-10',
      'America/New_York',
    );

    expect(springForward.rangeStart.toISOString()).toBe(
      '2030-03-10T05:00:00.000Z',
    );
    expect(springForward.rangeEnd.toISOString()).toBe(
      '2030-03-11T04:00:00.000Z',
    );
    expect(
      springForward.rangeEnd.getTime() - springForward.rangeStart.getTime(),
    ).toBe(23 * 60 * 60 * 1_000);
  });

  it('returns explicit diagnostics for closures, invalid timezones, and exhaustion', () => {
    expect(
      findCompoundAppointmentPlans(baseInput({ businessHours: [] })).diagnostics,
    ).toEqual([{ code: 'NO_BUSINESS_HOURS' }]);
    expect(
      findCompoundAppointmentPlans(baseInput({ timezone: 'Invalid/Timezone' }))
        .diagnostics,
    ).toEqual([{ code: 'INVALID_TIMEZONE' }]);
    expect(
      findCompoundAppointmentPlans(
        baseInput({ providerAvailability: [] }),
      ).diagnostics,
    ).toEqual([
      { code: 'PROVIDERS_UNAVAILABLE' },
      { code: 'NO_VALID_PLAN' },
    ]);
  });

  it('rejects invalid bounds before starting a search', () => {
    expect(() =>
      findCompoundAppointmentPlans(
        baseInput({
          services: Array.from({ length: 7 }, (_, index) => ({
            serviceId: `service-${index}`,
            durationMinutes: 15,
          })),
        }),
      ),
    ).toThrow(SchedulerInputError);
  });

  it('returns identical output for identical input', () => {
    const input = baseInput();
    expect(findCompoundAppointmentPlans(input)).toEqual(
      findCompoundAppointmentPlans(input),
    );
  });

  it('searches six services across ten providers below the MVP target', () => {
    const providers = Array.from(
      { length: 10 },
      (_, index) => `provider-${index.toString().padStart(2, '0')}`,
    );
    const services = Array.from({ length: 6 }, (_, index) => ({
      serviceId: `service-${index}`,
      durationMinutes: 20,
    }));
    const input = baseInput({
      services,
      businessHours: [hours('08:00:00', '20:00:00')],
      rangeStart: new Date('2030-01-07T06:00:00.000Z'),
      rangeEnd: new Date('2030-01-07T18:00:00.000Z'),
      providerSkills: services.flatMap((service) =>
        providers.map((provider) => skill(provider, service.serviceId)),
      ),
      providerAvailability: providers.map((provider) =>
        availability(
          provider,
          '2030-01-07T05:30:00.000Z',
          '2030-01-07T18:30:00.000Z',
        ),
      ),
      maxPlans: 40,
    });

    const startedAt = performance.now();
    const result = findCompoundAppointmentPlans(input);
    const elapsedMs = performance.now() - startedAt;

    expect(result.plans).toHaveLength(40);
    expect(result.searchNodes).toBeLessThan(100_000);
    expect(elapsedMs).toBeLessThan(500);
  });
});
