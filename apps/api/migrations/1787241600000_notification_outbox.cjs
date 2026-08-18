/* eslint-disable camelcase */

exports.up = (pgm) => {
  pgm.createType('notification_channel', ['Email', 'Sms', 'WhatsApp']);
  pgm.createType('notification_kind', [
    'BookingConfirmation',
    'ManagerCompoundVisit',
    'Reminder7d',
    'Reminder24h',
    'Reminder1h',
    'CustomerCancellation',
    'ManagerCancellation',
    'WaitlistAvailability',
    'WaitlistAccepted',
    'ManagerReassignment',
  ]);
  pgm.createType('notification_job_status', [
    'Pending',
    'Processing',
    'RetryScheduled',
    'Sent',
    'Failed',
    'Cancelled',
  ]);
  pgm.createType('notification_attempt_status', ['Succeeded', 'Failed']);

  pgm.addConstraint('appointments', 'appointments_business_id_id_unique', {
    unique: ['business_id', 'id'],
  });
  pgm.addColumn('users', {
    phone_e164: { type: 'varchar(20)' },
  });
  pgm.addConstraint('users', 'users_phone_e164_format', {
    check: "phone_e164 is null or phone_e164 ~ '^\\+[1-9][0-9]{7,14}$'",
  });

  pgm.createTable('business_notification_policies', {
    business_id: {
      type: 'uuid',
      primaryKey: true,
      references: 'businesses',
      onDelete: 'CASCADE',
    },
    customer_primary_channel: {
      type: 'notification_channel',
      notNull: true,
      default: 'Sms',
    },
    customer_fallback_channel: { type: 'notification_channel' },
    manager_channel: {
      type: 'notification_channel',
      notNull: true,
      default: 'Email',
    },
    booking_confirmation_enabled: {
      type: 'boolean',
      notNull: true,
      default: true,
    },
    reminders_enabled: { type: 'boolean', notNull: true, default: true },
    manager_compound_enabled: {
      type: 'boolean',
      notNull: true,
      default: true,
    },
    cancellation_enabled: { type: 'boolean', notNull: true, default: true },
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
    'business_notification_policies',
    'business_notification_policy_fallback_distinct',
    {
      check: `
        customer_fallback_channel is null
        or customer_fallback_channel <> customer_primary_channel
      `,
    },
  );

  pgm.createTable('notification_jobs', {
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
    appointment_id: { type: 'uuid' },
    kind: { type: 'notification_kind', notNull: true },
    channel: { type: 'notification_channel', notNull: true },
    recipient: { type: 'varchar(320)', notNull: true },
    fallback_channel: { type: 'notification_channel' },
    fallback_recipient: { type: 'varchar(320)' },
    scheduled_for: { type: 'timestamptz', notNull: true },
    available_at: { type: 'timestamptz', notNull: true },
    status: {
      type: 'notification_job_status',
      notNull: true,
      default: 'Pending',
    },
    attempt_count: { type: 'smallint', notNull: true, default: 0 },
    max_attempts: { type: 'smallint', notNull: true, default: 5 },
    idempotency_key: { type: 'varchar(240)', notNull: true },
    payload: { type: 'jsonb', notNull: true },
    locked_at: { type: 'timestamptz' },
    locked_by: { type: 'varchar(120)' },
    last_error: { type: 'text' },
    sent_at: { type: 'timestamptz' },
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
  pgm.addConstraint('notification_jobs', 'notification_jobs_attempts_valid', {
    check: 'attempt_count >= 0 and max_attempts between 1 and 20',
  });
  pgm.addConstraint('notification_jobs', 'notification_jobs_fallback_valid', {
    check: `
      (fallback_channel is null and fallback_recipient is null)
      or
      (
        fallback_channel is not null
        and fallback_recipient is not null
        and fallback_channel <> channel
      )
    `,
  });
  pgm.addConstraint('notification_jobs', 'notification_jobs_business_id_unique', {
    unique: ['business_id', 'id'],
  });
  pgm.addConstraint(
    'notification_jobs',
    'notification_jobs_appointment_tenant_fk',
    {
      foreignKeys: {
        columns: ['business_id', 'appointment_id'],
        references: 'appointments(business_id, id)',
        onDelete: 'CASCADE',
      },
    },
  );
  pgm.addConstraint(
    'notification_jobs',
    'notification_jobs_business_idempotency_unique',
    { unique: ['business_id', 'idempotency_key'] },
  );
  pgm.sql(`
    create index notification_jobs_claim_index
    on notification_jobs (available_at, scheduled_for, created_at)
    where status in ('Pending', 'RetryScheduled');
  `);
  pgm.createIndex('notification_jobs', [
    'business_id',
    'appointment_id',
    'status',
  ]);

  pgm.createTable('notification_attempts', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    business_id: { type: 'uuid', notNull: true },
    notification_job_id: { type: 'uuid', notNull: true },
    attempt_number: { type: 'smallint', notNull: true },
    provider: { type: 'varchar(80)', notNull: true },
    status: { type: 'notification_attempt_status', notNull: true },
    provider_message_id: { type: 'varchar(200)' },
    provider_response: { type: 'jsonb' },
    error: { type: 'text' },
    started_at: { type: 'timestamptz', notNull: true },
    finished_at: { type: 'timestamptz', notNull: true },
  });
  pgm.addConstraint(
    'notification_attempts',
    'notification_attempts_job_tenant_fk',
    {
      foreignKeys: {
        columns: ['business_id', 'notification_job_id'],
        references: 'notification_jobs(business_id, id)',
        onDelete: 'CASCADE',
      },
    },
  );
  pgm.addConstraint(
    'notification_attempts',
    'notification_attempts_job_number_unique',
    { unique: ['notification_job_id', 'attempt_number'] },
  );
  pgm.addConstraint(
    'notification_attempts',
    'notification_attempts_number_valid',
    { check: 'attempt_number > 0 and finished_at >= started_at' },
  );

  pgm.createTable('notification_fake_deliveries', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    business_id: { type: 'uuid', notNull: true },
    notification_job_id: { type: 'uuid', notNull: true },
    channel: { type: 'notification_channel', notNull: true },
    recipient: { type: 'varchar(320)', notNull: true },
    provider_idempotency_key: { type: 'varchar(240)', notNull: true },
    subject: { type: 'varchar(200)' },
    body: { type: 'text', notNull: true },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });
  pgm.addConstraint(
    'notification_fake_deliveries',
    'notification_fake_deliveries_job_tenant_fk',
    {
      foreignKeys: {
        columns: ['business_id', 'notification_job_id'],
        references: 'notification_jobs(business_id, id)',
        onDelete: 'CASCADE',
      },
    },
  );
  pgm.addConstraint(
    'notification_fake_deliveries',
    'notification_fake_delivery_idempotency_unique',
    { unique: ['provider_idempotency_key'] },
  );

  for (const table of [
    'business_notification_policies',
    'notification_jobs',
  ]) {
    pgm.sql(`
      create trigger ${table}_set_updated_at
      before update on ${table}
      for each row execute function set_updated_at();
    `);
  }
};

exports.down = (pgm) => {
  pgm.dropTable('notification_fake_deliveries');
  pgm.dropTable('notification_attempts');
  pgm.dropTable('notification_jobs');
  pgm.dropTable('business_notification_policies');
  pgm.dropConstraint('users', 'users_phone_e164_format', { ifExists: true });
  pgm.dropColumn('users', 'phone_e164', { ifExists: true });
  pgm.dropConstraint('appointments', 'appointments_business_id_id_unique');
  pgm.dropType('notification_attempt_status');
  pgm.dropType('notification_job_status');
  pgm.dropType('notification_kind');
  pgm.dropType('notification_channel');
};
