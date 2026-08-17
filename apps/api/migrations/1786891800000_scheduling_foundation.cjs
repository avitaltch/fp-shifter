/* eslint-disable camelcase */

exports.up = (pgm) => {
  pgm.createExtension('btree_gist', { ifNotExists: true });
  pgm.createType('availability_kind', ['Available', 'Unavailable']);
  pgm.createType('appointment_status', [
    'Pending',
    'Confirmed',
    'Cancelled',
    'Completed',
    'RequiresAttention',
  ]);
  pgm.createType('appointment_step_status', [
    'Scheduled',
    'InProgress',
    'Completed',
    'Cancelled',
  ]);

  pgm.addConstraint('locations', 'locations_business_id_id_unique', {
    unique: ['business_id', 'id'],
  });

  pgm.createTable('customers', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    business_id: {
      type: 'uuid',
      notNull: true,
      references: 'businesses',
      onDelete: 'CASCADE',
    },
    first_name: { type: 'varchar(80)', notNull: true },
    last_name: { type: 'varchar(80)', notNull: true },
    email: { type: 'citext' },
    phone_e164: { type: 'varchar(20)', notNull: true },
    notes: { type: 'text' },
    deleted_at: { type: 'timestamptz' },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });
  pgm.addConstraint('customers', 'customers_phone_e164_format', {
    check: "phone_e164 ~ '^\\+[1-9][0-9]{7,14}$'",
  });
  pgm.addConstraint('customers', 'customers_business_id_id_unique', {
    unique: ['business_id', 'id'],
  });
  pgm.sql(`
    create unique index customers_business_phone_active_unique
    on customers (business_id, phone_e164)
    where deleted_at is null;
  `);

  pgm.createTable('services', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    business_id: {
      type: 'uuid',
      notNull: true,
      references: 'businesses',
      onDelete: 'CASCADE',
    },
    name: { type: 'citext', notNull: true },
    description: { type: 'text' },
    duration_minutes: { type: 'integer', notNull: true },
    price_minor: { type: 'integer', notNull: true },
    currency: { type: 'varchar(3)', notNull: true, default: 'ILS' },
    active: { type: 'boolean', notNull: true, default: true },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });
  pgm.addConstraint('services', 'services_duration_minutes_valid', {
    check: 'duration_minutes between 1 and 1440',
  });
  pgm.addConstraint('services', 'services_price_minor_valid', {
    check: 'price_minor >= 0',
  });
  pgm.addConstraint('services', 'services_currency_format', {
    check: "currency ~ '^[A-Z]{3}$'",
  });
  pgm.addConstraint('services', 'services_business_name_unique', {
    unique: ['business_id', 'name'],
  });
  pgm.addConstraint('services', 'services_business_id_id_unique', {
    unique: ['business_id', 'id'],
  });
  pgm.sql(`
    create index services_business_active_name_index
    on services (business_id, name)
    where active;
  `);

  pgm.createTable('provider_skills', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    business_id: {
      type: 'uuid',
      notNull: true,
      references: 'businesses',
      onDelete: 'CASCADE',
    },
    provider_user_id: { type: 'uuid', notNull: true },
    service_id: { type: 'uuid', notNull: true },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });
  pgm.addConstraint('provider_skills', 'provider_skills_provider_tenant_fk', {
    foreignKeys: {
      columns: ['business_id', 'provider_user_id'],
      references: 'business_memberships(business_id, user_id)',
      onDelete: 'CASCADE',
    },
  });
  pgm.addConstraint('provider_skills', 'provider_skills_service_tenant_fk', {
    foreignKeys: {
      columns: ['business_id', 'service_id'],
      references: 'services(business_id, id)',
      onDelete: 'CASCADE',
    },
  });
  pgm.addConstraint('provider_skills', 'provider_skills_unique', {
    unique: ['business_id', 'provider_user_id', 'service_id'],
  });
  pgm.createIndex('provider_skills', [
    'business_id',
    'service_id',
    'provider_user_id',
  ]);

  pgm.createTable('location_business_hours', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    business_id: {
      type: 'uuid',
      notNull: true,
      references: 'businesses',
      onDelete: 'CASCADE',
    },
    location_id: { type: 'uuid', notNull: true },
    iso_weekday: { type: 'smallint', notNull: true },
    starts_at: { type: 'time', notNull: true },
    ends_at: { type: 'time', notNull: true },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });
  pgm.addConstraint(
    'location_business_hours',
    'location_business_hours_location_tenant_fk',
    {
      foreignKeys: {
        columns: ['business_id', 'location_id'],
        references: 'locations(business_id, id)',
        onDelete: 'CASCADE',
      },
    },
  );
  pgm.addConstraint('location_business_hours', 'location_business_hours_day_valid', {
    check: 'iso_weekday between 1 and 7',
  });
  pgm.addConstraint(
    'location_business_hours',
    'location_business_hours_range_valid',
    { check: 'starts_at < ends_at' },
  );
  pgm.addConstraint(
    'location_business_hours',
    'location_business_hours_unique',
    { unique: ['business_id', 'location_id', 'iso_weekday', 'starts_at', 'ends_at'] },
  );
  pgm.createIndex('location_business_hours', [
    'business_id',
    'location_id',
    'iso_weekday',
  ]);

  pgm.createTable('provider_availability', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    business_id: {
      type: 'uuid',
      notNull: true,
      references: 'businesses',
      onDelete: 'CASCADE',
    },
    location_id: { type: 'uuid', notNull: true },
    provider_user_id: { type: 'uuid', notNull: true },
    kind: { type: 'availability_kind', notNull: true },
    starts_at: { type: 'timestamptz', notNull: true },
    ends_at: { type: 'timestamptz', notNull: true },
    notes: { type: 'text' },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });
  pgm.addConstraint(
    'provider_availability',
    'provider_availability_location_tenant_fk',
    {
      foreignKeys: {
        columns: ['business_id', 'location_id'],
        references: 'locations(business_id, id)',
        onDelete: 'CASCADE',
      },
    },
  );
  pgm.addConstraint(
    'provider_availability',
    'provider_availability_provider_tenant_fk',
    {
      foreignKeys: {
        columns: ['business_id', 'provider_user_id'],
        references: 'business_memberships(business_id, user_id)',
        onDelete: 'CASCADE',
      },
    },
  );
  pgm.addConstraint(
    'provider_availability',
    'provider_availability_range_valid',
    { check: 'starts_at < ends_at' },
  );
  pgm.sql(`
    create index provider_availability_range_index
    on provider_availability using gist (
      business_id,
      location_id,
      tstzrange(starts_at, ends_at, '[)')
    );
  `);
  pgm.createIndex('provider_availability', [
    'business_id',
    'provider_user_id',
    'starts_at',
  ]);

  pgm.createTable('appointments', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    business_id: {
      type: 'uuid',
      notNull: true,
      references: 'businesses',
      onDelete: 'CASCADE',
    },
    location_id: { type: 'uuid', notNull: true },
    customer_id: { type: 'uuid', notNull: true },
    status: { type: 'appointment_status', notNull: true, default: 'Pending' },
    starts_at: { type: 'timestamptz', notNull: true },
    ends_at: { type: 'timestamptz', notNull: true },
    total_price_minor: { type: 'integer', notNull: true },
    currency: { type: 'varchar(3)', notNull: true, default: 'ILS' },
    notes: { type: 'text' },
    cancelled_at: { type: 'timestamptz' },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });
  pgm.addConstraint('appointments', 'appointments_location_tenant_fk', {
    foreignKeys: {
      columns: ['business_id', 'location_id'],
      references: 'locations(business_id, id)',
      onDelete: 'RESTRICT',
    },
  });
  pgm.addConstraint('appointments', 'appointments_customer_tenant_fk', {
    foreignKeys: {
      columns: ['business_id', 'customer_id'],
      references: 'customers(business_id, id)',
      onDelete: 'RESTRICT',
    },
  });
  pgm.addConstraint('appointments', 'appointments_range_valid', {
    check: 'starts_at < ends_at',
  });
  pgm.addConstraint('appointments', 'appointments_price_valid', {
    check: 'total_price_minor >= 0',
  });
  pgm.addConstraint('appointments', 'appointments_currency_format', {
    check: "currency ~ '^[A-Z]{3}$'",
  });
  pgm.addConstraint('appointments', 'appointments_business_location_id_unique', {
    unique: ['business_id', 'location_id', 'id'],
  });
  pgm.createIndex('appointments', [
    'business_id',
    'location_id',
    'starts_at',
  ]);
  pgm.createIndex('appointments', ['business_id', 'customer_id', 'starts_at']);

  pgm.createTable('appointment_steps', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    business_id: {
      type: 'uuid',
      notNull: true,
      references: 'businesses',
      onDelete: 'CASCADE',
    },
    location_id: { type: 'uuid', notNull: true },
    appointment_id: { type: 'uuid', notNull: true },
    service_id: { type: 'uuid', notNull: true },
    provider_user_id: { type: 'uuid', notNull: true },
    sequence_number: { type: 'smallint', notNull: true },
    status: {
      type: 'appointment_step_status',
      notNull: true,
      default: 'Scheduled',
    },
    starts_at: { type: 'timestamptz', notNull: true },
    ends_at: { type: 'timestamptz', notNull: true },
    service_name_snapshot: { type: 'varchar(120)', notNull: true },
    duration_minutes_snapshot: { type: 'integer', notNull: true },
    price_minor_snapshot: { type: 'integer', notNull: true },
    currency_snapshot: { type: 'varchar(3)', notNull: true },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });
  pgm.addConstraint('appointment_steps', 'appointment_steps_appointment_tenant_fk', {
    foreignKeys: {
      columns: ['business_id', 'location_id', 'appointment_id'],
      references: 'appointments(business_id, location_id, id)',
      onDelete: 'CASCADE',
    },
  });
  pgm.addConstraint('appointment_steps', 'appointment_steps_service_tenant_fk', {
    foreignKeys: {
      columns: ['business_id', 'service_id'],
      references: 'services(business_id, id)',
      onDelete: 'RESTRICT',
    },
  });
  pgm.addConstraint('appointment_steps', 'appointment_steps_provider_tenant_fk', {
    foreignKeys: {
      columns: ['business_id', 'provider_user_id'],
      references: 'business_memberships(business_id, user_id)',
      onDelete: 'RESTRICT',
    },
  });
  pgm.addConstraint('appointment_steps', 'appointment_steps_sequence_valid', {
    check: 'sequence_number > 0',
  });
  pgm.addConstraint('appointment_steps', 'appointment_steps_range_valid', {
    check: 'starts_at < ends_at',
  });
  pgm.addConstraint('appointment_steps', 'appointment_steps_duration_valid', {
    check: 'duration_minutes_snapshot between 1 and 1440',
  });
  pgm.addConstraint('appointment_steps', 'appointment_steps_price_valid', {
    check: 'price_minor_snapshot >= 0',
  });
  pgm.addConstraint('appointment_steps', 'appointment_steps_currency_format', {
    check: "currency_snapshot ~ '^[A-Z]{3}$'",
  });
  pgm.addConstraint('appointment_steps', 'appointment_steps_sequence_unique', {
    unique: ['appointment_id', 'sequence_number'],
  });
  pgm.sql(`
    alter table appointment_steps
    add constraint appointment_steps_provider_no_overlap
    exclude using gist (
      provider_user_id with =,
      tstzrange(starts_at, ends_at, '[)') with &&
    )
    where (status in ('Scheduled', 'InProgress'));
  `);
  pgm.sql(`
    create index appointment_steps_tenant_range_index
    on appointment_steps using gist (
      business_id,
      location_id,
      tstzrange(starts_at, ends_at, '[)')
    )
    where (status in ('Scheduled', 'InProgress'));
  `);
  pgm.createIndex('appointment_steps', [
    'business_id',
    'appointment_id',
    'sequence_number',
  ]);
  pgm.createIndex('appointment_steps', [
    'business_id',
    'provider_user_id',
    'starts_at',
  ]);

  for (const table of [
    'customers',
    'services',
    'location_business_hours',
    'provider_availability',
    'appointments',
    'appointment_steps',
  ]) {
    pgm.sql(`
      create trigger ${table}_set_updated_at
      before update on ${table}
      for each row execute function set_updated_at();
    `);
  }
};

exports.down = (pgm) => {
  pgm.dropTable('appointment_steps');
  pgm.dropTable('appointments');
  pgm.dropTable('provider_availability');
  pgm.dropTable('location_business_hours');
  pgm.dropTable('provider_skills');
  pgm.dropTable('services');
  pgm.dropTable('customers');
  pgm.dropConstraint('locations', 'locations_business_id_id_unique');
  pgm.dropType('appointment_step_status');
  pgm.dropType('appointment_status');
  pgm.dropType('availability_kind');
};
