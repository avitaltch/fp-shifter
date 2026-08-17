const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

const fixtures = {
  businesses: [
    {
      id: '00000000-0000-4000-8000-000000000001',
      locationId: '00000000-0000-4000-8000-000000000101',
      name: 'Happy Pets Demo',
      slug: 'happy-pets-demo',
      locationName: 'Happy Pets — Tel Aviv',
    },
    {
      id: '00000000-0000-4000-8000-000000000002',
      locationId: '00000000-0000-4000-8000-000000000102',
      name: 'Compound Beauty Demo',
      slug: 'compound-beauty-demo',
      locationName: 'Compound Beauty — Haifa',
    },
  ],
  users: [
    {
      id: '00000000-0000-4000-8000-000000000201',
      email: 'groomer@happy-pets.demo',
      firstName: 'Dana',
      lastName: 'Groomer',
    },
    {
      id: '00000000-0000-4000-8000-000000000202',
      email: 'vet@happy-pets.demo',
      firstName: 'Noa',
      lastName: 'Veterinarian',
    },
    {
      id: '00000000-0000-4000-8000-000000000203',
      email: 'stylist@compound-beauty.demo',
      firstName: 'Maya',
      lastName: 'Stylist',
    },
  ],
  memberships: [
    {
      id: '00000000-0000-4000-8000-000000000301',
      businessId: '00000000-0000-4000-8000-000000000001',
      userId: '00000000-0000-4000-8000-000000000201',
    },
    {
      id: '00000000-0000-4000-8000-000000000302',
      businessId: '00000000-0000-4000-8000-000000000001',
      userId: '00000000-0000-4000-8000-000000000202',
    },
    {
      id: '00000000-0000-4000-8000-000000000303',
      businessId: '00000000-0000-4000-8000-000000000002',
      userId: '00000000-0000-4000-8000-000000000203',
    },
  ],
  services: [
    {
      id: '00000000-0000-4000-8000-000000000401',
      businessId: '00000000-0000-4000-8000-000000000001',
      name: 'Pet Trim',
      description: 'Full pet grooming and trim',
      durationMinutes: 45,
      priceMinor: 12000,
    },
    {
      id: '00000000-0000-4000-8000-000000000402',
      businessId: '00000000-0000-4000-8000-000000000001',
      name: 'Vaccination',
      description: 'Routine veterinarian vaccination',
      durationMinutes: 15,
      priceMinor: 8000,
    },
    {
      id: '00000000-0000-4000-8000-000000000403',
      businessId: '00000000-0000-4000-8000-000000000002',
      name: 'Haircut',
      description: 'Compound Beauty haircut',
      durationMinutes: 45,
      priceMinor: 15000,
    },
  ],
  skills: [
    {
      id: '00000000-0000-4000-8000-000000000601',
      businessId: '00000000-0000-4000-8000-000000000001',
      providerUserId: '00000000-0000-4000-8000-000000000201',
      serviceId: '00000000-0000-4000-8000-000000000401',
    },
    {
      id: '00000000-0000-4000-8000-000000000602',
      businessId: '00000000-0000-4000-8000-000000000001',
      providerUserId: '00000000-0000-4000-8000-000000000202',
      serviceId: '00000000-0000-4000-8000-000000000402',
    },
    {
      id: '00000000-0000-4000-8000-000000000603',
      businessId: '00000000-0000-4000-8000-000000000002',
      providerUserId: '00000000-0000-4000-8000-000000000203',
      serviceId: '00000000-0000-4000-8000-000000000403',
    },
  ],
  businessHours: [
    {
      id: '00000000-0000-4000-8000-000000000701',
      businessId: '00000000-0000-4000-8000-000000000001',
      locationId: '00000000-0000-4000-8000-000000000101',
      isoWeekday: 1,
      startsAt: '08:00',
      endsAt: '20:00',
    },
    {
      id: '00000000-0000-4000-8000-000000000702',
      businessId: '00000000-0000-4000-8000-000000000002',
      locationId: '00000000-0000-4000-8000-000000000102',
      isoWeekday: 1,
      startsAt: '09:00',
      endsAt: '18:00',
    },
  ],
  availability: [
    {
      id: '00000000-0000-4000-8000-000000000801',
      businessId: '00000000-0000-4000-8000-000000000001',
      locationId: '00000000-0000-4000-8000-000000000101',
      providerUserId: '00000000-0000-4000-8000-000000000201',
      kind: 'Available',
      startsAt: '2030-01-07T07:00:00.000Z',
      endsAt: '2030-01-07T15:00:00.000Z',
      notes: 'Deterministic Monday fixture',
    },
    {
      id: '00000000-0000-4000-8000-000000000802',
      businessId: '00000000-0000-4000-8000-000000000001',
      locationId: '00000000-0000-4000-8000-000000000101',
      providerUserId: '00000000-0000-4000-8000-000000000202',
      kind: 'Available',
      startsAt: '2030-01-07T07:00:00.000Z',
      endsAt: '2030-01-07T15:00:00.000Z',
      notes: 'Deterministic Monday fixture',
    },
    {
      id: '00000000-0000-4000-8000-000000000803',
      businessId: '00000000-0000-4000-8000-000000000001',
      locationId: '00000000-0000-4000-8000-000000000101',
      providerUserId: '00000000-0000-4000-8000-000000000201',
      kind: 'Unavailable',
      startsAt: '2030-01-07T10:00:00.000Z',
      endsAt: '2030-01-07T11:00:00.000Z',
      notes: 'Lunch exception',
    },
    {
      id: '00000000-0000-4000-8000-000000000804',
      businessId: '00000000-0000-4000-8000-000000000002',
      locationId: '00000000-0000-4000-8000-000000000102',
      providerUserId: '00000000-0000-4000-8000-000000000203',
      kind: 'Available',
      startsAt: '2030-01-07T07:00:00.000Z',
      endsAt: '2030-01-07T16:00:00.000Z',
      notes: 'Isolated second-tenant fixture',
    },
  ],
  customers: [
    {
      id: '00000000-0000-4000-8000-000000000501',
      businessId: '00000000-0000-4000-8000-000000000001',
      firstName: 'Ari',
      lastName: 'Cohen',
      email: 'ari@example.test',
      phone: '+972501234567',
    },
    {
      id: '00000000-0000-4000-8000-000000000502',
      businessId: '00000000-0000-4000-8000-000000000002',
      firstName: 'Tal',
      lastName: 'Levi',
      email: 'tal@example.test',
      phone: '+972509876543',
    },
  ],
  appointments: [
    {
      id: '00000000-0000-4000-8000-000000000901',
      businessId: '00000000-0000-4000-8000-000000000001',
      locationId: '00000000-0000-4000-8000-000000000101',
      customerId: '00000000-0000-4000-8000-000000000501',
      startsAt: '2030-01-07T07:00:00.000Z',
      endsAt: '2030-01-07T08:00:00.000Z',
      totalPriceMinor: 20000,
      notes: 'Pet trim followed by vaccination',
    },
  ],
  appointmentSteps: [
    {
      id: '00000000-0000-4000-8000-000000000911',
      appointmentId: '00000000-0000-4000-8000-000000000901',
      businessId: '00000000-0000-4000-8000-000000000001',
      locationId: '00000000-0000-4000-8000-000000000101',
      serviceId: '00000000-0000-4000-8000-000000000401',
      providerUserId: '00000000-0000-4000-8000-000000000201',
      sequenceNumber: 1,
      startsAt: '2030-01-07T07:00:00.000Z',
      endsAt: '2030-01-07T07:45:00.000Z',
      serviceName: 'Pet Trim',
      durationMinutes: 45,
      priceMinor: 12000,
    },
    {
      id: '00000000-0000-4000-8000-000000000912',
      appointmentId: '00000000-0000-4000-8000-000000000901',
      businessId: '00000000-0000-4000-8000-000000000001',
      locationId: '00000000-0000-4000-8000-000000000101',
      serviceId: '00000000-0000-4000-8000-000000000402',
      providerUserId: '00000000-0000-4000-8000-000000000202',
      sequenceNumber: 2,
      startsAt: '2030-01-07T07:45:00.000Z',
      endsAt: '2030-01-07T08:00:00.000Z',
      serviceName: 'Vaccination',
      durationMinutes: 15,
      priceMinor: 8000,
    },
  ],
};

async function seed() {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const client = await pool.connect();

  try {
    await client.query('begin');

    for (const business of fixtures.businesses) {
      await client.query(
        `insert into businesses (id, name, slug)
         values ($1, $2, $3)
         on conflict (id) do update
         set name = excluded.name, slug = excluded.slug`,
        [business.id, business.name, business.slug],
      );
      await client.query(
        `insert into locations (id, business_id, name, is_primary)
         values ($1, $2, $3, true)
         on conflict (id) do update
         set business_id = excluded.business_id,
             name = excluded.name,
             is_primary = true`,
        [business.locationId, business.id, business.locationName],
      );
    }

    for (const user of fixtures.users) {
      await client.query(
        `insert into users
           (id, email, password_hash, first_name, last_name)
         values ($1, $2, '!demo-account-disabled', $3, $4)
         on conflict (id) do update
         set email = excluded.email,
             first_name = excluded.first_name,
             last_name = excluded.last_name,
             disabled_at = null`,
        [user.id, user.email, user.firstName, user.lastName],
      );
    }

    for (const membership of fixtures.memberships) {
      await client.query(
        `insert into business_memberships
           (id, business_id, user_id, role)
         values ($1, $2, $3, 'Provider')
         on conflict (id) do update
         set business_id = excluded.business_id,
             user_id = excluded.user_id,
             role = excluded.role`,
        [membership.id, membership.businessId, membership.userId],
      );
    }

    for (const customer of fixtures.customers) {
      await client.query(
        `insert into customers
           (id, business_id, first_name, last_name, email, phone_e164)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (id) do update
         set business_id = excluded.business_id,
             first_name = excluded.first_name,
             last_name = excluded.last_name,
             email = excluded.email,
             phone_e164 = excluded.phone_e164,
             deleted_at = null`,
        [
          customer.id,
          customer.businessId,
          customer.firstName,
          customer.lastName,
          customer.email,
          customer.phone,
        ],
      );
    }

    for (const service of fixtures.services) {
      await client.query(
        `insert into services
           (id, business_id, name, description, duration_minutes, price_minor)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (id) do update
         set business_id = excluded.business_id,
             name = excluded.name,
             description = excluded.description,
             duration_minutes = excluded.duration_minutes,
             price_minor = excluded.price_minor,
             active = true`,
        [
          service.id,
          service.businessId,
          service.name,
          service.description,
          service.durationMinutes,
          service.priceMinor,
        ],
      );
    }

    for (const skill of fixtures.skills) {
      await client.query(
        `insert into provider_skills
           (id, business_id, provider_user_id, service_id)
         values ($1, $2, $3, $4)
         on conflict (id) do update
         set business_id = excluded.business_id,
             provider_user_id = excluded.provider_user_id,
             service_id = excluded.service_id`,
        [skill.id, skill.businessId, skill.providerUserId, skill.serviceId],
      );
    }

    for (const hours of fixtures.businessHours) {
      await client.query(
        `insert into location_business_hours
           (id, business_id, location_id, iso_weekday, starts_at, ends_at)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (id) do update
         set business_id = excluded.business_id,
             location_id = excluded.location_id,
             iso_weekday = excluded.iso_weekday,
             starts_at = excluded.starts_at,
             ends_at = excluded.ends_at`,
        [
          hours.id,
          hours.businessId,
          hours.locationId,
          hours.isoWeekday,
          hours.startsAt,
          hours.endsAt,
        ],
      );
    }

    for (const availability of fixtures.availability) {
      await client.query(
        `insert into provider_availability
           (id, business_id, location_id, provider_user_id, kind, starts_at, ends_at, notes)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         on conflict (id) do update
         set business_id = excluded.business_id,
             location_id = excluded.location_id,
             provider_user_id = excluded.provider_user_id,
             kind = excluded.kind,
             starts_at = excluded.starts_at,
             ends_at = excluded.ends_at,
             notes = excluded.notes`,
        [
          availability.id,
          availability.businessId,
          availability.locationId,
          availability.providerUserId,
          availability.kind,
          availability.startsAt,
          availability.endsAt,
          availability.notes,
        ],
      );
    }

    for (const appointment of fixtures.appointments) {
      await client.query(
        `insert into appointments
           (id, business_id, location_id, customer_id, status, starts_at, ends_at,
            total_price_minor, currency, notes)
         values ($1, $2, $3, $4, 'Confirmed', $5, $6, $7, 'ILS', $8)
         on conflict (id) do update
         set business_id = excluded.business_id,
             location_id = excluded.location_id,
             customer_id = excluded.customer_id,
             status = excluded.status,
             starts_at = excluded.starts_at,
             ends_at = excluded.ends_at,
             total_price_minor = excluded.total_price_minor,
             currency = excluded.currency,
             notes = excluded.notes,
             cancelled_at = null`,
        [
          appointment.id,
          appointment.businessId,
          appointment.locationId,
          appointment.customerId,
          appointment.startsAt,
          appointment.endsAt,
          appointment.totalPriceMinor,
          appointment.notes,
        ],
      );
    }

    for (const step of fixtures.appointmentSteps) {
      await client.query(
        `insert into appointment_steps
           (id, business_id, location_id, appointment_id, service_id,
            provider_user_id, sequence_number, status, starts_at, ends_at,
            service_name_snapshot, duration_minutes_snapshot,
            price_minor_snapshot, currency_snapshot)
         values ($1, $2, $3, $4, $5, $6, $7, 'Scheduled', $8, $9, $10, $11, $12, 'ILS')
         on conflict (id) do update
         set business_id = excluded.business_id,
             location_id = excluded.location_id,
             appointment_id = excluded.appointment_id,
             service_id = excluded.service_id,
             provider_user_id = excluded.provider_user_id,
             sequence_number = excluded.sequence_number,
             status = excluded.status,
             starts_at = excluded.starts_at,
             ends_at = excluded.ends_at,
             service_name_snapshot = excluded.service_name_snapshot,
             duration_minutes_snapshot = excluded.duration_minutes_snapshot,
             price_minor_snapshot = excluded.price_minor_snapshot,
             currency_snapshot = excluded.currency_snapshot`,
        [
          step.id,
          step.businessId,
          step.locationId,
          step.appointmentId,
          step.serviceId,
          step.providerUserId,
          step.sequenceNumber,
          step.startsAt,
          step.endsAt,
          step.serviceName,
          step.durationMinutes,
          step.priceMinor,
        ],
      );
    }

    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

seed()
  .then(() => {
    console.log(
      `Seeded ${fixtures.businesses.length} businesses, ${fixtures.services.length} services, and one compound appointment.`,
    );
  })
  .catch((error) => {
    console.error('Seed failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
