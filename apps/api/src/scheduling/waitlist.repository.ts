import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import {
  TenantDatabaseService,
  type TenantTransaction,
} from '../database/tenant-database.service';
import { TenantScope } from '../tenancy/tenant-scope';
import { NotificationOutboxRepository } from '../notifications/notification-outbox.repository';
import { CustomerRepository } from './customer.repository';
import type { PublicBusinessSchedulingContext } from './scheduling.types';
import {
  DuplicateWaitlistEntryError,
  InvalidWaitlistRequestError,
} from './waitlist.errors';
import type {
  CreatedWaitlistEntry,
  CreateWaitlistEntryCommand,
} from './waitlist.types';
import { WaitlistOfferTokenService } from './waitlist-offer-token.service';
import { ManagementTokenService } from './management-token.service';
import {
  WaitlistOfferExpiredError,
  WaitlistOfferInvalidError,
} from './waitlist.errors';
import type { AcceptedWaitlistOffer } from './waitlist.types';

interface WaitlistEntryRow {
  id: string;
  createdAt: Date;
}

interface MatchRequestRow {
  id: string;
  businessId: string;
  attemptCount: number;
}

interface SourceAppointmentRow {
  id: string;
  locationId: string;
  startsAt: Date;
  endsAt: Date;
  totalPriceMinor: number;
  currency: string;
}

interface SourceStepRow {
  serviceId: string;
  providerUserId: string;
  sequenceNumber: number;
  startsAt: Date;
  endsAt: Date;
  serviceName: string;
  durationMinutes: number;
  priceMinor: number;
  currency: string;
}

interface MatchCandidateRow {
  entryId: string;
  customerId: string;
  customerFirstName: string;
  customerEmail: string | null;
  customerPhoneE164: string;
}

interface BusinessRow {
  name: string;
  slug: string;
  timezone: string;
}

interface ActiveOfferRow {
  offerId: string;
  entryId: string;
  appointmentId: string;
  appointmentCreatedAt: Date;
  startsAt: Date;
  endsAt: Date;
  totalPriceMinor: number;
  currency: string;
  expiresAt: Date;
  status: 'Active' | 'Accepted' | 'Expired' | 'Rejected';
  customerFirstName: string;
  customerEmail: string | null;
  customerPhoneE164: string;
}

interface OfferPointerRow {
  offerId: string;
  businessId: string;
}

@Injectable()
export class WaitlistRepository {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly customers: CustomerRepository,
    private readonly systemDatabase: DatabaseService,
    private readonly tokens: WaitlistOfferTokenService,
    private readonly notifications: NotificationOutboxRepository,
    private readonly managementTokens: ManagementTokenService,
  ) {}

  async enqueueMatchRequest(
    transaction: TenantTransaction,
    locationId: string,
    sourceAppointmentId: string,
    availableAt: Date,
  ): Promise<void> {
    await transaction.query(
      `insert into waitlist_match_requests
         (business_id, location_id, source_appointment_id, available_at)
       values ($1, $2, $3, $4)
       on conflict (source_appointment_id) do nothing`,
      [locationId, sourceAppointmentId, availableAt],
    );
  }

  async processNextMatch(now = new Date()): Promise<boolean> {
    const candidates = await this.systemDatabase.query<MatchRequestRow>(
      `select id,
              business_id as "businessId",
              attempt_count as "attemptCount"
       from waitlist_match_requests
       where status in ('Pending', 'RetryScheduled')
         and available_at <= $1
       order by available_at, created_at, id
       limit 1`,
      [now],
    );
    const candidate = candidates[0];
    if (!candidate) return false;
    const scope = TenantScope.forBusiness(candidate.businessId);
    try {
      await this.database.transaction(scope, async (transaction) => {
        const claimed = await transaction.query<MatchRequestRow>(
          `select id,
                  business_id as "businessId",
                  attempt_count as "attemptCount"
           from waitlist_match_requests
           where business_id = $1
             and id = $2
             and status in ('Pending', 'RetryScheduled')
             and available_at <= $3
           for update skip locked`,
          [candidate.id, now],
        );
        if (!claimed[0]) return;
        await transaction.query(
          `update waitlist_match_requests
           set status = 'Processing',
               attempt_count = attempt_count + 1,
               locked_at = $2
           where business_id = $1 and id = $3`,
          [now, candidate.id],
        );
        await this.createOffer(
          transaction,
          candidate.id,
          candidate.businessId,
          now,
        );
      });
    } catch (error) {
      await this.finishFailedMatch(scope, candidate, error, now);
    }
    return true;
  }

  accept(
    scope: TenantScope,
    offerTokenHash: string,
    context: PublicBusinessSchedulingContext,
    now = new Date(),
  ): Promise<AcceptedWaitlistOffer> {
    return this.database.transaction(scope, async (transaction) => {
      const rows = await transaction.query<ActiveOfferRow>(
        `select o.id as "offerId",
                o.waitlist_entry_id as "entryId",
                o.status,
                o.expires_at as "expiresAt",
                a.id as "appointmentId",
                a.created_at as "appointmentCreatedAt",
                a.starts_at as "startsAt",
                a.ends_at as "endsAt",
                a.total_price_minor as "totalPriceMinor",
                a.currency,
                c.first_name as "customerFirstName",
                c.email::text as "customerEmail",
                c.phone_e164 as "customerPhoneE164"
         from waitlist_offers o
         join appointments a
           on a.business_id = o.business_id and a.id = o.hold_appointment_id
         join customers c
           on c.business_id = a.business_id and c.id = a.customer_id
         where o.business_id = $1
           and o.offer_token_hash = $2
         for update of o, a`,
        [offerTokenHash],
      );
      const offer = rows[0];
      if (!offer || offer.status !== 'Active') {
        throw new WaitlistOfferInvalidError();
      }
      if (offer.expiresAt.getTime() <= now.getTime()) {
        throw new WaitlistOfferExpiredError();
      }
      const managementToken = this.managementTokens.issue(
        scope.businessId,
        offer.offerId,
        now,
      );
      await transaction.query(
        `update appointments
         set status = 'Confirmed',
             management_token_hash = $2,
             management_token_expires_at = $3
         where business_id = $1
           and id = $4
           and status = 'Pending'`,
        [
          managementToken.hash,
          managementToken.expiresAt,
          offer.appointmentId,
        ],
      );
      await transaction.query(
        `update waitlist_offers
         set status = 'Accepted', accepted_at = $2
         where business_id = $1 and id = $3`,
        [now, offer.offerId],
      );
      await transaction.query(
        `update waitlist_entries
         set status = 'Fulfilled'
         where business_id = $1 and id = $2`,
        [offer.entryId],
      );
      await transaction.query(
        `insert into waitlist_events
           (business_id, waitlist_entry_id, waitlist_offer_id, kind, metadata)
         values ($1, $2, $3, 'Accepted', $4::jsonb)`,
        [
          offer.entryId,
          offer.offerId,
          JSON.stringify({
            appointmentId: offer.appointmentId,
            recoveredRevenueMinor: offer.totalPriceMinor,
            currency: offer.currency,
          }),
        ],
      );
      const steps = await transaction.query<SourceStepRow>(
        `select service_id as "serviceId",
                provider_user_id as "providerUserId",
                sequence_number as "sequenceNumber",
                starts_at as "startsAt",
                ends_at as "endsAt",
                service_name_snapshot as "serviceName",
                duration_minutes_snapshot as "durationMinutes",
                price_minor_snapshot as "priceMinor",
                currency_snapshot as currency
         from appointment_steps
         where business_id = $1 and appointment_id = $2
         order by sequence_number`,
        [offer.appointmentId],
      );
      await this.notifications.enqueueBooking(transaction, {
        appointmentId: offer.appointmentId,
        appointmentCreatedAt: offer.appointmentCreatedAt,
        startsAt: offer.startsAt,
        endsAt: offer.endsAt,
        businessName: context.businessName,
        timezone: context.timezone,
        customerFirstName: offer.customerFirstName,
        customerEmail: offer.customerEmail ?? undefined,
        customerPhoneE164: offer.customerPhoneE164,
        steps,
        confirmationKind: 'WaitlistAccepted',
      });
      return {
        appointmentId: offer.appointmentId,
        status: 'Confirmed',
        managementToken: managementToken.token,
        managementTokenExpiresAt: managementToken.expiresAt,
        startsAt: offer.startsAt,
        endsAt: offer.endsAt,
        totalPriceMinor: offer.totalPriceMinor,
        currency: offer.currency,
        steps: steps.map((step) => ({
          sequenceNumber: step.sequenceNumber,
          serviceId: step.serviceId,
          startsAt: step.startsAt,
          endsAt: step.endsAt,
        })),
      };
    });
  }

  async reject(
    scope: TenantScope,
    offerTokenHash: string,
    now = new Date(),
  ): Promise<void> {
    const closed = await this.closeOffer(
      scope,
      { offerTokenHash },
      'Rejected',
      now,
    );
    if (!closed) throw new WaitlistOfferInvalidError();
  }

  async expireNextOffer(now = new Date()): Promise<boolean> {
    const rows = await this.systemDatabase.query<OfferPointerRow>(
      `select id as "offerId", business_id as "businessId"
       from waitlist_offers
       where status = 'Active' and expires_at <= $1
       order by expires_at, created_at, id
       limit 1`,
      [now],
    );
    const offer = rows[0];
    if (!offer) return false;
    await this.closeOffer(
      TenantScope.forBusiness(offer.businessId),
      { offerId: offer.offerId },
      'Expired',
      now,
    );
    return true;
  }

  private closeOffer(
    scope: TenantScope,
    selector: { offerId?: string; offerTokenHash?: string },
    outcome: 'Expired' | 'Rejected',
    now: Date,
  ): Promise<boolean> {
    return this.database.transaction(scope, async (transaction) => {
      const rows = await transaction.query<{
        offerId: string;
        entryId: string;
        sourceAppointmentId: string;
        holdAppointmentId: string;
        locationId: string;
      }>(
        `select id as "offerId",
                waitlist_entry_id as "entryId",
                source_appointment_id as "sourceAppointmentId",
                hold_appointment_id as "holdAppointmentId",
                location_id as "locationId"
         from waitlist_offers
         where business_id = $1
           and status = 'Active'
           and ($2::uuid is null or id = $2)
           and ($3::text is null or offer_token_hash = $3)
         for update skip locked`,
        [selector.offerId ?? null, selector.offerTokenHash ?? null],
      );
      const offer = rows[0];
      if (!offer) return false;
      await transaction.query(
        `update waitlist_offers
         set status = $2::waitlist_offer_status,
             expired_at = case when $2 = 'Expired' then $3 else expired_at end,
             rejected_at = case when $2 = 'Rejected' then $3 else rejected_at end
         where business_id = $1 and id = $4`,
        [outcome, now, offer.offerId],
      );
      await transaction.query(
        `update waitlist_entries
         set status = 'Active'
         where business_id = $1 and id = $2 and status = 'Offered'`,
        [offer.entryId],
      );
      await transaction.query(
        `update appointment_steps
         set status = 'Cancelled'
         where business_id = $1
           and appointment_id = $2
           and status in ('Scheduled', 'InProgress')`,
        [offer.holdAppointmentId],
      );
      await transaction.query(
        `update appointments
         set status = 'Cancelled', cancelled_at = $2
         where business_id = $1 and id = $3 and status = 'Pending'`,
        [now, offer.holdAppointmentId],
      );
      await transaction.query(
        `update notification_jobs
         set status = 'Cancelled', cancelled_at = $2,
             locked_at = null, locked_by = null
         where business_id = $1
           and appointment_id = $3
           and status in ('Pending', 'Processing', 'RetryScheduled')`,
        [now, offer.holdAppointmentId],
      );
      await transaction.query(
        `insert into waitlist_events
           (business_id, waitlist_entry_id, waitlist_offer_id, kind, metadata)
         values ($1, $2, $3, $4, $5::jsonb)`,
        [offer.entryId, offer.offerId, outcome, JSON.stringify({ at: now.toISOString() })],
      );
      await transaction.query(
        `insert into waitlist_match_requests
           (business_id, location_id, source_appointment_id, status, available_at)
         values ($1, $2, $3, 'Pending', $4)
         on conflict (source_appointment_id) do update set
           status = 'Pending', available_at = excluded.available_at,
           locked_at = null, locked_by = null, last_error = null`,
        [offer.locationId, offer.sourceAppointmentId, now],
      );
      return true;
    });
  }

  private async createOffer(
    transaction: TenantTransaction,
    matchRequestId: string,
    businessId: string,
    now: Date,
  ): Promise<void> {
    const sourceRows = await transaction.query<SourceAppointmentRow>(
      `select a.id,
              a.location_id as "locationId",
              a.starts_at as "startsAt",
              a.ends_at as "endsAt",
              a.total_price_minor as "totalPriceMinor",
              a.currency
       from waitlist_match_requests r
       join appointments a
         on a.business_id = r.business_id
        and a.location_id = r.location_id
        and a.id = r.source_appointment_id
       where r.business_id = $1
         and r.id = $2
         and r.status = 'Processing'
         and a.status = 'Cancelled'`,
      [matchRequestId],
    );
    const source = sourceRows[0];
    if (!source) {
      await this.completeMatch(transaction, matchRequestId);
      return;
    }
    const steps = await transaction.query<SourceStepRow>(
      `select service_id as "serviceId",
              provider_user_id as "providerUserId",
              sequence_number as "sequenceNumber",
              starts_at as "startsAt",
              ends_at as "endsAt",
              service_name_snapshot as "serviceName",
              duration_minutes_snapshot as "durationMinutes",
              price_minor_snapshot as "priceMinor",
              currency_snapshot as currency
       from appointment_steps
       where business_id = $1
         and appointment_id = $2
       order by sequence_number`,
      [source.id],
    );
    const matches = await transaction.query<MatchCandidateRow>(
      `select e.id as "entryId",
              e.customer_id as "customerId",
              c.first_name as "customerFirstName",
              c.email::text as "customerEmail",
              c.phone_e164 as "customerPhoneE164"
       from waitlist_entries e
       join customers c
         on c.business_id = e.business_id and c.id = e.customer_id
       where e.business_id = $1
         and e.location_id = $2
         and e.status = 'Active'
         and e.window_starts_at <= $3
         and e.window_ends_at >= $4
         and array(
           select s.service_id
           from waitlist_entry_services s
           where s.business_id = e.business_id
             and s.waitlist_entry_id = e.id
           order by s.sequence_number
         ) = $5::uuid[]
         and not exists (
           select 1 from waitlist_offers o
           where o.source_appointment_id = $6 and o.waitlist_entry_id = e.id
         )
       order by e.created_at, e.id
       for update of e skip locked
       limit 1`,
      [
        source.locationId,
        source.startsAt,
        source.endsAt,
        steps.map((step) => step.serviceId),
        source.id,
      ],
    );
    const match = matches[0];
    if (!match) {
      await this.completeMatch(transaction, matchRequestId);
      return;
    }
    const holdRows = await transaction.query<{ id: string; createdAt: Date }>(
      `insert into appointments
         (business_id, location_id, customer_id, status, starts_at, ends_at,
          total_price_minor, currency)
       values ($1, $2, $3, 'Pending', $4, $5, $6, $7)
       returning id, created_at as "createdAt"`,
      [
        source.locationId,
        match.customerId,
        source.startsAt,
        source.endsAt,
        source.totalPriceMinor,
        source.currency,
      ],
    );
    const hold = holdRows[0];
    if (!hold) throw new Error('Waitlist hold appointment was not created');
    for (const step of steps) {
      await transaction.query(
        `insert into appointment_steps
           (business_id, location_id, appointment_id, service_id,
            provider_user_id, sequence_number, status, starts_at, ends_at,
            service_name_snapshot, duration_minutes_snapshot,
            price_minor_snapshot, currency_snapshot)
         values ($1, $2, $3, $4, $5, $6, 'Scheduled', $7, $8, $9, $10, $11, $12)`,
        [
          source.locationId,
          hold.id,
          step.serviceId,
          step.providerUserId,
          step.sequenceNumber,
          step.startsAt,
          step.endsAt,
          step.serviceName,
          step.durationMinutes,
          step.priceMinor,
          step.currency,
        ],
      );
    }
    const offerId = randomUUID();
    const token = this.tokens.issue(businessId, offerId, now);
    const businessRows = await transaction.query<BusinessRow>(
      `select name, slug, timezone
       from businesses
       where id = $1`,
    );
    const business = businessRows[0];
    if (!business) throw new Error('Waitlist business was not found');
    await transaction.query(
      `insert into waitlist_offers
         (id, business_id, location_id, waitlist_entry_id,
          source_appointment_id, hold_appointment_id, offer_token_hash, expires_at)
       values ($2, $1, $3, $4, $5, $6, $7, $8)`,
      [
        offerId,
        source.locationId,
        match.entryId,
        source.id,
        hold.id,
        token.hash,
        token.expiresAt,
      ],
    );
    await transaction.query(
      `update waitlist_entries
       set status = 'Offered'
       where business_id = $1 and id = $2`,
      [match.entryId],
    );
    await transaction.query(
      `insert into waitlist_events
         (business_id, waitlist_entry_id, waitlist_offer_id, kind, metadata)
       values ($1, $2, $3, 'Offered', $4::jsonb)`,
      [
        match.entryId,
        offerId,
        JSON.stringify({
          sourceAppointmentId: source.id,
          holdAppointmentId: hold.id,
          expiresAt: token.expiresAt.toISOString(),
        }),
      ],
    );
    await this.notifications.enqueueWaitlistOffer(transaction, {
      offerId,
      holdAppointmentId: hold.id,
      startsAt: source.startsAt,
      endsAt: source.endsAt,
      expiresAt: token.expiresAt,
      businessName: business.name,
      businessSlug: business.slug,
      timezone: business.timezone,
      customerFirstName: match.customerFirstName,
      customerEmail: match.customerEmail ?? undefined,
      customerPhoneE164: match.customerPhoneE164,
      offerToken: token.token,
      offeredAt: now,
      steps,
    });
    await this.completeMatch(transaction, matchRequestId);
  }

  private async completeMatch(
    transaction: TenantTransaction,
    matchRequestId: string,
  ): Promise<void> {
    await transaction.query(
      `update waitlist_match_requests
       set status = 'Completed',
           locked_at = null,
           locked_by = null,
           last_error = null
       where business_id = $1 and id = $2`,
      [matchRequestId],
    );
  }

  private async finishFailedMatch(
    scope: TenantScope,
    request: MatchRequestRow,
    error: unknown,
    now: Date,
  ): Promise<void> {
    const attemptCount = request.attemptCount + 1;
    const status = isExclusionError(error)
      ? 'Completed'
      : attemptCount >= 5
        ? 'Failed'
        : 'RetryScheduled';
    const delaySeconds = Math.min(300, 30 * 2 ** Math.max(0, attemptCount - 1));
    const message = error instanceof Error ? error.message.slice(0, 2_000) : 'Unknown waitlist matcher error';
    await this.database.transaction(scope, async (transaction) => {
      await transaction.query(
        `update waitlist_match_requests
         set status = $2::waitlist_match_status,
             attempt_count = $7,
             available_at = $3::timestamptz + ($4::integer * interval '1 second'),
             locked_at = null,
             locked_by = null,
             last_error = $5
         where business_id = $1 and id = $6`,
        [status, now, delaySeconds, message, request.id, attemptCount],
      );
    });
  }

  create(
    scope: TenantScope,
    context: PublicBusinessSchedulingContext,
    command: CreateWaitlistEntryCommand,
  ): Promise<CreatedWaitlistEntry> {
    return this.database.transaction(scope, (transaction) =>
      this.createInTransaction(transaction, context, command),
    );
  }

  private async createInTransaction(
    transaction: TenantTransaction,
    context: PublicBusinessSchedulingContext,
    command: CreateWaitlistEntryCommand,
  ): Promise<CreatedWaitlistEntry> {
    const serviceRows = await transaction.query<{ id: string }>(
      `select id
       from services
       where business_id = $1
         and id = any($2::uuid[])
         and active`,
      [[...new Set(command.serviceIds)]],
    );
    if (serviceRows.length !== new Set(command.serviceIds).size) {
      throw new InvalidWaitlistRequestError(
        'One or more selected services are unavailable',
      );
    }
    const customer = await this.customers.findOrCreate(
      transaction,
      command.customer,
    );
    const rows = await transaction.query<WaitlistEntryRow>(
      `insert into waitlist_entries
         (business_id, location_id, customer_id, status,
          window_starts_at, window_ends_at, demand_fingerprint)
       values ($1, $2, $3, 'Active', $4, $5, $6)
       on conflict (business_id, demand_fingerprint)
         where status in ('Active', 'Offered')
       do nothing
       returning id, created_at as "createdAt"`,
      [
        context.locationId,
        customer.id,
        command.windowStartsAt,
        command.windowEndsAt,
        command.demandFingerprint,
      ],
    );
    const entry = rows[0];
    if (!entry) throw new DuplicateWaitlistEntryError();

    await transaction.query(
      `insert into waitlist_entry_services
         (business_id, location_id, waitlist_entry_id,
          service_id, sequence_number)
       select $1, $2, $3, service_id, sequence_number
       from unnest($4::uuid[]) with ordinality
         as selected(service_id, sequence_number)`,
      [context.locationId, entry.id, command.serviceIds],
    );
    await transaction.query(
      `insert into waitlist_events
         (business_id, waitlist_entry_id, kind, metadata)
       values ($1, $2, 'Registered', $3::jsonb)`,
      [
        entry.id,
        JSON.stringify({
          windowStartsAt: command.windowStartsAt.toISOString(),
          windowEndsAt: command.windowEndsAt.toISOString(),
          serviceCount: command.serviceIds.length,
        }),
      ],
    );
    return {
      waitlistEntryId: entry.id,
      status: 'Active',
      windowStartsAt: command.windowStartsAt,
      windowEndsAt: command.windowEndsAt,
      serviceIds: command.serviceIds,
    };
  }
}

function isExclusionError(error: unknown): error is { code: '23P01' } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23P01'
  );
}
