/* eslint-disable camelcase */

exports.up = (pgm) => {
  pgm.createType('waitlist_entry_status', [
    'Active',
    'Offered',
    'Fulfilled',
    'Cancelled',
  ]);
  pgm.createType('waitlist_offer_status', [
    'Active',
    'Accepted',
    'Expired',
    'Rejected',
  ]);
  pgm.createType('waitlist_match_status', [
    'Pending',
    'Processing',
    'RetryScheduled',
    'Completed',
    'Failed',
  ]);
  pgm.createType('waitlist_event_kind', [
    'Registered',
    'Offered',
    'Expired',
    'Rejected',
    'Accepted',
  ]);

  pgm.createTable('waitlist_entries', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    business_id: {
      type: 'uuid',
      notNull: true,
      references: 'businesses',
      onDelete: 'CASCADE',
    },
    location_id: { type: 'uuid', notNull: true },
    customer_id: { type: 'uuid', notNull: true },
    status: { type: 'waitlist_entry_status', notNull: true, default: 'Active' },
    window_starts_at: { type: 'timestamptz', notNull: true },
    window_ends_at: { type: 'timestamptz', notNull: true },
    demand_fingerprint: { type: 'char(64)', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('waitlist_entries', 'waitlist_entries_location_tenant_fk', {
    foreignKeys: {
      columns: ['business_id', 'location_id'],
      references: 'locations(business_id, id)',
      onDelete: 'CASCADE',
    },
  });
  pgm.addConstraint('waitlist_entries', 'waitlist_entries_customer_tenant_fk', {
    foreignKeys: {
      columns: ['business_id', 'customer_id'],
      references: 'customers(business_id, id)',
      onDelete: 'RESTRICT',
    },
  });
  pgm.addConstraint('waitlist_entries', 'waitlist_entries_range_valid', {
    check: 'window_starts_at < window_ends_at',
  });
  pgm.addConstraint('waitlist_entries', 'waitlist_entries_fingerprint_format', {
    check: "demand_fingerprint ~ '^[a-f0-9]{64}$'",
  });
  pgm.addConstraint('waitlist_entries', 'waitlist_entries_business_location_id_unique', {
    unique: ['business_id', 'location_id', 'id'],
  });
  pgm.addConstraint('waitlist_entries', 'waitlist_entries_business_id_unique', {
    unique: ['business_id', 'id'],
  });
  pgm.sql(`
    create unique index waitlist_entries_active_demand_unique
    on waitlist_entries (business_id, demand_fingerprint)
    where status in ('Active', 'Offered');
  `);
  pgm.sql(`
    create index waitlist_entries_match_index
    on waitlist_entries (business_id, location_id, window_starts_at, window_ends_at, created_at)
    where status = 'Active';
  `);

  pgm.createTable('waitlist_entry_services', {
    business_id: { type: 'uuid', notNull: true },
    location_id: { type: 'uuid', notNull: true },
    waitlist_entry_id: { type: 'uuid', notNull: true },
    service_id: { type: 'uuid', notNull: true },
    sequence_number: { type: 'smallint', notNull: true },
  });
  pgm.addConstraint(
    'waitlist_entry_services',
    'waitlist_entry_services_entry_tenant_fk',
    {
      foreignKeys: {
        columns: ['business_id', 'location_id', 'waitlist_entry_id'],
        references: 'waitlist_entries(business_id, location_id, id)',
        onDelete: 'CASCADE',
      },
    },
  );
  pgm.addConstraint(
    'waitlist_entry_services',
    'waitlist_entry_services_service_tenant_fk',
    {
      foreignKeys: {
        columns: ['business_id', 'service_id'],
        references: 'services(business_id, id)',
        onDelete: 'RESTRICT',
      },
    },
  );
  pgm.addConstraint('waitlist_entry_services', 'waitlist_entry_services_sequence_valid', {
    check: 'sequence_number > 0',
  });
  pgm.addConstraint('waitlist_entry_services', 'waitlist_entry_services_sequence_unique', {
    unique: ['waitlist_entry_id', 'sequence_number'],
  });
  pgm.createIndex('waitlist_entry_services', [
    'business_id',
    'waitlist_entry_id',
    'sequence_number',
  ]);

  pgm.createTable('waitlist_offers', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    business_id: { type: 'uuid', notNull: true },
    location_id: { type: 'uuid', notNull: true },
    waitlist_entry_id: { type: 'uuid', notNull: true },
    source_appointment_id: { type: 'uuid', notNull: true },
    hold_appointment_id: { type: 'uuid', notNull: true },
    status: { type: 'waitlist_offer_status', notNull: true, default: 'Active' },
    offer_token_hash: { type: 'char(64)', notNull: true },
    expires_at: { type: 'timestamptz', notNull: true },
    accepted_at: { type: 'timestamptz' },
    rejected_at: { type: 'timestamptz' },
    expired_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('waitlist_offers', 'waitlist_offers_entry_tenant_fk', {
    foreignKeys: {
      columns: ['business_id', 'location_id', 'waitlist_entry_id'],
      references: 'waitlist_entries(business_id, location_id, id)',
      onDelete: 'CASCADE',
    },
  });
  for (const [name, column] of [
    ['source', 'source_appointment_id'],
    ['hold', 'hold_appointment_id'],
  ]) {
    pgm.addConstraint('waitlist_offers', `waitlist_offers_${name}_appointment_tenant_fk`, {
      foreignKeys: {
        columns: ['business_id', 'location_id', column],
        references: 'appointments(business_id, location_id, id)',
        onDelete: 'CASCADE',
      },
    });
  }
  pgm.addConstraint('waitlist_offers', 'waitlist_offers_token_hash_format', {
    check: "offer_token_hash ~ '^[a-f0-9]{64}$'",
  });
  pgm.addConstraint('waitlist_offers', 'waitlist_offers_expiry_valid', {
    check: 'expires_at > created_at',
  });
  pgm.addConstraint('waitlist_offers', 'waitlist_offers_business_id_unique', {
    unique: ['business_id', 'id'],
  });
  pgm.addConstraint('waitlist_offers', 'waitlist_offers_hold_unique', {
    unique: ['hold_appointment_id'],
  });
  pgm.sql(`
    create unique index waitlist_offers_active_source_unique
    on waitlist_offers (source_appointment_id)
    where status = 'Active';
  `);
  pgm.sql(`
    create unique index waitlist_offers_active_entry_unique
    on waitlist_offers (waitlist_entry_id)
    where status = 'Active';
  `);
  pgm.sql(`
    create index waitlist_offers_expiry_index
    on waitlist_offers (expires_at, created_at)
    where status = 'Active';
  `);

  pgm.createTable('waitlist_match_requests', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    business_id: { type: 'uuid', notNull: true },
    location_id: { type: 'uuid', notNull: true },
    source_appointment_id: { type: 'uuid', notNull: true },
    status: { type: 'waitlist_match_status', notNull: true, default: 'Pending' },
    available_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    attempt_count: { type: 'smallint', notNull: true, default: 0 },
    locked_at: { type: 'timestamptz' },
    locked_by: { type: 'varchar(120)' },
    last_error: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('waitlist_match_requests', 'waitlist_match_requests_source_tenant_fk', {
    foreignKeys: {
      columns: ['business_id', 'location_id', 'source_appointment_id'],
      references: 'appointments(business_id, location_id, id)',
      onDelete: 'CASCADE',
    },
  });
  pgm.addConstraint('waitlist_match_requests', 'waitlist_match_requests_source_unique', {
    unique: ['source_appointment_id'],
  });
  pgm.addConstraint('waitlist_match_requests', 'waitlist_match_requests_attempts_valid', {
    check: 'attempt_count between 0 and 20',
  });
  pgm.sql(`
    create index waitlist_match_requests_claim_index
    on waitlist_match_requests (available_at, created_at)
    where status in ('Pending', 'RetryScheduled');
  `);

  pgm.createTable('waitlist_events', {
    id: { type: 'bigserial', primaryKey: true },
    business_id: { type: 'uuid', notNull: true },
    waitlist_entry_id: { type: 'uuid', notNull: true },
    waitlist_offer_id: { type: 'uuid' },
    kind: { type: 'waitlist_event_kind', notNull: true },
    metadata: { type: 'jsonb', notNull: true, default: '{}' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('waitlist_events', 'waitlist_events_entry_tenant_fk', {
    foreignKeys: {
      columns: ['business_id', 'waitlist_entry_id'],
      references: 'waitlist_entries(business_id, id)',
      onDelete: 'CASCADE',
    },
  });
  pgm.addConstraint('waitlist_events', 'waitlist_events_offer_tenant_fk', {
    foreignKeys: {
      columns: ['business_id', 'waitlist_offer_id'],
      references: 'waitlist_offers(business_id, id)',
      onDelete: 'CASCADE',
    },
  });
  pgm.createIndex('waitlist_events', ['business_id', 'waitlist_entry_id', 'created_at']);

  for (const table of [
    'waitlist_entries',
    'waitlist_offers',
    'waitlist_match_requests',
  ]) {
    pgm.sql(`
      create trigger ${table}_set_updated_at
      before update on ${table}
      for each row execute function set_updated_at();
    `);
  }
};

exports.down = (pgm) => {
  pgm.dropTable('waitlist_events', { ifExists: true, cascade: true });
  pgm.dropTable('waitlist_match_requests', { ifExists: true, cascade: true });
  pgm.dropTable('waitlist_offers', { ifExists: true, cascade: true });
  pgm.dropTable('waitlist_entry_services', { ifExists: true, cascade: true });
  pgm.dropTable('waitlist_entries', { ifExists: true, cascade: true });
  pgm.dropType('waitlist_event_kind', { ifExists: true });
  pgm.dropType('waitlist_match_status', { ifExists: true });
  pgm.dropType('waitlist_offer_status', { ifExists: true });
  pgm.dropType('waitlist_entry_status', { ifExists: true });
};
