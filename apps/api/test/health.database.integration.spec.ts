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
import { WaitlistRepository } from '../src/scheduling/waitlist.repository';
import { TenantScope } from '../src/tenancy/tenant-scope';
import { PasswordService } from '../src/auth/password.service';

const HAPPY_PETS_BUSINESS_ID = '00000000-0000-4000-8000-000000000001';
const HAPPY_PETS_LOCATION_ID = '00000000-0000-4000-8000-000000000101';
const BEAUTY_BUSINESS_ID = '00000000-0000-4000-8000-000000000002';
const BEAUTY_LOCATION_ID = '00000000-0000-4000-8000-000000000102';
const PET_TRIM_SERVICE_ID = '00000000-0000-4000-8000-000000000401';
const VACCINATION_SERVICE_ID = '00000000-0000-4000-8000-000000000402';
const BEAUTY_SERVICE_ID = '00000000-0000-4000-8000-000000000403';
const BEAUTY_PROVIDER_ID = '00000000-0000-4000-8000-000000000203';

function readRefreshCookie(header: string | string[] | undefined): string {
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) throw new Error('Refresh cookie was not returned');
  return value.split(';', 1)[0] ?? '';
}

describe('AppModule with PostgreSQL', () => {
  let app: INestApplication;
  let databaseClient: Client;
  let schedulingRepository: SchedulingRepository;
  let notificationWorker: NotificationWorkerService;
  let notificationWorkerRepository: NotificationWorkerRepository;
  let waitlistRepository: WaitlistRepository;
  let passwordService: PasswordService;

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
    waitlistRepository = app.get(WaitlistRepository);
    passwordService = app.get(PasswordService);

    databaseClient = new Client({ connectionString: databaseUrl });
    await databaseClient.connect();
    await databaseClient.query(
      `delete from rate_limit_buckets where limiter like 'public-%'`,
    );
  });

  afterAll(async () => {
    await databaseClient?.query(
      `delete from rate_limit_buckets where limiter like 'public-%'`,
    );
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

  it('authenticates, rotates refresh sessions, rejects reuse, and re-resolves membership', async () => {
    const ownerId = '00000000-0000-4000-8000-000000000201';
    const email = 'groomer@happy-pets.demo';
    const password = 'Local Integration Password!42';
    const eventBaseline = await databaseClient.query<{ id: string }>(
      `select coalesce(max(id), 0)::text as id from auth_events`,
    );
    const eventBaselineId = eventBaseline.rows[0]?.id ?? '0';
    const passwordHash = await passwordService.hash(password);
    await databaseClient.query(
      `update users set password_hash = $2, disabled_at = null where id = $1`,
      [ownerId, passwordHash],
    );
    await databaseClient.query(
      `delete from rate_limit_buckets where limiter like 'auth-%'`,
    );

    try {
      const invalidKnown = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: 'wrong password' })
        .expect(401);
      const invalidUnknown = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'missing@example.com', password: 'wrong password' })
        .expect(401);
      expect(invalidKnown.body).toMatchObject({ code: 'INVALID_CREDENTIALS' });
      expect(invalidUnknown.body).toMatchObject({ code: 'INVALID_CREDENTIALS' });

      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: "' OR 1=1--", password })
        .expect(400);

      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password })
        .expect(200);
      expect(login.body).toMatchObject({
        expiresInSeconds: 900,
        user: { id: ownerId, email },
        business: {
          id: HAPPY_PETS_BUSINESS_ID,
          slug: 'happy-pets-demo',
          role: 'Owner',
        },
      });
      expect(login.body.refreshToken).toBeUndefined();
      const firstCookie = readRefreshCookie(login.headers['set-cookie']);
      const firstAccessToken = String(login.body.accessToken);

      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${firstAccessToken}`)
        .expect(200)
        .expect(({ body }) => {
          expect(body.business).toMatchObject({
            id: HAPPY_PETS_BUSINESS_ID,
            role: 'Owner',
          });
        });

      const refresh = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', firstCookie)
        .expect(200);
      const secondCookie = readRefreshCookie(refresh.headers['set-cookie']);
      const secondAccessToken = String(refresh.body.accessToken);
      expect(secondCookie).not.toBe(firstCookie);
      expect(secondAccessToken).not.toBe(firstAccessToken);

      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${firstAccessToken}`)
        .expect(401);
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${secondAccessToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', firstCookie)
        .expect(401);
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${secondAccessToken}`)
        .expect(401);

      const events = await databaseClient.query<{ event: string }>(
        `select event from auth_events where user_id = $1 order by id`,
        [ownerId],
      );
      expect(events.rows.map(({ event }) => event)).toEqual(
        expect.arrayContaining([
          'login_succeeded',
          'refresh_rotated',
          'refresh_reuse_detected',
        ]),
      );
    } finally {
      await databaseClient.query(`delete from auth_sessions where user_id = $1`, [
        ownerId,
      ]);
      await databaseClient.query(`delete from auth_events where id > $1`, [
        eventBaselineId,
      ]);
      await databaseClient.query(
        `delete from rate_limit_buckets where limiter like 'auth-%'`,
      );
      await databaseClient.query(
        `update users set password_hash = '!demo-account-disabled' where id = $1`,
        [ownerId],
      );
    }
  });

  it('enforces tenant and role boundaries across operator configuration mutations', async () => {
    const happyOwnerId = '00000000-0000-4000-8000-000000000201';
    const happyProviderId = '00000000-0000-4000-8000-000000000202';
    const beautyOwnerId = '00000000-0000-4000-8000-000000000203';
    const password = 'Configuration Integration Password!42';
    const passwordHash = await passwordService.hash(password);
    const auditBaseline = await databaseClient.query<{ id: string }>(
      `select coalesce(max(id), 0)::text as id from operator_audit_events`,
    );
    const auditBaselineId = auditBaseline.rows[0]?.id ?? '0';
    let createdServiceId: string | undefined;
    let createdLocationId: string | undefined;
    let createdAvailabilityId: string | undefined;

    await databaseClient.query(
      `update users
       set password_hash = $1, disabled_at = null
       where id = any($2::uuid[])`,
      [passwordHash, [happyOwnerId, happyProviderId, beautyOwnerId]],
    );
    await databaseClient.query(
      `delete from rate_limit_buckets where limiter like 'auth-%'`,
    );

    const login = async (email: string): Promise<string> => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password })
        .expect(200);
      return String(response.body.accessToken);
    };

    try {
      const [ownerToken, providerToken, beautyToken] = await Promise.all([
        login('groomer@happy-pets.demo'),
        login('vet@happy-pets.demo'),
        login('stylist@compound-beauty.demo'),
      ]);

      await request(app.getHttpServer())
        .get('/api/v1/operator/services')
        .set('Authorization', `Bearer ${providerToken}`)
        .expect(403)
        .expect(({ body }) => {
          expect(body).toMatchObject({ code: 'INSUFFICIENT_ROLE' });
        });

      await request(app.getHttpServer())
        .get('/api/v1/operator/services')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200)
        .expect(({ body }) => {
          expect(body.map(({ id }: { id: string }) => id)).toEqual([
            PET_TRIM_SERVICE_ID,
            VACCINATION_SERVICE_ID,
          ]);
          expect(JSON.stringify(body)).not.toContain(BEAUTY_SERVICE_ID);
        });

      await request(app.getHttpServer())
        .patch(`/api/v1/operator/services/${PET_TRIM_SERVICE_ID}`)
        .set('Authorization', `Bearer ${beautyToken}`)
        .send({ priceMinor: 1 })
        .expect(404);

      const serviceName = `Integration service ${randomUUID()}`;
      const createdService = await request(app.getHttpServer())
        .post('/api/v1/operator/services')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: serviceName,
          description: '<script>alert(1)</script>',
          durationMinutes: 20,
          priceMinor: 4_500,
          currency: 'ils',
        })
        .expect(201);
      createdServiceId = String(createdService.body.id);
      expect(createdService.body).toMatchObject({
        name: serviceName,
        description: '<script>alert(1)</script>',
        durationMinutes: 20,
        priceMinor: 4_500,
        currency: 'ILS',
        active: true,
      });

      await request(app.getHttpServer())
        .post('/api/v1/operator/services')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: serviceName.toUpperCase(),
          durationMinutes: 20,
          priceMinor: 4_500,
        })
        .expect(409)
        .expect(({ body }) => {
          expect(body).toMatchObject({ code: 'SERVICE_NAME_EXISTS' });
        });

      await request(app.getHttpServer())
        .put(`/api/v1/operator/providers/${happyOwnerId}/skills`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ serviceIds: [PET_TRIM_SERVICE_ID, createdServiceId] })
        .expect(200)
        .expect(({ body }) => {
          expect(body.serviceIds).toEqual(
            expect.arrayContaining([PET_TRIM_SERVICE_ID, createdServiceId]),
          );
          expect(body.disabledAt).toBeUndefined();
        });

      await request(app.getHttpServer())
        .put(`/api/v1/operator/providers/${happyOwnerId}/skills`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ serviceIds: [BEAUTY_SERVICE_ID] })
        .expect(400)
        .expect(({ body }) => {
          expect(body).toMatchObject({ code: 'INVALID_SERVICE_SELECTION' });
        });

      const createdLocation = await request(app.getHttpServer())
        .post('/api/v1/operator/locations')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: 'Integration branch',
          timezone: 'Asia/Jerusalem',
          address: 'Test only',
        })
        .expect(201);
      createdLocationId = String(createdLocation.body.id);
      expect(createdLocation.body.isPrimary).toBe(false);

      await request(app.getHttpServer())
        .put(`/api/v1/operator/locations/${createdLocationId}/hours`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          intervals: [
            { isoWeekday: 1, startsAt: '08:00', endsAt: '12:00' },
            { isoWeekday: 1, startsAt: '11:00', endsAt: '15:00' },
          ],
        })
        .expect(400)
        .expect(({ body }) => {
          expect(body).toMatchObject({ code: 'BUSINESS_HOURS_OVERLAP' });
        });

      await request(app.getHttpServer())
        .put(`/api/v1/operator/locations/${createdLocationId}/hours`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          intervals: [
            { isoWeekday: 1, startsAt: '08:00', endsAt: '12:00' },
            { isoWeekday: 1, startsAt: '13:00', endsAt: '17:00' },
          ],
        })
        .expect(200)
        .expect(({ body }) => {
          expect(body).toHaveLength(2);
        });

      await request(app.getHttpServer())
        .get(
          `/api/v1/operator/availability?from=2031-01-01T00%3A00%3A00.000Z&to=2031-01-03T00%3A00%3A00.000Z&providerUserId=${happyProviderId}`,
        )
        .set('Authorization', `Bearer ${beautyToken}`)
        .expect(404);

      await request(app.getHttpServer())
        .post('/api/v1/operator/availability')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          providerUserId: happyOwnerId,
          intervals: [
            {
              locationId: createdLocationId,
              kind: 'Available',
              startsAt: '2031-01-01T08:00:00.000Z',
              endsAt: '2031-01-01T10:00:00.000Z',
            },
          ],
        })
        .expect(403)
        .expect(({ body }) => {
          expect(body).toMatchObject({ code: 'PROVIDER_SCOPE_FORBIDDEN' });
        });

      const createdAvailability = await request(app.getHttpServer())
        .post('/api/v1/operator/availability')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          intervals: [
            {
              locationId: createdLocationId,
              kind: 'Available',
              startsAt: '2031-01-01T08:00:00.000Z',
              endsAt: '2031-01-01T10:00:00.000Z',
              notes: 'Integration availability',
            },
          ],
        })
        .expect(201);
      createdAvailabilityId = String(createdAvailability.body[0]?.id);

      await request(app.getHttpServer())
        .post('/api/v1/operator/availability')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          intervals: [
            {
              locationId: createdLocationId,
              kind: 'Available',
              startsAt: '2031-01-01T09:00:00.000Z',
              endsAt: '2031-01-01T11:00:00.000Z',
            },
          ],
        })
        .expect(409)
        .expect(({ body }) => {
          expect(body).toMatchObject({ code: 'AVAILABILITY_OVERLAP' });
        });

      await request(app.getHttpServer())
        .get(
          '/api/v1/operator/availability?from=2031-01-01T00%3A00%3A00.000Z&to=2031-01-03T00%3A00%3A00.000Z',
        )
        .set('Authorization', `Bearer ${providerToken}`)
        .expect(200)
        .expect(({ body }) => {
          expect(body).toEqual([
            expect.objectContaining({
              id: createdAvailabilityId,
              providerUserId: happyProviderId,
            }),
          ]);
        });

      await request(app.getHttpServer())
        .delete(`/api/v1/operator/availability/${createdAvailabilityId}`)
        .set('Authorization', `Bearer ${providerToken}`)
        .expect(204);
      createdAvailabilityId = undefined;

      await request(app.getHttpServer())
        .delete(`/api/v1/operator/services/${createdServiceId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200)
        .expect(({ body }) => {
          expect(body.active).toBe(false);
        });

      await request(app.getHttpServer())
        .delete(`/api/v1/operator/locations/${createdLocationId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(204);
      createdLocationId = undefined;

      const audit = await databaseClient.query<{ action: string; businessId: string }>(
        `select action, business_id as "businessId"
         from operator_audit_events
         where id > $1
         order by id`,
        [auditBaselineId],
      );
      expect(audit.rows.map(({ action }) => action)).toEqual(
        expect.arrayContaining([
          'service.created',
          'provider.skills_replaced',
          'location.created',
          'location.hours_replaced',
          'provider.availability_created',
          'provider.availability_deleted',
          'service.deactivated',
          'location.deleted',
        ]),
      );
      expect(audit.rows.every(({ businessId }) => businessId === HAPPY_PETS_BUSINESS_ID)).toBe(
        true,
      );
    } finally {
      if (createdAvailabilityId) {
        await databaseClient.query(
          `delete from provider_availability where id = $1`,
          [createdAvailabilityId],
        );
      }
      await databaseClient.query(
        `delete from provider_skills
         where business_id = $1 and provider_user_id = $2`,
        [HAPPY_PETS_BUSINESS_ID, happyOwnerId],
      );
      await databaseClient.query(
        `insert into provider_skills
           (id, business_id, provider_user_id, service_id)
         values ($1, $2, $3, $4)
         on conflict (business_id, provider_user_id, service_id) do nothing`,
        [
          '00000000-0000-4000-8000-000000000601',
          HAPPY_PETS_BUSINESS_ID,
          happyOwnerId,
          PET_TRIM_SERVICE_ID,
        ],
      );
      if (createdServiceId) {
        await databaseClient.query(`delete from services where id = $1`, [createdServiceId]);
      }
      if (createdLocationId) {
        await databaseClient.query(`delete from locations where id = $1`, [createdLocationId]);
      }
      await databaseClient.query(`delete from operator_audit_events where id > $1`, [
        auditBaselineId,
      ]);
      await databaseClient.query(
        `delete from auth_sessions where user_id = any($1::uuid[])`,
        [[happyOwnerId, happyProviderId, beautyOwnerId]],
      );
      await databaseClient.query(
        `delete from rate_limit_buckets where limiter like 'auth-%'`,
      );
      await databaseClient.query(
        `update users
         set password_hash = '!demo-account-disabled'
         where id = any($1::uuid[])`,
        [[happyOwnerId, happyProviderId, beautyOwnerId]],
      );
    }
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
      expect(
        responses.map(({ status }) => status).sort(),
        JSON.stringify(responses.map(({ body }) => body)),
      ).toEqual([201, 409]);
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

  it('registers one tenant-scoped ordered waitlist demand and rejects duplicates', async () => {
    const phoneE164 = '+972501230091';
    const waitlistRequest = {
      windowStartsAt: '2030-01-07T12:00:00.000Z',
      windowEndsAt: '2030-01-07T15:00:00.000Z',
      serviceIds: [PET_TRIM_SERVICE_ID, VACCINATION_SERVICE_ID],
      customer: {
        firstName: 'Waitlist',
        lastName: 'Customer',
        email: 'waitlist@example.test',
        phoneE164,
      },
    };

    try {
      const created = await request(app.getHttpServer())
        .post('/api/v1/public/businesses/happy-pets-demo/waitlist')
        .send(waitlistRequest)
        .expect(201);
      expect(created.body).toMatchObject({
        status: 'Active',
        windowStartsAt: waitlistRequest.windowStartsAt,
        windowEndsAt: waitlistRequest.windowEndsAt,
        serviceIds: waitlistRequest.serviceIds,
      });

      await request(app.getHttpServer())
        .post('/api/v1/public/businesses/happy-pets-demo/waitlist')
        .send(waitlistRequest)
        .expect(409)
        .expect(({ body }) => {
          expect(body).toMatchObject({ code: 'DUPLICATE_WAITLIST_ENTRY' });
        });

      const persisted = await databaseClient.query<{
        status: string;
        demandFingerprint: string;
        serviceIds: string[];
        eventKinds: string[];
      }>(
        `select e.status::text,
                e.demand_fingerprint as "demandFingerprint",
                (
                  select array_agg(s.service_id order by s.sequence_number)
                  from waitlist_entry_services s
                  where s.business_id = e.business_id
                    and s.waitlist_entry_id = e.id
                ) as "serviceIds",
                (
                  select array_agg(v.kind::text order by v.created_at)
                  from waitlist_events v
                  where v.business_id = e.business_id
                    and v.waitlist_entry_id = e.id
                ) as "eventKinds"
         from waitlist_entries e
         where e.business_id = $1
           and e.id = $2`,
        [HAPPY_PETS_BUSINESS_ID, created.body.waitlistEntryId],
      );
      expect(persisted.rows[0]).toMatchObject({
        status: 'Active',
        demandFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
        serviceIds: waitlistRequest.serviceIds,
        eventKinds: ['Registered'],
      });
      expect(persisted.rows[0]?.demandFingerprint).not.toContain(phoneE164);
    } finally {
      await databaseClient.query(
        `delete from waitlist_entries
         where business_id = $1
           and customer_id in (
             select id from customers
             where business_id = $1 and phone_e164 = $2
           )`,
        [HAPPY_PETS_BUSINESS_ID, phoneE164],
      );
      await databaseClient.query(
        `delete from customers
         where business_id = $1 and phone_e164 = $2`,
        [HAPPY_PETS_BUSINESS_ID, phoneE164],
      );
    }
  });

  it('rejects cross-tenant services in public waitlist demand', async () => {
    const phoneE164 = '+972501230090';
    try {
      await request(app.getHttpServer())
        .post('/api/v1/public/businesses/happy-pets-demo/waitlist')
        .send({
          windowStartsAt: '2030-01-07T12:00:00.000Z',
          windowEndsAt: '2030-01-07T15:00:00.000Z',
          serviceIds: [BEAUTY_SERVICE_ID],
          customer: {
            firstName: 'Cross',
            lastName: 'Tenant',
            phoneE164,
          },
        })
        .expect(400)
        .expect(({ body }) => {
          expect(body).toMatchObject({ code: 'INVALID_SERVICE_SELECTION' });
        });
      const entries = await databaseClient.query<{ count: number }>(
        `select count(*)::integer as count
         from waitlist_entries e
         join customers c
           on c.business_id = e.business_id and c.id = e.customer_id
         where e.business_id = $1 and c.phone_e164 = $2`,
        [HAPPY_PETS_BUSINESS_ID, phoneE164],
      );
      expect(entries.rows[0]?.count).toBe(0);
    } finally {
      await databaseClient.query(
        `delete from customers
         where business_id = $1 and phone_e164 = $2`,
        [HAPPY_PETS_BUSINESS_ID, phoneE164],
      );
    }
  });

  it('turns a cancellation into one sequential compound waitlist hold and offer', async () => {
    const sourcePhone = '+972501230089';
    const waitlistPhone = '+972501230088';
    const secondWaitlistPhone = '+972501230087';
    const sourceKey = randomUUID();
    const holdAppointmentIds: string[] = [];

    try {
      const entry = await request(app.getHttpServer())
        .post('/api/v1/public/businesses/happy-pets-demo/waitlist')
        .send({
          windowStartsAt: '2030-01-07T13:00:00.000Z',
          windowEndsAt: '2030-01-07T15:00:00.000Z',
          serviceIds: [PET_TRIM_SERVICE_ID, VACCINATION_SERVICE_ID],
          customer: {
            firstName: 'Backfill',
            lastName: 'Candidate',
            phoneE164: waitlistPhone,
          },
        })
        .expect(201);
      const secondEntry = await request(app.getHttpServer())
        .post('/api/v1/public/businesses/happy-pets-demo/waitlist')
        .send({
          windowStartsAt: '2030-01-07T13:00:00.000Z',
          windowEndsAt: '2030-01-07T15:00:00.000Z',
          serviceIds: [PET_TRIM_SERVICE_ID, VACCINATION_SERVICE_ID],
          customer: {
            firstName: 'Second',
            lastName: 'Candidate',
            phoneE164: secondWaitlistPhone,
          },
        })
        .expect(201);
      await databaseClient.query(
        `update waitlist_entries
         set created_at = created_at - interval '1 second'
         where business_id = $1 and id = $2`,
        [HAPPY_PETS_BUSINESS_ID, entry.body.waitlistEntryId],
      );
      const source = await request(app.getHttpServer())
        .post('/api/v1/public/businesses/happy-pets-demo/bookings')
        .set('Idempotency-Key', sourceKey)
        .send({
          date: '2030-01-07',
          startsAt: '2030-01-07T14:00:00.000Z',
          serviceIds: [PET_TRIM_SERVICE_ID, VACCINATION_SERVICE_ID],
          customer: {
            firstName: 'Cancelling',
            lastName: 'Customer',
            phoneE164: sourcePhone,
          },
        })
        .expect(201);

      await request(app.getHttpServer())
        .post(
          '/api/v1/public/businesses/happy-pets-demo/appointments/manage/cancel',
        )
        .set('Authorization', `Bearer ${source.body.managementToken}`)
        .expect(200);
      await expect(waitlistRepository.processNextMatch()).resolves.toBe(true);
      await expect(waitlistRepository.processNextMatch()).resolves.toBe(false);

      const offer = await databaseClient.query<{
        offerId: string;
        holdAppointmentId: string;
        offerStatus: string;
        entryStatus: string;
        holdStatus: string;
        stepCount: number;
        notificationStatus: string;
        actionPath: string;
      }>(
        `select o.id as "offerId",
                o.hold_appointment_id as "holdAppointmentId",
                o.status::text as "offerStatus",
                e.status::text as "entryStatus",
                a.status::text as "holdStatus",
                count(s.id)::integer as "stepCount",
                min(j.status::text) as "notificationStatus",
                min(j.payload->>'actionPath') as "actionPath"
         from waitlist_offers o
         join waitlist_entries e
           on e.business_id = o.business_id and e.id = o.waitlist_entry_id
         join appointments a
           on a.business_id = o.business_id and a.id = o.hold_appointment_id
         join appointment_steps s
           on s.business_id = a.business_id and s.appointment_id = a.id
         join notification_jobs j
           on j.business_id = o.business_id
          and j.appointment_id = o.hold_appointment_id
          and j.kind = 'WaitlistAvailability'
         where o.business_id = $1 and o.waitlist_entry_id = $2
         group by o.id, e.status, a.status`,
        [HAPPY_PETS_BUSINESS_ID, entry.body.waitlistEntryId],
      );
      expect(offer.rows[0]).toMatchObject({
        offerStatus: 'Active',
        entryStatus: 'Offered',
        holdStatus: 'Pending',
        stepCount: 2,
        notificationStatus: 'Pending',
        actionPath: expect.stringMatching(
          /^\/waitlist\/claim\/happy-pets-demo#token=wo_[A-Za-z0-9_-]{43}$/,
        ),
      });
      if (offer.rows[0]?.holdAppointmentId) {
        holdAppointmentIds.push(offer.rows[0].holdAppointmentId);
      }
      const actionPath = offer.rows[0]?.actionPath;
      const offerToken = actionPath?.split('#token=')[1];
      expect(offerToken).toMatch(/^wo_[A-Za-z0-9_-]{43}$/);

      await expect(
        waitlistRepository.expireNextOffer(
          new Date('2027-01-01T00:00:00.000Z'),
        ),
      ).resolves.toBe(true);
      const expired = await databaseClient.query<{
        offerStatus: string;
        holdStatus: string;
        notificationStatus: string;
        expiredEvents: number;
      }>(
        `select o.status::text as "offerStatus",
                a.status::text as "holdStatus",
                j.status::text as "notificationStatus",
                (
                  select count(*)::integer
                  from waitlist_events v
                  where v.business_id = o.business_id
                    and v.waitlist_offer_id = o.id
                    and v.kind = 'Expired'
                ) as "expiredEvents"
         from waitlist_offers o
         join appointments a
           on a.business_id = o.business_id and a.id = o.hold_appointment_id
         join notification_jobs j
           on j.business_id = o.business_id
          and j.appointment_id = o.hold_appointment_id
          and j.kind = 'WaitlistAvailability'
         where o.business_id = $1 and o.id = $2`,
        [HAPPY_PETS_BUSINESS_ID, offer.rows[0]?.offerId],
      );
      expect(expired.rows[0]).toEqual({
        offerStatus: 'Expired',
        holdStatus: 'Cancelled',
        notificationStatus: 'Cancelled',
        expiredEvents: 1,
      });
      await expect(
        waitlistRepository.processNextMatch(
          new Date('2027-01-01T00:00:00.000Z'),
        ),
      ).resolves.toBe(true);

      const secondOffer = await databaseClient.query<{
        offerId: string;
        holdAppointmentId: string;
        actionPath: string;
      }>(
        `select o.id as "offerId",
                o.hold_appointment_id as "holdAppointmentId",
                j.payload->>'actionPath' as "actionPath"
         from waitlist_offers o
         join notification_jobs j
           on j.business_id = o.business_id
          and j.appointment_id = o.hold_appointment_id
          and j.kind = 'WaitlistAvailability'
         where o.business_id = $1
           and o.waitlist_entry_id = $2
           and o.status = 'Active'`,
        [HAPPY_PETS_BUSINESS_ID, secondEntry.body.waitlistEntryId],
      );
      expect(secondOffer.rows).toHaveLength(1);
      holdAppointmentIds.push(secondOffer.rows[0]!.holdAppointmentId);
      const secondOfferToken = secondOffer.rows[0]!.actionPath.split(
        '#token=',
      )[1];

      const accepted = await request(app.getHttpServer())
        .post(
          '/api/v1/public/businesses/happy-pets-demo/waitlist/offers/accept',
        )
        .set('Authorization', `Bearer ${secondOfferToken}`)
        .expect(200);
      expect(accepted.body).toMatchObject({
        appointmentId: secondOffer.rows[0]!.holdAppointmentId,
        status: 'Confirmed',
        totalPriceMinor: 20_000,
        currency: 'ILS',
        managementToken: expect.stringMatching(/^sm_[A-Za-z0-9_-]{43}$/),
      });
      expect(accepted.body.steps).toHaveLength(2);
      expect(JSON.stringify(accepted.body)).not.toContain('providerUserId');

      await request(app.getHttpServer())
        .post(
          '/api/v1/public/businesses/happy-pets-demo/waitlist/offers/accept',
        )
        .set('Authorization', `Bearer ${secondOfferToken}`)
        .expect(404);

      const fulfilled = await databaseClient.query<{
        offerStatus: string;
        entryStatus: string;
        appointmentStatus: string;
        recoveredRevenueMinor: number;
        acceptedNotificationCount: number;
      }>(
        `select o.status::text as "offerStatus",
                e.status::text as "entryStatus",
                a.status::text as "appointmentStatus",
                (v.metadata->>'recoveredRevenueMinor')::integer as "recoveredRevenueMinor",
                (
                  select count(*)::integer
                  from notification_jobs j
                  where j.business_id = o.business_id
                    and j.appointment_id = o.hold_appointment_id
                    and j.kind = 'WaitlistAccepted'
                ) as "acceptedNotificationCount"
         from waitlist_offers o
         join waitlist_entries e
           on e.business_id = o.business_id and e.id = o.waitlist_entry_id
         join appointments a
           on a.business_id = o.business_id and a.id = o.hold_appointment_id
         join waitlist_events v
           on v.business_id = o.business_id
          and v.waitlist_offer_id = o.id
          and v.kind = 'Accepted'
         where o.business_id = $1 and o.id = $2`,
        [HAPPY_PETS_BUSINESS_ID, secondOffer.rows[0]?.offerId],
      );
      expect(fulfilled.rows[0]).toEqual({
        offerStatus: 'Accepted',
        entryStatus: 'Fulfilled',
        appointmentStatus: 'Confirmed',
        recoveredRevenueMinor: 20_000,
        acceptedNotificationCount: 1,
      });
    } finally {
      for (const holdAppointmentId of holdAppointmentIds) {
        await databaseClient.query(
          `delete from appointments where business_id = $1 and id = $2`,
          [HAPPY_PETS_BUSINESS_ID, holdAppointmentId],
        );
      }
      await databaseClient.query(
        `delete from appointments
         where business_id = $1 and idempotency_key = $2`,
        [HAPPY_PETS_BUSINESS_ID, sourceKey],
      );
      await databaseClient.query(
        `delete from waitlist_entries e
         where e.business_id = $1
           and e.customer_id in (
             select id from customers
             where business_id = $1 and phone_e164 = any($2::text[])
           )`,
        [HAPPY_PETS_BUSINESS_ID, [waitlistPhone, secondWaitlistPhone]],
      );
      await databaseClient.query(
        `delete from customers
         where business_id = $1 and phone_e164 = any($2::text[])`,
        [
          HAPPY_PETS_BUSINESS_ID,
          [sourcePhone, waitlistPhone, secondWaitlistPhone],
        ],
      );
    }
  });

  it('rate limits repeated public booking attempts without storing contact data', async () => {
    const phoneE164 = '+972501230095';
    const attemptBooking = () =>
      request(app.getHttpServer())
        .post('/api/v1/public/businesses/happy-pets-demo/bookings')
        .set('Idempotency-Key', randomUUID())
        .send({
          date: '2030-01-07',
          startsAt: '2030-01-07T05:00:00.000Z',
          serviceIds: [PET_TRIM_SERVICE_ID],
          customer: {
            firstName: 'Rate',
            lastName: 'Limit',
            phoneE164,
          },
        });
    await databaseClient.query(
      `delete from rate_limit_buckets
       where limiter like 'public-booking-%'`,
    );

    try {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const response = await attemptBooking();
        expect([400, 409]).toContain(response.status);
      }

      await attemptBooking()
        .expect(429)
        .expect(({ body }) => {
          expect(body).toMatchObject({
            code: 'PUBLIC_BOOKING_RATE_LIMITED',
            retryAfterSeconds: expect.any(Number),
          });
        });

      const buckets = await databaseClient.query<{
        bucketHash: string;
      }>(
        `select bucket_hash as "bucketHash"
         from rate_limit_buckets
         where limiter like 'public-booking-%'`,
      );
      expect(buckets.rows).toHaveLength(2);
      expect(
        buckets.rows.every(({ bucketHash }) =>
          /^[a-f0-9]{64}$/.test(bucketHash),
        ),
      ).toBe(true);
      expect(JSON.stringify(buckets.rows)).not.toContain(phoneE164);
    } finally {
      await databaseClient.query(
        `delete from rate_limit_buckets
         where limiter like 'public-booking-%'`,
      );
    }
  });

  it('does not let an anonymous booking overwrite or reroute an existing customer', async () => {
    const phoneE164 = '+972501230094';
    const existingEmail = 'existing-customer@example.test';
    const attackerEmail = 'replacement@example.test';
    const idempotencyKey = randomUUID();

    try {
      await databaseClient.query(
        `insert into customers
           (business_id, first_name, last_name, email, phone_e164)
         values ($1, 'Existing', 'Customer', $2, $3)`,
        [HAPPY_PETS_BUSINESS_ID, existingEmail, phoneE164],
      );
      await databaseClient.query(
        `insert into business_notification_policies
           (business_id, customer_primary_channel)
         values ($1, 'Email')
         on conflict (business_id) do update
         set customer_primary_channel = excluded.customer_primary_channel,
             customer_fallback_channel = null`,
        [HAPPY_PETS_BUSINESS_ID],
      );

      const booking = await request(app.getHttpServer())
        .post('/api/v1/public/businesses/happy-pets-demo/bookings')
        .set('Idempotency-Key', idempotencyKey)
        .send({
          date: '2030-01-07',
          startsAt: '2030-01-07T14:00:00.000Z',
          serviceIds: [PET_TRIM_SERVICE_ID],
          customer: {
            firstName: 'Replacement',
            lastName: 'Identity',
            email: attackerEmail,
            phoneE164,
          },
        })
        .expect(201);

      const customer = await databaseClient.query<{
        firstName: string;
        lastName: string;
        email: string;
      }>(
        `select first_name as "firstName",
                last_name as "lastName",
                email::text
         from customers
         where business_id = $1 and phone_e164 = $2`,
        [HAPPY_PETS_BUSINESS_ID, phoneE164],
      );
      expect(customer.rows[0]).toEqual({
        firstName: 'Existing',
        lastName: 'Customer',
        email: existingEmail,
      });

      const confirmation = await databaseClient.query<{
        recipient: string;
        customerFirstName: string;
      }>(
        `select recipient,
                payload->>'customerFirstName' as "customerFirstName"
         from notification_jobs
         where business_id = $1
           and appointment_id = $2
           and kind = 'BookingConfirmation'`,
        [HAPPY_PETS_BUSINESS_ID, booking.body.appointmentId],
      );
      expect(confirmation.rows[0]).toEqual({
        recipient: existingEmail,
        customerFirstName: 'Existing',
      });
    } finally {
      await databaseClient.query(
        `delete from appointments
         where business_id = $1 and idempotency_key = $2`,
        [HAPPY_PETS_BUSINESS_ID, idempotencyKey],
      );
      await databaseClient.query(
        `delete from customers
         where business_id = $1 and phone_e164 = $2`,
        [HAPPY_PETS_BUSINESS_ID, phoneE164],
      );
      await databaseClient.query(
        `delete from business_notification_policies where business_id = $1`,
        [HAPPY_PETS_BUSINESS_ID],
      );
    }
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

  it('creates local staff, enforces first-login password change, and revokes deactivated sessions', async () => {
    const ownerId = '00000000-0000-4000-8000-000000000201';
    const ownerEmail = 'groomer@happy-pets.demo';
    const ownerPassword = 'Staff Lifecycle Owner Password!42';
    const temporaryPassword = 'Temporary Provider Password!42';
    const newPassword = 'Permanent Provider Password!42';
    const staffEmail = `provider-${randomUUID()}@example.test`;
    const ownerPasswordHash = await passwordService.hash(ownerPassword);
    const auditBaseline = await databaseClient.query<{ id: string }>(
      `select coalesce(max(id), 0)::text as id from operator_audit_events`,
    );
    const auditBaselineId = auditBaseline.rows[0]?.id ?? '0';
    let staffId: string | undefined;

    await databaseClient.query(
      `update users
       set password_hash = $2, disabled_at = null, must_change_password = false
       where id = $1`,
      [ownerId, ownerPasswordHash],
    );
    await databaseClient.query(
      `update business_memberships set disabled_at = null
       where business_id = $1 and user_id = $2`,
      [HAPPY_PETS_BUSINESS_ID, ownerId],
    );
    await databaseClient.query(
      `delete from rate_limit_buckets where limiter like 'auth-%'`,
    );

    try {
      const ownerLogin = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: ownerEmail, password: ownerPassword })
        .expect(200);
      const ownerToken = String(ownerLogin.body.accessToken);

      const created = await request(app.getHttpServer())
        .post('/api/v1/operator/staff')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          email: staffEmail,
          firstName: 'Local',
          lastName: 'Provider',
          phoneE164: '+972501234567',
          role: 'Provider',
          temporaryPassword,
        })
        .expect(201);
      staffId = String(created.body.userId);
      expect(created.body).toMatchObject({
        email: staffEmail,
        role: 'Provider',
        mustChangePassword: true,
      });

      await request(app.getHttpServer())
        .put(`/api/v1/operator/providers/${staffId}/skills`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ serviceIds: [PET_TRIM_SERVICE_ID] })
        .expect(200);

      const staffLogin = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: staffEmail, password: temporaryPassword })
        .expect(200);
      const staffToken = String(staffLogin.body.accessToken);
      expect(staffLogin.body.user.mustChangePassword).toBe(true);

      await request(app.getHttpServer())
        .get('/api/v1/operator/locations')
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(403)
        .expect(({ body }) => {
          expect(body.code).toBe('PASSWORD_CHANGE_REQUIRED');
        });
      await request(app.getHttpServer())
        .post('/api/v1/auth/password')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ currentPassword: temporaryPassword, newPassword })
        .expect(204);
      await request(app.getHttpServer())
        .get('/api/v1/operator/locations')
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .post(`/api/v1/operator/staff/${staffId}/deactivate`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(201)
        .expect(({ body }) => {
          expect(body.disabledAt).toBeTruthy();
        });
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(401);

      await request(app.getHttpServer())
        .post(`/api/v1/operator/staff/${staffId}/reactivate`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(201);
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: staffEmail, password: newPassword })
        .expect(200)
        .expect(({ body }) => {
          expect(body.user.mustChangePassword).toBe(false);
        });

      const actions = await databaseClient.query<{ action: string }>(
        `select action from operator_audit_events
         where id > $1 and resource_id = $2
         order by id`,
        [auditBaselineId, staffId],
      );
      expect(actions.rows.map(({ action }) => action)).toEqual(
        expect.arrayContaining([
          'staff.created',
          'staff.deactivated',
          'staff.reactivated',
        ]),
      );
    } finally {
      if (staffId) {
        await databaseClient.query(`delete from users where id = $1`, [staffId]);
      }
      await databaseClient.query(`delete from operator_audit_events where id > $1`, [
        auditBaselineId,
      ]);
      await databaseClient.query(`delete from auth_sessions where user_id = $1`, [
        ownerId,
      ]);
      await databaseClient.query(
        `delete from rate_limit_buckets where limiter like 'auth-%'`,
      );
      await databaseClient.query(
        `update users
         set password_hash = '!demo-account-disabled', must_change_password = false
         where id = $1`,
        [ownerId],
      );
    }
  });

  it('serves tenant-safe manager and provider operations with audited status changes', async () => {
    const ownerId = '00000000-0000-4000-8000-000000000201';
    const providerId = '00000000-0000-4000-8000-000000000202';
    const beautyOwnerId = '00000000-0000-4000-8000-000000000203';
    const appointmentId = '00000000-0000-4000-8000-000000000901';
    const ownerStepId = '00000000-0000-4000-8000-000000000911';
    const providerStepId = '00000000-0000-4000-8000-000000000912';
    const password = 'Operations Integration Password!42';
    const passwordHash = await passwordService.hash(password);
    const auditBaseline = await databaseClient.query<{ id: string }>(
      `select coalesce(max(id), 0)::text as id from operator_audit_events`,
    );
    const auditBaselineId = auditBaseline.rows[0]?.id ?? '0';
    await databaseClient.query(
      `update users
       set password_hash = $1, disabled_at = null
       where id = any($2::uuid[])`,
      [passwordHash, [ownerId, providerId, beautyOwnerId]],
    );
    await databaseClient.query(
      `delete from rate_limit_buckets where limiter like 'auth-%'`,
    );

    const login = async (email: string): Promise<string> => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password })
        .expect(200);
      return String(response.body.accessToken);
    };

    try {
      const [ownerToken, providerToken, beautyToken] = await Promise.all([
        login('groomer@happy-pets.demo'),
        login('vet@happy-pets.demo'),
        login('stylist@compound-beauty.demo'),
      ]);
      const range = 'from=2030-01-07T06%3A00%3A00.000Z&to=2030-01-08T06%3A00%3A00.000Z';

      await request(app.getHttpServer())
        .get(`/api/v1/operator/appointments?${range}`)
        .set('Authorization', `Bearer ${providerToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .get(`/api/v1/operator/appointments?${range}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200)
        .expect(({ body }) => {
          expect(body).toHaveLength(1);
          expect(body[0]).toMatchObject({
            id: appointmentId,
            customerFirstName: 'Ari',
            steps: [
              { id: ownerStepId, sequenceNumber: 1 },
              { id: providerStepId, sequenceNumber: 2 },
            ],
          });
        });

      await request(app.getHttpServer())
        .get(`/api/v1/operator/me/steps?${range}`)
        .set('Authorization', `Bearer ${providerToken}`)
        .expect(200)
        .expect(({ body }) => {
          expect(body.map(({ id }: { id: string }) => id)).toEqual([providerStepId]);
        });
      await request(app.getHttpServer())
        .patch(`/api/v1/operator/steps/${ownerStepId}/status`)
        .set('Authorization', `Bearer ${providerToken}`)
        .send({ status: 'Completed' })
        .expect(404);
      await request(app.getHttpServer())
        .patch(`/api/v1/operator/steps/${providerStepId}/status`)
        .set('Authorization', `Bearer ${providerToken}`)
        .send({ status: 'Completed' })
        .expect(200)
        .expect(({ body }) => {
          expect(body).toMatchObject({ id: providerStepId, status: 'Completed' });
        });

      await request(app.getHttpServer())
        .get(`/api/v1/operator/steps/${ownerStepId}/reassignment-options`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200)
        .expect(({ body }) => {
          expect(body).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ providerUserId: ownerId, eligible: true }),
              expect.objectContaining({
                providerUserId: providerId,
                eligible: false,
                reasons: expect.arrayContaining(['NOT_QUALIFIED']),
              }),
            ]),
          );
        });
      await request(app.getHttpServer())
        .get(`/api/v1/operator/steps/${ownerStepId}/reassignment-options`)
        .set('Authorization', `Bearer ${beautyToken}`)
        .expect(404);

      const audit = await databaseClient.query<{ action: string; actor_user_id: string }>(
        `select action, actor_user_id
         from operator_audit_events
         where id > $1 and resource_id = $2`,
        [auditBaselineId, providerStepId],
      );
      expect(audit.rows).toContainEqual({
        action: 'appointment.step_status_changed',
        actor_user_id: providerId,
      });
    } finally {
      await databaseClient.query(
        `update appointment_steps set status = 'Scheduled' where id = $1`,
        [providerStepId],
      );
      await databaseClient.query(
        `update appointments set status = 'Confirmed' where id = $1`,
        [appointmentId],
      );
      await databaseClient.query(`delete from operator_audit_events where id > $1`, [
        auditBaselineId,
      ]);
      await databaseClient.query(
        `delete from auth_sessions where user_id = any($1::uuid[])`,
        [[ownerId, providerId, beautyOwnerId]],
      );
      await databaseClient.query(
        `delete from rate_limit_buckets where limiter like 'auth-%'`,
      );
      await databaseClient.query(
        `update users set password_hash = '!demo-account-disabled' where id = any($1::uuid[])`,
        [[ownerId, providerId, beautyOwnerId]],
      );
    }
  });
});
