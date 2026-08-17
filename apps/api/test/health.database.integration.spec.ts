import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Client } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/bootstrap';
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
        durationMinutes: 45,
        priceMinor: 12000,
        currency: 'ILS',
      },
      {
        id: VACCINATION_SERVICE_ID,
        name: 'Vaccination',
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
          .send(bookingRequest),
        request(app.getHttpServer())
          .post('/api/v1/public/businesses/happy-pets-demo/bookings')
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
