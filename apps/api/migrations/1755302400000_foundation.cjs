/* eslint-disable camelcase */

exports.up = (pgm) => {
  pgm.createExtension('pgcrypto', { ifNotExists: true });
  pgm.createExtension('citext', { ifNotExists: true });
  pgm.createType('membership_role', ['Owner', 'Manager', 'Provider']);

  pgm.createTable('businesses', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    name: { type: 'varchar(120)', notNull: true },
    slug: { type: 'varchar(80)', notNull: true, unique: true },
    timezone: {
      type: 'varchar(64)',
      notNull: true,
      default: 'Asia/Jerusalem',
    },
    default_locale: { type: 'varchar(10)', notNull: true, default: 'he-IL' },
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
  pgm.addConstraint('businesses', 'businesses_slug_format', {
    check: "slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'",
  });

  pgm.createTable('locations', {
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
    name: { type: 'varchar(120)', notNull: true },
    timezone: {
      type: 'varchar(64)',
      notNull: true,
      default: 'Asia/Jerusalem',
    },
    address: { type: 'text' },
    is_primary: { type: 'boolean', notNull: true, default: false },
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
  pgm.createIndex('locations', 'business_id');
  pgm.sql(
    'create unique index locations_one_primary_per_business on locations (business_id) where is_primary',
  );

  pgm.createTable('users', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    email: { type: 'citext', notNull: true, unique: true },
    password_hash: { type: 'text', notNull: true },
    first_name: { type: 'varchar(80)', notNull: true },
    last_name: { type: 'varchar(80)', notNull: true },
    disabled_at: { type: 'timestamptz' },
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

  pgm.createTable('business_memberships', {
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
    user_id: {
      type: 'uuid',
      notNull: true,
      references: 'users',
      onDelete: 'CASCADE',
    },
    role: { type: 'membership_role', notNull: true, default: 'Provider' },
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
    'business_memberships',
    'business_memberships_business_user_unique',
    { unique: ['business_id', 'user_id'] },
  );
  pgm.createIndex('business_memberships', 'user_id');

  pgm.sql(`
    create function set_updated_at() returns trigger as $$
    begin
      new.updated_at = now();
      return new;
    end;
    $$ language plpgsql;
  `);

  for (const table of [
    'businesses',
    'locations',
    'users',
    'business_memberships',
  ]) {
    pgm.sql(`
      create trigger ${table}_set_updated_at
      before update on ${table}
      for each row execute function set_updated_at();
    `);
  }
};

exports.down = (pgm) => {
  pgm.dropTable('business_memberships');
  pgm.dropTable('users');
  pgm.dropTable('locations');
  pgm.dropTable('businesses');
  pgm.dropFunction('set_updated_at', [], { ifExists: true });
  pgm.dropType('membership_role');
};
