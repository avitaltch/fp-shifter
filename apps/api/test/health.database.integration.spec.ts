import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/bootstrap';
import { NotificationWorkerService } from '../src/notifications/notification-worker.service';
import { NotificationWorkerRepository } from '../src/notifications/notification-worker.repository';
import { SchedulingRepository } from '../src/scheduling/scheduling.repository';
import { TenantScope } from '../src/tenancy/tenant-scope';

const HAPPY_PETS_BUSINESS_ID = '00000000-0000-4000-8000-000000000001';
const HAPPY_PETS_LOCATION_ID = '00000000-0000-4000-8000-000000000101';
const BEAUTY_BUSINESS_ID = '00000000-0000-4000-8000-000000000002';
const BEAUTY_LOCATION_ID = '00000000-0000-4000-8000-000000000102';
const PET_TRIM_SERVICE_ID = '00000000-0000-4000-8000-000000000401';
const VACCINATION_SERVICE_ID = '00000000-0000-4000-8000-000000000402';
const BEAUTY_SERVICE_ID = '00000000-0000-4000-8000-000000000403';
const BEAUTY_PROVIDER_ID = '00000000-0000-4000-8000-000000000203';

describe('AppModule with PostgreSQL', () => {
  let app: INestApplication;
  let databaseClient: Client;
  let schedulingRepository: SchedulingRepository;
  let notificationWorker: NotificationWorkerService;
  let notificationWorkerRepository: NotificationWorkerRepository;

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required for integration tests');
    }

    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication({ logger: false });
    configureApplication(app, { corsOrigins: [], enableSwagger: false });
    await app.init();
    schedulingRepository = app.get(SchedulingRepository);
    notificationWorker = app.get(NotificationWorkerService);
    notificationWorkerRepository = app.get(NotificationWorkerRepository);

    databaseClient = new Client({ connectionString: databaseUrl });
    await databaseClient.connect();
  });

  afterAll(async () => {
    await databaseClient?.end();
    await app?.close();
  });

  it('reports real database readiness through the production module graph', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/health/ready')
      .expect('x-request-id', /.+/)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          status: 'ok',
          service: 'shiftsync-api',
          checks: { database: 'up' },
        });
      });
  });

  it('finds the deterministic tenant fixtures created by the seed', async () => {
    const result = await databaseClient.query<{ slug: string }>(
      `select slug
       from businesses
       where slug = any($1::text[])
       order by slug`,
      [['compound-beauty-demo', 'happy-pets-demo']],
    );

    expect(result.rows.map(({ slug }) => slug)).toEqual([
      'compound-beauty-demo',
      'happy-pets-demo',
    ]);
  });

  it('returns only services and skills owned by the requested tenant', async () => {
    const happyPetsScope = TenantScope.forBusiness(HAPPY_PETS_BUSINESS_ID);
    const beautyScope = TenantScope.forBusiness(BEAUTY_BUSINESS_ID);

    await expect(
      schedulingRepository.listActiveServices(happyPetsScope),
    ).resolves.toEqual([
      {
        id: PET_TRIM_SERVICE_ID,
        name: 'Pet Trim',
        description: 'Full pet grooming and trim',
        durationMinutes: 45,
        priceMinor: 12000,
        currency: 'ILS',
      },
      {
        id: VACCINATION_SERVICE_ID,
        name: 'Vaccination',
        description: 'Routine veterinarian vaccination',
        durationMinutes: 15,
        priceMinor: 8000,
        currency: 'ILS',
      },
    ]);
    await expect(
      schedulingRepository.listActiveServices(beautyScope),
    ).resolves.toEqual([
      {
        id: BEAUTY_SERVICE_ID,
        name: 'Haircut',
        description: 'Compound Beauty haircut',
        durationMinutes: 45,
        priceMinor: 15000,
        currency: 'ILS',
      },
    ]);

    const happySkills = await schedulingRepository.listProviderSkills(
      happyPetsScope,
      [PET_TRIM_SERVICE_ID, VACCINATION_SERVICE_ID, BEAUTY_SERVICE_ID],
    );
    expect(happySkills).toHaveLength(2);
    expect(happySkills.map(({ serviceId }) => serviceId)).toEqual([
      PET_TRIM_SERVICE_ID,
      VACCINATION_SERVICE_ID,
    ]);
  });

  it('returns a public business catalog without tenant identifiers', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/public/businesses/happy-pets-demo/catalog')
      .expect('x-request-id', /.+/)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          business: {
            slug: 'happy-pets-demo',
            name: 'Happy Pets Demo',
            locale: 'he-IL',
          },
          location: {
            name: 'Happy Pets — Tel Aviv',
            address: null,
            timezone: 'Asia/Jerusalem',
          },
        });
        expect(body.services).toEqual([
          {
            id: PET_TRIM_SERVICE_ID,
            name: 'Pet Trim',
            description: 'Full pet grooming and trim',
            durationMinutes: 45,
            priceMinor: 12000,
            currency: 'ILS',
          },
          {
            id: VACCINATION_SERVICE_ID,
            name: 'Vaccination',
            description: 'Routine veterinarian vaccination',
            durationMinutes: 15,
            priceMinor: 8000,
            currency: 'ILS',
          },
        ]);
        expect(JSON.stringify(body)).not.toContain(HAPPY_PETS_BUSINESS_ID);
        expect(JSON.stringify(body)).not.toContain(HAPPY_PETS_LOCATION_ID);
      });
  });

  it('returns a typed not-found response for an unknown public catalog', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/public/businesses/missing-business/catalog')
      .expect(404)
      .expect(({ body }) => {
        expect(body).toMatchObject({ code: 'BUSINESS_NOT_FOUND' });
      });
  });

  it('searches the seeded compound visit through the public API without exposing staff', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/public/businesses/happy-pets-demo/availability/search')
      .send({
        date: '2030-01-07',
        serviceIds: [PET_TRIM_SERVICE_ID, VACCINATION_SERVICE_ID],
      })
      .expect('x-request-id', /.+/)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          businessSlug: 'happy-pets-demo',
          date: '2030-01-07',
          serviceCount: 2,
          totalDurationMinutes: 60,
          totalPriceMinor: 20000,
          currency: 'ILS',
          diagnostics: [],
        });
        expect(body.slots[0]).toEqual({
          startsAt: '2030-01-07T07:45:00.000Z',
          endsAt: '2030-01-07T08:45:00.000Z',
        });
        expect(JSON.stringify(body)).not.toContain('providerUserId');
      });
  });

  it('rejects a service identifier owned by another public business', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/public/businesses/happy-pets-demo/availability/search')
      .send({ date: '2030-01-07', serviceIds: [BEAUTY_SERVICE_ID] })
      .expect(400)
      .expect(({ body }) => {
        expect(body).toMatchObject({ code: 'INVALID_SERVICE_SELECTION' });
      });
  });

  it('commits exactly one of two concurrent compound bookings with no partial loser', async () => {
    const phoneE164 = '+972501230099';
    const notes = `integration-concurrency-${Date.now()}`;
    const firstIdempotencyKey = randomUUID();
    const secondIdempotencyKey = randomUUID();
    const bookingRequest = {
      date: '2030-01-07',
      startsAt: '2030-01-07T12:00:00.000Z',
      serviceIds: [PET_TRIM_SERVICE_ID, VACCINATION_SERVICE_ID],
      customer: {
        firstName: 'Concurrency',
        lastName: 'Test',
        email: 'concurrency@example.test',
        phoneE164,
      },
      notes,
    };

    try {
      const responses = await Promise.all([
        request(app.getHttpServer())
          .post('/api/v1/public/businesses/happy-pets-demo/bookings')
          .set('Idempotency-Key', firstIdempotencyKey)
          .send(bookingRequest),
        request(app.getHttpServer())
          .post('/api/v1/public/businesses/happy-pets-demo/bookings')
          .set('Idempotency-Key', secondIdempotencyKey)
          .send(bookingRequest),
      ]);
      expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
      const winner = responses.find(({ status }) => status === 201);
      const loser = responses.find(({ status }) => status === 409);
      expect(winner?.body).toMatchObject({
        status: 'Confirmed',
        startsAt: '2030-01-07T12:00:00.000Z',
        endsAt: '2030-01-07T13:00:00.000Z',
        totalPriceMinor: 20000,
        currency: 'ILS',
      });
      expect(winner?.body.steps).toHaveLength(2);
      expect(JSON.stringify(winner?.body)).not.toContain('providerUserId');
      expect(loser?.body).toMatchObject({ code: 'PLAN_NO_LONGER_AVAILABLE' });

      const persisted = await databaseClient.query<{
        appointmentCount: number;
        stepCount: number;
      }>(
        `select count(distinct a.id)::integer as "appointmentCount",
                count(s.id)::integer as "stepCount"
         from appointments a
         left join appointment_steps s
           on s.business_id = a.business_id
          and s.appointment_id = a.id
         where a.business_id = $1
           and a.notes = $2`,
        [HAPPY_PETS_BUSINESS_ID, notes],
      );
      expect(persisted.rows[0]).toEqual({ appointmentCount: 1, stepCount: 2 });
    } finally {
      await databaseClient.query(
        `delete from appointments
         where business_id = $1
           and notes = $2`,
        [HAPPY_PETS_BUSINESS_ID, notes],
      );
      await databaseClient.query(
        `delete from customers
         where business_id = $1
           and phone_e164 = $2`,
        [HAPPY_PETS_BUSINESS_ID, phoneE164],
      );
    }
  });

  it('replays concurrent retries with one tenant-scoped idempotency key', async () => {
    const phoneE164 = '+972501230098';
    const notes = `integration-idempotency-${Date.now()}`;
    const idempotencyKey = randomUUID();
    const bookingRequest = {
      date: '2030-01-07',
      startsAt: '2030-01-07T13:30:00.000Z',
      serviceIds: [PET_TRIM_SERVICE_ID, VACCINATION_SERVICE_ID],
      customer: {
        firstName: 'Idempotency',
        lastName: 'Test',
        phoneE164,
      },
      notes,
    };

    try {
      const responses = await Promise.all([
        request(app.getHttpServer())
          .post('/api/v1/public/businesses/happy-pets-demo/bookings')
          .set('Idempotency-Key', idempotencyKey)
          .send(bookingRequest),
        request(app.getHttpServer())
          .post('/api/v1/public/businesses/happy-pets-demo/bookings')
          .set('Idempotency-Key', idempotencyKey)
          .send(bookingRequest),
      ]);
      expect(responses.map(({ status }) => status)).toEqual([201, 201]);
      expect(responses[0]?.body).toEqual(responses[1]?.body);

      await request(app.getHttpServer())
        .post('/api/v1/public/businesses/happy-pets-demo/bookings')
        .set('Idempotency-Key', idempotencyKey)
        .send({ ...bookingRequest, notes: `${notes}-different` })
        .expect(409)
        .expect(({ body }) => {
          expect(body).toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
        });

      const persisted = await databaseClient.query<{
        appointmentCount: number;
        stepCount: number;
      }>(
        `select count(distinct a.id)::integer as "appointmentCount",
                count(s.id)::integer as "stepCount"
         from appointments a
         left join appointment_steps s
           on s.business_id = a.business_id
          and s.appointment_id = a.id
         where a.business_id = $1
           and a.idempotency_key = $2`,
        [HAPPY_PETS_BUSINESS_ID, idempotencyKey],
      );
      expect(persisted.rows[0]).toEqual({ appointmentCount: 1, stepCount: 2 });
    } finally {
      await databaseClient.query(
        `delete from appointments
         where business_id = $1
           and idempotency_key = $2`,
        [HAPPY_PETS_BUSINESS_ID, idempotencyKey],
      );
      await databaseClient.query(
        `delete from customers
         where business_id = $1
           and phone_e164 = $2`,
        [HAPPY_PETS_BUSINESS_ID, phoneE164],
      );
    }
  });

  it('requires a UUID v4 idempotency key for public booking mutations', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/public/businesses/happy-pets-demo/bookings')
      .send({
        date: '2030-01-07',
        startsAt: '2030-01-07T13:30:00.000Z',
        serviceIds: [PET_TRIM_SERVICE_ID],
        customer: {
          firstName: 'Missing',
          lastName: 'Key',
          phoneE164: '+972501230097',
        },
      })
      .expect(400)
      .expect(({ body }) => {
        expect(body).toMatchObject({ code: 'INVALID_IDEMPOTENCY_KEY' });
      });
  });

  it('schedules reminders transactionally and delivers due jobs exactly once locally', async () => {
    const phoneE164 = '+972501230093';
    const notes = `integration-notifications-${Date.now()}`;
    const idempotencyKey = randomUUID();

    try {
      await databaseClient.query(
        `insert into business_notification_policies (business_id, manager_channel)
         values ($1, 'WhatsApp')
         on conflict (business_id) do update
         set manager_channel = excluded.manager_channel`,
        [HAPPY_PETS_BUSINESS_ID],
      );
      const bookingResponse = await request(app.getHttpServer())
        .post('/api/v1/public/businesses/happy-pets-demo/bookings')
        .set('Idempotency-Key', idempotencyKey)
        .send({
          date: '2030-01-07',
          startsAt: '2030-01-07T12:00:00.000Z',
          serviceIds: [PET_TRIM_SERVICE_ID, VACCINATION_SERVICE_ID],
          customer: {
            firstName: 'Notification',
            lastName: 'Test',
            email: 'notification@example.test',
            phoneE164,
          },
          notes,
        })
        .expect(201);
      const appointmentId = bookingResponse.body.appointmentId;
      const managementToken = bookingResponse.body.managementToken;

      const jobs = await databaseClient.query<{
        kind: string;
        channel: string;
        recipient: string;
        scheduledFor: Date;
        status: string;
        payload: {
          services: { providerName?: string }[];
        };
      }>(
        `select kind::text,
                channel::text,
                recipient,
                scheduled_for as "scheduledFor",
                status::text,
                payload
         from notification_jobs
         where business_id = $1
           and appointment_id = $2
         order by scheduled_for, kind`,
        [HAPPY_PETS_BUSINESS_ID, appointmentId],
      );
      expect(jobs.rows.map(({ kind }) => kind).sort()).toEqual([
        'BookingConfirmation',
        'ManagerCompoundVisit',
        'Reminder1h',
        'Reminder24h',
        'Reminder7d',
      ]);
      expect(
        jobs.rows.find(({ kind }) => kind === 'Reminder7d')?.scheduledFor,
      ).toEqual(new Date('2029-12-31T12:00:00.000Z'));
      expect(
        jobs.rows.find(({ kind }) => kind === 'Reminder24h')?.scheduledFor,
      ).toEqual(new Date('2030-01-06T12:00:00.000Z'));
      expect(
        jobs.rows.find(({ kind }) => kind === 'Reminder1h')?.scheduledFor,
      ).toEqual(new Date('2030-01-07T11:00:00.000Z'));
      expect(
        jobs.rows.find(({ kind }) => kind === 'ManagerCompoundVisit')?.payload
          .services,
      ).toEqual([
        expect.objectContaining({ providerName: 'Dana Groomer' }),
        expect.objectContaining({ providerName: 'Noa Veterinarian' }),
      ]);
      expect(
        jobs.rows.find(({ kind }) => kind === 'ManagerCompoundVisit'),
      ).toMatchObject({
        channel: 'WhatsApp',
        recipient: '+972501110001',
      });

      await expect(notificationWorker.runOnce()).resolves.toMatchObject({
        claimed: 2,
        sent: 2,
      });
      await expect(notificationWorker.runOnce()).resolves.toMatchObject({
        claimed: 0,
        sent: 0,
      });
      const firstDeliveries = await databaseClient.query<{ count: number }>(
        `select count(*)::integer as count
         from notification_fake_deliveries
         where business_id = $1
           and notification_job_id in (
             select id from notification_jobs
             where business_id = $1 and appointment_id = $2
           )`,
        [HAPPY_PETS_BUSINESS_ID, appointmentId],
      );
      expect(firstDeliveries.rows[0]?.count).toBe(2);

      await request(app.getHttpServer())
        .post(
          '/api/v1/public/businesses/happy-pets-demo/appointments/manage/cancel',
        )
        .set('Authorization', `Bearer ${managementToken}`)
        .expect(200);

      const postCancellationJobs = await databaseClient.query<{
        kind: string;
        status: string;
      }>(
        `select kind::text, status::text
         from notification_jobs
         where business_id = $1
           and appointment_id = $2
         order by kind`,
        [HAPPY_PETS_BUSINESS_ID, appointmentId],
      );
      expect(
        postCancellationJobs.rows
          .filter(({ kind }) => kind.startsWith('Reminder'))
          .map(({ status }) => status),
      ).toEqual(['Cancelled', 'Cancelled', 'Cancelled']);
      expect(postCancellationJobs.rows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: 'CustomerCancellation',
            status: 'Pending',
          }),
          expect.objectContaining({
            kind: 'ManagerCancellation',
            status: 'Pending',
          }),
        ]),
      );

      await expect(notificationWorker.runOnce()).resolves.toMatchObject({
        claimed: 2,
        sent: 2,
      });
      await expect(notificationWorker.runOnce()).resolves.toMatchObject({
        claimed: 0,
      });
      const finalDeliveries = await databaseClient.query<{ count: number }>(
        `select count(*)::integer as count
         from notification_fake_deliveries
         where business_id = $1
           and notification_job_id in (
             select id from notification_jobs
             where business_id = $1 and appointment_id = $2
           )`,
        [HAPPY_PETS_BUSINESS_ID, appointmentId],
      );
      expect(finalDeliveries.rows[0]?.count).toBe(4);
    } finally {
      await databaseClient.query(
        `delete from appointments
         where business_id = $1
           and idempotency_key = $2`,
        [HAPPY_PETS_BUSINESS_ID, idempotencyKey],
      );
      await databaseClient.query(
        `delete from customers
         where business_id = $1
           and phone_e164 = $2`,
        [HAPPY_PETS_BUSINESS_ID, phoneE164],
      );
      await databaseClient.query(
        `delete from business_notification_policies where business_id = $1`,
        [HAPPY_PETS_BUSINESS_ID],
      );
    }
  });

  it('recovers an abandoned lease and creates one fallback after terminal failure', async () => {
    const phoneE164 = '+972501230092';
    const email = 'fallback@example.test';
    const notes = `integration-notification-retry-${Date.now()}`;
    const idempotencyKey = randomUUID();

    try {
      await databaseClient.query(
        `insert into business_notification_policies
           (business_id, customer_primary_channel, customer_fallback_channel)
         values ($1, 'Sms', 'Email')
         on conflict (business_id) do update
         set customer_primary_channel = excluded.customer_primary_channel,
             customer_fallback_channel = excluded.customer_fallback_channel`,
        [HAPPY_PETS_BUSINESS_ID],
      );
      const bookingResponse = await request(app.getHttpServer())
        .post('/api/v1/public/businesses/happy-pets-demo/bookings')
        .set('Idempotency-Key', idempotencyKey)
        .send({
          date: '2030-01-07',
          startsAt: '2030-01-07T12:00:00.000Z',
          serviceIds: [PET_TRIM_SERVICE_ID],
          customer: {
            firstName: 'Fallback',
            lastName: 'Test',
            email,
            phoneE164,
          },
          notes,
        })
        .expect(201);
      const appointmentId = bookingResponse.body.appointmentId;
      await databaseClient.query(
        `update notification_jobs
         set max_attempts = 3
         where business_id = $1
           and appointment_id = $2
           and kind = 'BookingConfirmation'`,
        [HAPPY_PETS_BUSINESS_ID, appointmentId],
      );

      const firstClaimAt = new Date(Date.now() + 1_000);
      const firstClaim = await notificationWorkerRepository.claim(
        'abandoned-worker',
        10,
        300,
        firstClaimAt,
      );
      expect(firstClaim).toHaveLength(1);
      expect(firstClaim[0]).toMatchObject({
        kind: 'BookingConfirmation',
        attemptCount: 1,
        fallbackChannel: 'Email',
        fallbackRecipient: email,
      });

      const recoveredAt = new Date(firstClaimAt.getTime() + 301_000);
      const recoveredClaim = await notificationWorkerRepository.claim(
        'recovery-worker',
        10,
        300,
        recoveredAt,
      );
      const recoveredJob = recoveredClaim[0];
      expect(recoveredJob).toMatchObject({
        id: firstClaim[0]?.id,
        attemptCount: 2,
        lockedBy: 'recovery-worker',
      });
      if (!recoveredJob) throw new Error('Recovered notification job is missing');
      const secondAttemptFinishedAt = new Date(recoveredAt.getTime() + 10);
      await expect(
        notificationWorkerRepository.markFailed(
          recoveredJob,
          new Error('temporary provider failure'),
          recoveredAt,
          secondAttemptFinishedAt,
        ),
      ).resolves.toBe('RetryScheduled');
      const retryAt = new Date(secondAttemptFinishedAt.getTime() + 60_000);
      await expect(
        notificationWorkerRepository.claim(
          'early-worker',
          10,
          300,
          new Date(retryAt.getTime() - 1),
        ),
      ).resolves.toEqual([]);
      const finalClaim = await notificationWorkerRepository.claim(
        'terminal-worker',
        10,
        300,
        retryAt,
      );
      const terminalJob = finalClaim[0];
      expect(terminalJob).toMatchObject({
        id: recoveredJob.id,
        attemptCount: 3,
      });
      if (!terminalJob) throw new Error('Terminal notification job is missing');
      const terminalAttemptFinishedAt = new Date(retryAt.getTime() + 10);
      await expect(
        notificationWorkerRepository.markFailed(
          terminalJob,
          new Error('definitive provider failure'),
          retryAt,
          terminalAttemptFinishedAt,
        ),
      ).resolves.toBe('Failed');

      const fallback = await databaseClient.query<{
        channel: string;
        recipient: string;
        status: string;
        idempotencyKey: string;
      }>(
        `select channel::text,
                recipient,
                status::text,
                idempotency_key as "idempotencyKey"
         from notification_jobs
         where business_id = $1
           and appointment_id = $2
           and idempotency_key like '%:fallback:Email'`,
        [HAPPY_PETS_BUSINESS_ID, appointmentId],
      );
      expect(fallback.rows).toEqual([
        expect.objectContaining({
          channel: 'Email',
          recipient: email,
          status: 'Pending',
        }),
      ]);

      await expect(
        notificationWorker.runOnce(
          new Date(terminalAttemptFinishedAt.getTime() + 1_000),
        ),
      ).resolves.toMatchObject({ claimed: 1, sent: 1 });
      await expect(
        notificationWorker.runOnce(
          new Date(terminalAttemptFinishedAt.getTime() + 2_000),
        ),
      ).resolves.toMatchObject({ claimed: 0 });
      const audit = await databaseClient.query<{
        failedAttempts: number;
        fallbackDeliveries: number;
      }>(
        `select
           (select count(*)::integer
            from notification_attempts na
            join notification_jobs nj
              on nj.business_id = na.business_id
             and nj.id = na.notification_job_id
            where nj.business_id = $1
              and nj.appointment_id = $2
              and na.status = 'Failed') as "failedAttempts",
           (select count(*)::integer
            from notification_fake_deliveries d
            join notification_jobs nj
              on nj.business_id = d.business_id
             and nj.id = d.notification_job_id
            where nj.business_id = $1
              and nj.appointment_id = $2
              and d.channel = 'Email') as "fallbackDeliveries"`,
        [HAPPY_PETS_BUSINESS_ID, appointmentId],
      );
      expect(audit.rows[0]).toEqual({
        failedAttempts: 2,
        fallbackDeliveries: 1,
      });
    } finally {
      await databaseClient.query(
        `delete from appointments
         where business_id = $1
           and idempotency_key = $2`,
        [HAPPY_PETS_BUSINESS_ID, idempotencyKey],
      );
      await databaseClient.query(
        `delete from customers
         where business_id = $1
           and phone_e164 = $2`,
        [HAPPY_PETS_BUSINESS_ID, phoneE164],
      );
      await databaseClient.query(
        `delete from business_notification_policies where business_id = $1`,
        [HAPPY_PETS_BUSINESS_ID],
      );
    }
  });

  it('manages a booking with an expiring, revocable, tenant-scoped bearer token', async () => {
    const phoneE164 = '+972501230096';
    const notes = `integration-management-${Date.now()}`;
    const idempotencyKey = randomUUID();
    let appointmentId: string | undefined;

    try {
      const bookingResponse = await request(app.getHttpServer())
        .post('/api/v1/public/businesses/happy-pets-demo/bookings')
        .set('Idempotency-Key', idempotencyKey)
        .send({
          date: '2030-01-07',
          startsAt: '2030-01-07T12:00:00.000Z',
          serviceIds: [PET_TRIM_SERVICE_ID, VACCINATION_SERVICE_ID],
          customer: {
            firstName: 'Management',
            lastName: 'Test',
            phoneE164,
          },
          notes,
        })
        .expect(201);
      appointmentId = bookingResponse.body.appointmentId;
      const managementToken = bookingResponse.body.managementToken;
      expect(managementToken).toMatch(/^sm_[A-Za-z0-9_-]{43}$/);
      expect(bookingResponse.body.managementTokenExpiresAt).toMatch(/Z$/);

      const persistedToken = await databaseClient.query<{
        managementTokenHash: string;
      }>(
        `select management_token_hash as "managementTokenHash"
         from appointments
         where business_id = $1
           and id = $2`,
        [HAPPY_PETS_BUSINESS_ID, appointmentId],
      );
      expect(persistedToken.rows[0]?.managementTokenHash).toMatch(
        /^[a-f0-9]{64}$/,
      );
      expect(persistedToken.rows[0]?.managementTokenHash).not.toBe(
        managementToken,
      );

      await request(app.getHttpServer())
        .get('/api/v1/public/businesses/happy-pets-demo/appointments/manage')
        .set('Authorization', `Bearer ${managementToken}`)
        .expect(200)
        .expect(({ body }) => {
          expect(body).toMatchObject({
            appointmentId,
            status: 'Confirmed',
            customerFirstName: 'Management',
            timezone: 'Asia/Jerusalem',
          });
          expect(body.steps.map(({ serviceName }: { serviceName: string }) => serviceName))
            .toEqual(['Pet Trim', 'Vaccination']);
          expect(JSON.stringify(body)).not.toContain('providerUserId');
          expect(JSON.stringify(body)).not.toContain(managementToken);
        });

      await request(app.getHttpServer())
        .get('/api/v1/public/businesses/compound-beauty-demo/appointments/manage')
        .set('Authorization', `Bearer ${managementToken}`)
        .expect(404)
        .expect(({ body }) => {
          expect(body).toMatchObject({ code: 'APPOINTMENT_NOT_FOUND' });
        });

      await databaseClient.query(
        `update appointments
         set management_token_expires_at = now() - interval '1 second'
         where business_id = $1
           and id = $2`,
        [HAPPY_PETS_BUSINESS_ID, appointmentId],
      );
      await request(app.getHttpServer())
        .get('/api/v1/public/businesses/happy-pets-demo/appointments/manage')
        .set('Authorization', `Bearer ${managementToken}`)
        .expect(404);
      await databaseClient.query(
        `update appointments
         set management_token_expires_at = now() + interval '1 year'
         where business_id = $1
           and id = $2`,
        [HAPPY_PETS_BUSINESS_ID, appointmentId],
      );

      await request(app.getHttpServer())
        .post(
          '/api/v1/public/businesses/happy-pets-demo/appointments/manage/cancel',
        )
        .set('Authorization', `Bearer ${managementToken}`)
        .expect(200)
        .expect(({ body }) => {
          expect(body).toMatchObject({ appointmentId, status: 'Cancelled' });
        });

      const persistedCancellation = await databaseClient.query<{
        appointmentStatus: string;
        stepStatuses: string[];
      }>(
        `select a.status as "appointmentStatus",
                array_agg(s.status::text order by s.sequence_number) as "stepStatuses"
         from appointments a
         join appointment_steps s
           on s.business_id = a.business_id
          and s.appointment_id = a.id
         where a.business_id = $1
           and a.id = $2
         group by a.id`,
        [HAPPY_PETS_BUSINESS_ID, appointmentId],
      );
      expect(persistedCancellation.rows[0]).toEqual({
        appointmentStatus: 'Cancelled',
        stepStatuses: ['Cancelled', 'Cancelled'],
      });

      await request(app.getHttpServer())
        .post(
          '/api/v1/public/businesses/happy-pets-demo/appointments/manage/cancel',
        )
        .set('Authorization', `Bearer ${managementToken}`)
        .expect(200)
        .expect(({ body }) => {
          expect(body).toMatchObject({ status: 'Cancelled' });
        });

      await databaseClient.query(
        `update appointments
         set management_token_revoked_at = now()
         where business_id = $1
           and id = $2`,
        [HAPPY_PETS_BUSINESS_ID, appointmentId],
      );
      await request(app.getHttpServer())
        .get('/api/v1/public/businesses/happy-pets-demo/appointments/manage')
        .set('Authorization', `Bearer ${managementToken}`)
        .expect(404);
    } finally {
      await databaseClient.query(
        `delete from appointments
         where business_id = $1
           and idempotency_key = $2`,
        [HAPPY_PETS_BUSINESS_ID, idempotencyKey],
      );
      await databaseClient.query(
        `delete from customers
         where business_id = $1
           and phone_e164 = $2`,
        [HAPPY_PETS_BUSINESS_ID, phoneE164],
      );
    }
  });

  it('returns no location-owned records when a location belongs to another tenant', async () => {
    const happyPetsScope = TenantScope.forBusiness(HAPPY_PETS_BUSINESS_ID);
    const rangeStart = new Date('2030-01-07T06:00:00.000Z');
    const rangeEnd = new Date('2030-01-07T16:00:00.000Z');

    await expect(
      schedulingRepository.listBusinessHours(happyPetsScope, BEAUTY_LOCATION_ID),
    ).resolves.toEqual([]);
    await expect(
      schedulingRepository.listAvailability(
        happyPetsScope,
        BEAUTY_LOCATION_ID,
        rangeStart,
        rangeEnd,
      ),
    ).resolves.toEqual([]);
    await expect(
      schedulingRepository.listActiveAppointmentSteps(
        happyPetsScope,
        BEAUTY_LOCATION_ID,
        rangeStart,
        rangeEnd,
      ),
    ).resolves.toEqual([]);
  });

  it('stores an ordered compound visit with two qualified providers', async () => {
    const result = await databaseClient.query<{
      sequenceNumber: number;
      serviceId: string;
      providerUserId: string;
    }>(
      `select sequence_number as "sequenceNumber",
              service_id as "serviceId",
              provider_user_id as "providerUserId"
       from appointment_steps
       where business_id = $1
         and appointment_id = $2
       order by sequence_number`,
      [HAPPY_PETS_BUSINESS_ID, '00000000-0000-4000-8000-000000000901'],
    );

    expect(result.rows).toEqual([
      {
        sequenceNumber: 1,
        serviceId: PET_TRIM_SERVICE_ID,
        providerUserId: '00000000-0000-4000-8000-000000000201',
      },
      {
        sequenceNumber: 2,
        serviceId: VACCINATION_SERVICE_ID,
        providerUserId: '00000000-0000-4000-8000-000000000202',
      },
    ]);
  });

  it('rejects a cross-tenant provider skill at the database boundary', async () => {
    await expect(
      databaseClient.query(
        `insert into provider_skills
           (id, business_id, provider_user_id, service_id)
         values ($1, $2, $3, $4)`,
        [
          '00000000-0000-4000-8000-0000000006ff',
          HAPPY_PETS_BUSINESS_ID,
          BEAUTY_PROVIDER_ID,
          PET_TRIM_SERVICE_ID,
        ],
      ),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('rejects overlapping active work for a provider', async () => {
    await expect(
      databaseClient.query(
        `insert into appointment_steps
           (id, business_id, location_id, appointment_id, service_id,
            provider_user_id, sequence_number, starts_at, ends_at,
            service_name_snapshot, duration_minutes_snapshot,
            price_minor_snapshot, currency_snapshot)
         values ($1, $2, $3, $4, $5, $6, 3, $7, $8, 'Overlap', 20, 1000, 'ILS')`,
        [
          '00000000-0000-4000-8000-0000000009ff',
          HAPPY_PETS_BUSINESS_ID,
          HAPPY_PETS_LOCATION_ID,
          '00000000-0000-4000-8000-000000000901',
          PET_TRIM_SERVICE_ID,
          '00000000-0000-4000-8000-000000000201',
          '2030-01-07T07:30:00.000Z',
          '2030-01-07T07:50:00.000Z',
        ],
      ),
    ).rejects.toMatchObject({ code: '23P01' });
  });

  it('allows adjacent half-open steps for the same provider', async () => {
    await databaseClient.query('begin');
    try {
      const result = await databaseClient.query(
        `insert into appointment_steps
           (id, business_id, location_id, appointment_id, service_id,
            provider_user_id, sequence_number, starts_at, ends_at,
            service_name_snapshot, duration_minutes_snapshot,
            price_minor_snapshot, currency_snapshot)
         values ($1, $2, $3, $4, $5, $6, 3, $7, $8, 'Adjacent', 15, 1000, 'ILS')`,
        [
          '00000000-0000-4000-8000-0000000009fe',
          HAPPY_PETS_BUSINESS_ID,
          HAPPY_PETS_LOCATION_ID,
          '00000000-0000-4000-8000-000000000901',
          VACCINATION_SERVICE_ID,
          '00000000-0000-4000-8000-000000000202',
          '2030-01-07T08:00:00.000Z',
          '2030-01-07T08:15:00.000Z',
        ],
      );
      expect(result.rowCount).toBe(1);
    } finally {
      await databaseClient.query('rollback');
    }
  });
});
