import { performance } from 'node:perf_hooks';
import { findCompoundAppointmentPlans } from '../src/scheduling/domain/compound-scheduler';
import type { CompoundSchedulingInput } from '../src/scheduling/domain/compound-scheduler.types';

const RUNS = 100;
const TARGET_P95_MS = 500;
const providers = Array.from(
  { length: 10 },
  (_, index) => `provider-${index.toString().padStart(2, '0')}`,
);

function largeStudioInput(): CompoundSchedulingInput {
  const studioProviders = providers.slice(0, 5);
  const services = Array.from({ length: 6 }, (_, index) => ({
    serviceId: `studio-service-${index}`,
    durationMinutes: 30,
  }));
  return {
    timezone: 'Asia/Jerusalem',
    rangeStart: new Date('2030-01-07T06:00:00.000Z'),
    rangeEnd: new Date('2030-01-07T18:00:00.000Z'),
    services,
    businessHours: [
      { isoWeekday: 1, startsAt: '08:00:00', endsAt: '20:00:00' },
    ],
    providerSkills: services.flatMap((service) =>
      studioProviders.map((providerUserId) => ({
        providerUserId,
        serviceId: service.serviceId,
      })),
    ),
    providerAvailability: studioProviders.map((providerUserId) => ({
      providerUserId,
      kind: 'Available',
      startsAt: new Date('2030-01-07T06:00:00.000Z'),
      endsAt: new Date('2030-01-07T18:00:00.000Z'),
    })),
    reservations: [],
    maxPlans: 40,
  };
}

function tenBarberInput(): CompoundSchedulingInput {
  const serviceId = 'barber-haircut';
  const opensAt = new Date('2030-01-07T06:00:00.000Z').getTime();
  const reservations = providers.flatMap((providerUserId) =>
    Array.from({ length: 36 }, (_, index) => ({
      appointmentId: `appointment-${providerUserId}-${index}`,
      providerUserId,
      startsAt: new Date(opensAt + index * 20 * 60_000),
      endsAt: new Date(opensAt + (index + 1) * 20 * 60_000),
    })),
  );
  return {
    timezone: 'Asia/Jerusalem',
    rangeStart: new Date('2030-01-07T06:00:00.000Z'),
    rangeEnd: new Date('2030-01-07T18:00:00.000Z'),
    services: [{ serviceId, durationMinutes: 20 }],
    businessHours: [
      { isoWeekday: 1, startsAt: '08:00:00', endsAt: '20:00:00' },
    ],
    providerSkills: providers.map((providerUserId) => ({
      providerUserId,
      serviceId,
    })),
    providerAvailability: providers.map((providerUserId) => ({
      providerUserId,
      kind: 'Available',
      startsAt: new Date('2030-01-07T06:00:00.000Z'),
      endsAt: new Date('2030-01-07T18:00:00.000Z'),
    })),
    reservations,
    slotIntervalMinutes: 5,
    maxPlans: 40,
  };
}

function benchmark(name: string, input: CompoundSchedulingInput) {
  findCompoundAppointmentPlans(input);
  const samples: number[] = [];
  let lastResult = findCompoundAppointmentPlans(input);
  for (let index = 0; index < RUNS; index += 1) {
    const startedAt = performance.now();
    lastResult = findCompoundAppointmentPlans(input);
    samples.push(performance.now() - startedAt);
  }
  samples.sort((left, right) => left - right);
  const percentile = (ratio: number) =>
    samples[Math.ceil(samples.length * ratio) - 1] ?? Number.POSITIVE_INFINITY;
  return {
    name,
    runs: RUNS,
    p50Ms: Number(percentile(0.5).toFixed(2)),
    p95Ms: Number(percentile(0.95).toFixed(2)),
    maxMs: Number((samples.at(-1) ?? 0).toFixed(2)),
    plans: lastResult.plans.length,
    searchNodes: lastResult.searchNodes,
  };
}

const results = [
  benchmark('large-studio-six-services', largeStudioInput()),
  benchmark('ten-barbers-fully-booked', tenBarberInput()),
];
console.log(JSON.stringify({ targetP95Ms: TARGET_P95_MS, results }, null, 2));

if (results.some((result) => result.p95Ms >= TARGET_P95_MS)) {
  process.exitCode = 1;
}
