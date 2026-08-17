import type {
  ActiveAppointmentStepRecord,
  ProviderAvailabilityRecord,
} from '../scheduling.types';
import type {
  AppointmentPlan,
  AppointmentPlanStep,
  CompoundSchedulingInput,
  CompoundSchedulingResult,
  RequestedServiceStep,
  SchedulingDiagnostic,
} from './compound-scheduler.types';

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const DEFAULT_SLOT_INTERVAL_MINUTES = 15;
const DEFAULT_MAX_PLANS = 40;
const DEFAULT_MAX_SEARCH_NODES = 100_000;
const MAX_SERVICES = 6;
const MAX_RANGE_DAYS = 31;
const TIME_PATTERN = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

interface OpenInterval {
  startsAtMs: number;
  endsAtMs: number;
  localDate: string;
}

interface OccupiedInterval {
  startsAtMs: number;
  endsAtMs: number;
}

interface CandidateAssignment {
  providerUserId: string;
  occupied: OccupiedInterval;
  preferencePenalty: number;
  loadMinutes: number;
}

interface AssignmentScore {
  preferencePenalty: number;
  handoffs: number;
  loadMinutes: number;
  providerKey: string;
}

interface BestAssignment {
  score: AssignmentScore;
  providers: readonly string[];
}

export class SchedulerInputError extends Error {}

export function localDateRangeToInstants(
  localDate: string,
  timezone: string,
): { rangeStart: Date; rangeEnd: Date } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) {
    throw new SchedulerInputError('Date must use YYYY-MM-DD format');
  }
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = createZonedFormatter(timezone);
    formatter.format(new Date());
  } catch {
    throw new SchedulerInputError('Timezone must be a valid IANA timezone');
  }
  const [year, month, day] = localDate.split('-').map(Number);
  if (!year || !month || !day) {
    throw new SchedulerInputError('Date must be a valid calendar date');
  }
  const normalized = new Date(Date.UTC(year, month - 1, day));
  if (
    normalized.getUTCFullYear() !== year ||
    normalized.getUTCMonth() !== month - 1 ||
    normalized.getUTCDate() !== day
  ) {
    throw new SchedulerInputError('Date must be a valid calendar date');
  }
  const nextDate = new Date(normalized.getTime() + DAY_MS);
  const nextLocalDate = `${nextDate.getUTCFullYear().toString().padStart(4, '0')}-${(
    nextDate.getUTCMonth() + 1
  )
    .toString()
    .padStart(2, '0')}-${nextDate.getUTCDate().toString().padStart(2, '0')}`;
  const rangeStartMs = localDateTimeToEpoch(localDate, '00:00:00', formatter);
  const rangeEndMs = localDateTimeToEpoch(nextLocalDate, '00:00:00', formatter);
  if (rangeStartMs === null || rangeEndMs === null) {
    throw new SchedulerInputError('Date does not resolve in the business timezone');
  }
  return {
    rangeStart: new Date(rangeStartMs),
    rangeEnd: new Date(rangeEndMs),
  };
}

export function findCompoundAppointmentPlans(
  input: CompoundSchedulingInput,
): CompoundSchedulingResult {
  validateInput(input);

  let formatter: Intl.DateTimeFormat;
  try {
    formatter = createZonedFormatter(input.timezone);
    formatter.format(input.rangeStart);
  } catch {
    return resultWithDiagnostic('INVALID_TIMEZONE');
  }

  const diagnostics: SchedulingDiagnostic[] = [];
  const providersByService = mapProvidersByService(input);
  for (let index = 0; index < input.services.length; index += 1) {
    const service = input.services[index];
    if (!service || (providersByService.get(service.serviceId)?.length ?? 0) > 0) {
      continue;
    }
    diagnostics.push({
      code: 'NO_QUALIFIED_PROVIDER',
      serviceSequence: index + 1,
    });
  }
  if (diagnostics.length > 0) {
    return { plans: [], diagnostics, searchNodes: 0, truncated: false };
  }

  const openIntervals = buildOpenIntervals(input, formatter);
  if (openIntervals.length === 0) {
    return resultWithDiagnostic('NO_BUSINESS_HOURS');
  }

  const providerLoad = calculateProviderLoad(input.reservations);
  const availabilityByProvider = groupByProvider(input.providerAvailability);
  const reservationsByProvider = groupByProvider(input.reservations);
  const maxPlans = input.maxPlans ?? DEFAULT_MAX_PLANS;
  const maxSearchNodes = input.maxSearchNodes ?? DEFAULT_MAX_SEARCH_NODES;
  const slotIntervalMs =
    (input.slotIntervalMinutes ?? DEFAULT_SLOT_INTERVAL_MINUTES) * MINUTE_MS;
  const totalDurationMs = input.services.reduce(
    (sum, service) => sum + service.durationMinutes * MINUTE_MS,
    0,
  );
  const plans: AppointmentPlan[] = [];
  let searchNodes = 0;
  let truncated = false;

  outer: for (const open of openIntervals) {
    const earliestStart = Math.max(open.startsAtMs, input.rangeStart.getTime());
    const latestEnd = Math.min(open.endsAtMs, input.rangeEnd.getTime());
    let candidateStart = alignUp(earliestStart, open.startsAtMs, slotIntervalMs);

    while (candidateStart + totalDurationMs <= latestEnd) {
      const timedSteps = buildTimedSteps(input.services, candidateStart);
      const candidatesByStep = timedSteps.map((step, index) => {
        const request = input.services[index];
        if (!request) return [];
        return buildCandidates({
          request,
          step,
          providers: providersByService.get(request.serviceId) ?? [],
          availabilityByProvider,
          reservationsByProvider,
          providerLoad,
        });
      });

      if (candidatesByStep.every((candidates) => candidates.length > 0)) {
        const remainingNodeBudget = maxSearchNodes - searchNodes;
        if (remainingNodeBudget <= 0) {
          truncated = true;
          break outer;
        }
        const assignment = chooseBestAssignment(
          candidatesByStep,
          remainingNodeBudget,
        );
        searchNodes += assignment.searchNodes;
        truncated ||= assignment.truncated;
        if (assignment.providers) {
          plans.push(
            createPlan(timedSteps, input.services, assignment.providers),
          );
          if (plans.length >= maxPlans) {
            truncated = hasLaterCandidate(
              candidateStart,
              latestEnd,
              totalDurationMs,
              slotIntervalMs,
              openIntervals,
              open,
            );
            break outer;
          }
        }
        if (assignment.truncated) break outer;
      }

      candidateStart += slotIntervalMs;
    }
  }

  if (truncated) diagnostics.push({ code: 'SEARCH_LIMIT_REACHED' });
  if (plans.length === 0) {
    diagnostics.push({ code: 'PROVIDERS_UNAVAILABLE' });
    diagnostics.push({ code: 'NO_VALID_PLAN' });
  }

  return { plans, diagnostics, searchNodes, truncated };
}

function validateInput(input: CompoundSchedulingInput): void {
  const rangeMs = input.rangeEnd.getTime() - input.rangeStart.getTime();
  if (
    !Number.isFinite(input.rangeStart.getTime()) ||
    !Number.isFinite(input.rangeEnd.getTime()) ||
    rangeMs <= 0 ||
    rangeMs > MAX_RANGE_DAYS * DAY_MS
  ) {
    throw new SchedulerInputError('Search range must be between 1 ms and 31 days');
  }
  if (input.services.length < 1 || input.services.length > MAX_SERVICES) {
    throw new SchedulerInputError('A request must contain between 1 and 6 services');
  }
  for (const service of input.services) {
    assertIntegerBetween(service.durationMinutes, 1, 1_440, 'durationMinutes');
    assertIntegerBetween(service.bufferBeforeMinutes ?? 0, 0, 1_440, 'bufferBeforeMinutes');
    assertIntegerBetween(service.bufferAfterMinutes ?? 0, 0, 1_440, 'bufferAfterMinutes');
  }
  assertIntegerBetween(
    input.slotIntervalMinutes ?? DEFAULT_SLOT_INTERVAL_MINUTES,
    1,
    60,
    'slotIntervalMinutes',
  );
  assertIntegerBetween(input.maxPlans ?? DEFAULT_MAX_PLANS, 1, 100, 'maxPlans');
  assertIntegerBetween(
    input.maxSearchNodes ?? DEFAULT_MAX_SEARCH_NODES,
    1,
    1_000_000,
    'maxSearchNodes',
  );
}

function assertIntegerBetween(
  value: number,
  minimum: number,
  maximum: number,
  field: string,
): void {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new SchedulerInputError(
      `${field} must be an integer between ${minimum} and ${maximum}`,
    );
  }
}

function createZonedFormatter(timezone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
}

function getZonedParts(
  instant: Date,
  formatter: Intl.DateTimeFormat,
): ZonedParts {
  const values = new Map(
    formatter
      .formatToParts(instant)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: values.get('year') ?? 0,
    month: values.get('month') ?? 0,
    day: values.get('day') ?? 0,
    hour: values.get('hour') ?? 0,
    minute: values.get('minute') ?? 0,
    second: values.get('second') ?? 0,
  };
}

function localDateKey(parts: ZonedParts): string {
  return `${parts.year.toString().padStart(4, '0')}-${parts.month
    .toString()
    .padStart(2, '0')}-${parts.day.toString().padStart(2, '0')}`;
}

function buildOpenIntervals(
  input: CompoundSchedulingInput,
  formatter: Intl.DateTimeFormat,
): OpenInterval[] {
  const hoursByWeekday = new Map<number, typeof input.businessHours>();
  for (const hours of input.businessHours) {
    const existing = hoursByWeekday.get(hours.isoWeekday) ?? [];
    hoursByWeekday.set(hours.isoWeekday, [...existing, hours]);
  }

  const localDates = enumerateLocalDates(input.rangeStart, input.rangeEnd, formatter);
  const intervals: OpenInterval[] = [];
  for (const localDate of localDates) {
    const [year, month, day] = localDate.split('-').map(Number);
    if (!year || !month || !day) continue;
    const isoWeekday = isoWeekdayForLocalDate(year, month, day);
    for (const hours of hoursByWeekday.get(isoWeekday) ?? []) {
      const startsAtMs = localDateTimeToEpoch(
        localDate,
        hours.startsAt,
        formatter,
      );
      const endsAtMs = localDateTimeToEpoch(localDate, hours.endsAt, formatter);
      if (startsAtMs === null || endsAtMs === null || startsAtMs >= endsAtMs) {
        continue;
      }
      if (
        endsAtMs > input.rangeStart.getTime() &&
        startsAtMs < input.rangeEnd.getTime()
      ) {
        intervals.push({ startsAtMs, endsAtMs, localDate });
      }
    }
  }
  return intervals.sort(
    (left, right) =>
      left.startsAtMs - right.startsAtMs || left.endsAtMs - right.endsAtMs,
  );
}

function enumerateLocalDates(
  rangeStart: Date,
  rangeEnd: Date,
  formatter: Intl.DateTimeFormat,
): readonly string[] {
  const firstUtcDay = Math.floor(rangeStart.getTime() / DAY_MS) * DAY_MS - DAY_MS;
  const lastUtcDay = Math.floor(rangeEnd.getTime() / DAY_MS) * DAY_MS + DAY_MS;
  const dates = new Set<string>();
  for (let epoch = firstUtcDay; epoch <= lastUtcDay; epoch += DAY_MS) {
    dates.add(localDateKey(getZonedParts(new Date(epoch), formatter)));
  }
  return [...dates].sort();
}

function isoWeekdayForLocalDate(year: number, month: number, day: number): number {
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

function localDateTimeToEpoch(
  localDate: string,
  localTime: string,
  formatter: Intl.DateTimeFormat,
): number | null {
  const [year, month, day] = localDate.split('-').map(Number);
  const timeMatch = TIME_PATTERN.exec(localTime);
  if (!year || !month || !day || !timeMatch) return null;
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const second = Number(timeMatch[3] ?? 0);
  if (hour > 23 || minute > 59 || second > 59) return null;

  const desired: ZonedParts = { year, month, day, hour, minute, second };
  const naiveEpoch = Date.UTC(year, month - 1, day, hour, minute, second);
  const offsetSamples = [naiveEpoch - DAY_MS, naiveEpoch, naiveEpoch + DAY_MS];
  const matches = new Set<number>();
  for (const sample of offsetSamples) {
    const actual = getZonedParts(new Date(sample), formatter);
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    );
    const candidate = naiveEpoch - (actualAsUtc - sample);
    if (sameZonedParts(getZonedParts(new Date(candidate), formatter), desired)) {
      matches.add(candidate);
    }
  }
  if (matches.size === 0) return null;
  return Math.min(...matches);
}

function sameZonedParts(left: ZonedParts, right: ZonedParts): boolean {
  return (
    left.year === right.year &&
    left.month === right.month &&
    left.day === right.day &&
    left.hour === right.hour &&
    left.minute === right.minute &&
    left.second === right.second
  );
}

function mapProvidersByService(
  input: CompoundSchedulingInput,
): ReadonlyMap<string, readonly string[]> {
  const requestedServiceIds = new Set(input.services.map((service) => service.serviceId));
  const providers = new Map<string, Set<string>>();
  for (const skill of input.providerSkills) {
    if (!requestedServiceIds.has(skill.serviceId)) continue;
    const serviceProviders = providers.get(skill.serviceId) ?? new Set<string>();
    serviceProviders.add(skill.providerUserId);
    providers.set(skill.serviceId, serviceProviders);
  }
  return new Map(
    [...providers].map(([serviceId, serviceProviders]) => [
      serviceId,
      [...serviceProviders].sort(),
    ]),
  );
}

function groupByProvider<
  RecordType extends ProviderAvailabilityRecord | ActiveAppointmentStepRecord,
>(records: readonly RecordType[]): ReadonlyMap<string, readonly RecordType[]> {
  const grouped = new Map<string, RecordType[]>();
  for (const record of records) {
    const providerRecords = grouped.get(record.providerUserId) ?? [];
    providerRecords.push(record);
    grouped.set(record.providerUserId, providerRecords);
  }
  for (const providerRecords of grouped.values()) {
    providerRecords.sort(
      (left, right) => left.startsAt.getTime() - right.startsAt.getTime(),
    );
  }
  return grouped;
}

function calculateProviderLoad(
  reservations: readonly ActiveAppointmentStepRecord[],
): ReadonlyMap<string, number> {
  const load = new Map<string, number>();
  for (const reservation of reservations) {
    const minutes =
      (reservation.endsAt.getTime() - reservation.startsAt.getTime()) / MINUTE_MS;
    load.set(
      reservation.providerUserId,
      (load.get(reservation.providerUserId) ?? 0) + minutes,
    );
  }
  return load;
}

function buildTimedSteps(
  services: readonly RequestedServiceStep[],
  appointmentStartMs: number,
): readonly OccupiedInterval[] {
  const steps: OccupiedInterval[] = [];
  let startsAtMs = appointmentStartMs;
  for (const service of services) {
    const endsAtMs = startsAtMs + service.durationMinutes * MINUTE_MS;
    steps.push({ startsAtMs, endsAtMs });
    startsAtMs = endsAtMs;
  }
  return steps;
}

function buildCandidates(options: {
  request: RequestedServiceStep;
  step: OccupiedInterval;
  providers: readonly string[];
  availabilityByProvider: ReadonlyMap<
    string,
    readonly ProviderAvailabilityRecord[]
  >;
  reservationsByProvider: ReadonlyMap<
    string,
    readonly ActiveAppointmentStepRecord[]
  >;
  providerLoad: ReadonlyMap<string, number>;
}): readonly CandidateAssignment[] {
  const occupied = {
    startsAtMs:
      options.step.startsAtMs -
      (options.request.bufferBeforeMinutes ?? 0) * MINUTE_MS,
    endsAtMs:
      options.step.endsAtMs +
      (options.request.bufferAfterMinutes ?? 0) * MINUTE_MS,
  };
  return options.providers
    .filter((providerUserId) => {
      const availability = options.availabilityByProvider.get(providerUserId) ?? [];
      const hasCoveringAvailability = availability.some(
        (record) =>
          record.kind === 'Available' &&
          contains(record, occupied.startsAtMs, occupied.endsAtMs),
      );
      const hasUnavailability = availability.some(
        (record) =>
          record.kind === 'Unavailable' &&
          overlaps(record, occupied.startsAtMs, occupied.endsAtMs),
      );
      const hasReservation = (
        options.reservationsByProvider.get(providerUserId) ?? []
      ).some((record) => overlaps(record, occupied.startsAtMs, occupied.endsAtMs));
      return hasCoveringAvailability && !hasUnavailability && !hasReservation;
    })
    .map((providerUserId) => ({
      providerUserId,
      occupied,
      preferencePenalty:
        options.request.preferredProviderUserId === undefined ||
        options.request.preferredProviderUserId === providerUserId
          ? 0
          : 1,
      loadMinutes: options.providerLoad.get(providerUserId) ?? 0,
    }))
    .sort(
      (left, right) =>
        left.preferencePenalty - right.preferencePenalty ||
        left.loadMinutes - right.loadMinutes ||
        left.providerUserId.localeCompare(right.providerUserId),
    );
}

function contains(
  record: { startsAt: Date; endsAt: Date },
  startsAtMs: number,
  endsAtMs: number,
): boolean {
  return record.startsAt.getTime() <= startsAtMs && record.endsAt.getTime() >= endsAtMs;
}

function overlaps(
  record: { startsAt: Date; endsAt: Date },
  startsAtMs: number,
  endsAtMs: number,
): boolean {
  return record.startsAt.getTime() < endsAtMs && record.endsAt.getTime() > startsAtMs;
}

function chooseBestAssignment(
  candidatesByStep: readonly (readonly CandidateAssignment[])[],
  maxSearchNodes: number,
): { providers?: readonly string[]; searchNodes: number; truncated: boolean } {
  let best: BestAssignment | undefined;
  let searchNodes = 0;
  let truncated = false;
  const providers: string[] = [];
  const occupiedByProvider = new Map<string, OccupiedInterval[]>();

  const visit = (
    stepIndex: number,
    preferencePenalty: number,
    handoffs: number,
    loadMinutes: number,
  ): void => {
    if (searchNodes >= maxSearchNodes) {
      truncated = true;
      return;
    }
    searchNodes += 1;
    if (best && isPartialScoreWorse({ preferencePenalty, handoffs, loadMinutes }, best.score)) {
      return;
    }
    if (stepIndex === candidatesByStep.length) {
      const score: AssignmentScore = {
        preferencePenalty,
        handoffs,
        loadMinutes,
        providerKey: providers.join('|'),
      };
      if (!best || compareScore(score, best.score) < 0) {
        best = { score, providers: [...providers] };
      }
      return;
    }

    const previousProvider = providers.at(-1);
    const candidates = [...(candidatesByStep[stepIndex] ?? [])].sort(
      (left, right) =>
        Number(right.providerUserId === previousProvider) -
          Number(left.providerUserId === previousProvider) ||
        left.preferencePenalty - right.preferencePenalty ||
        left.loadMinutes - right.loadMinutes ||
        left.providerUserId.localeCompare(right.providerUserId),
    );
    for (const candidate of candidates) {
      if (truncated) return;
      const internalAssignments =
        occupiedByProvider.get(candidate.providerUserId) ?? [];
      if (
        internalAssignments.some(
          (interval) =>
            interval.startsAtMs < candidate.occupied.endsAtMs &&
            interval.endsAtMs > candidate.occupied.startsAtMs,
        )
      ) {
        continue;
      }
      providers.push(candidate.providerUserId);
      occupiedByProvider.set(candidate.providerUserId, [
        ...internalAssignments,
        candidate.occupied,
      ]);
      visit(
        stepIndex + 1,
        preferencePenalty + candidate.preferencePenalty,
        handoffs +
          (previousProvider !== undefined &&
          previousProvider !== candidate.providerUserId
            ? 1
            : 0),
        loadMinutes + candidate.loadMinutes,
      );
      providers.pop();
      if (internalAssignments.length === 0) {
        occupiedByProvider.delete(candidate.providerUserId);
      } else {
        occupiedByProvider.set(candidate.providerUserId, internalAssignments);
      }
    }
  };

  visit(0, 0, 0, 0);
  return { providers: best?.providers, searchNodes, truncated };
}

function isPartialScoreWorse(
  partial: Omit<AssignmentScore, 'providerKey'>,
  best: AssignmentScore,
): boolean {
  return (
    partial.preferencePenalty > best.preferencePenalty ||
    (partial.preferencePenalty === best.preferencePenalty &&
      partial.handoffs > best.handoffs) ||
    (partial.preferencePenalty === best.preferencePenalty &&
      partial.handoffs === best.handoffs &&
      partial.loadMinutes > best.loadMinutes)
  );
}

function compareScore(left: AssignmentScore, right: AssignmentScore): number {
  return (
    left.preferencePenalty - right.preferencePenalty ||
    left.handoffs - right.handoffs ||
    left.loadMinutes - right.loadMinutes ||
    left.providerKey.localeCompare(right.providerKey)
  );
}

function createPlan(
  timedSteps: readonly OccupiedInterval[],
  services: readonly RequestedServiceStep[],
  providers: readonly string[],
): AppointmentPlan {
  const steps: AppointmentPlanStep[] = timedSteps.map((step, index) => ({
    sequenceNumber: index + 1,
    serviceId: services[index]?.serviceId ?? '',
    providerUserId: providers[index] ?? '',
    startsAt: new Date(step.startsAtMs),
    endsAt: new Date(step.endsAtMs),
  }));
  let handoffCount = 0;
  for (let index = 1; index < providers.length; index += 1) {
    if (providers[index] !== providers[index - 1]) handoffCount += 1;
  }
  return {
    startsAt: steps[0]?.startsAt ?? new Date(0),
    endsAt: steps.at(-1)?.endsAt ?? new Date(0),
    handoffCount,
    steps,
  };
}

function alignUp(value: number, anchor: number, interval: number): number {
  const remainder = (value - anchor) % interval;
  return remainder === 0 ? value : value + interval - remainder;
}

function hasLaterCandidate(
  currentStart: number,
  latestEnd: number,
  duration: number,
  interval: number,
  allIntervals: readonly OpenInterval[],
  currentInterval: OpenInterval,
): boolean {
  if (currentStart + interval + duration <= latestEnd) return true;
  return allIntervals.some(
    (intervalRecord) => intervalRecord.startsAtMs > currentInterval.startsAtMs,
  );
}

function resultWithDiagnostic(
  code: SchedulingDiagnostic['code'],
): CompoundSchedulingResult {
  return {
    plans: [],
    diagnostics: [{ code }],
    searchNodes: 0,
    truncated: false,
  };
}
