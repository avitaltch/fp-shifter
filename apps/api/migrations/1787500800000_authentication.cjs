/* eslint-disable camelcase */

exports.up = (pgm) => {
  pgm.renameTable('public_rate_limit_buckets', 'rate_limit_buckets');

  pgm.addConstraint(
    'business_memberships',
    'business_memberships_session_scope_unique',
    { unique: ['id', 'business_id', 'user_id'] },
  );

  pgm.createTable('auth_sessions', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: 'users',
      onDelete: 'CASCADE',
    },
    business_id: {
      type: 'uuid',
      notNull: true,
      references: 'businesses',
      onDelete: 'CASCADE',
    },
    membership_id: { type: 'uuid', notNull: true },
    refresh_token_hash: { type: 'char(64)', notNull: true, unique: true },
    expires_at: { type: 'timestamptz', notNull: true },
    revoked_at: { type: 'timestamptz' },
    rotated_to_session_id: { type: 'uuid' },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
    last_used_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });
  pgm.addConstraint('auth_sessions', 'auth_sessions_membership_scope_fk', {
    foreignKeys: {
      columns: ['membership_id', 'business_id', 'user_id'],
      references: 'business_memberships(id, business_id, user_id)',
      onDelete: 'CASCADE',
    },
  });
  pgm.addConstraint('auth_sessions', 'auth_sessions_rotation_fk', {
    foreignKeys: {
      columns: 'rotated_to_session_id',
      references: 'auth_sessions(id)',
      onDelete: 'SET NULL',
    },
  });
  pgm.addConstraint('auth_sessions', 'auth_sessions_time_valid', {
    check: 'expires_at > created_at and last_used_at >= created_at',
  });
  pgm.createIndex('auth_sessions', ['user_id', 'business_id']);
  pgm.createIndex('auth_sessions', 'expires_at');
  pgm.createIndex('auth_sessions', 'revoked_at');

  pgm.createTable('auth_events', {
    id: { type: 'bigserial', primaryKey: true },
    event: { type: 'varchar(48)', notNull: true },
    user_id: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    business_id: {
      type: 'uuid',
      references: 'businesses',
      onDelete: 'SET NULL',
    },
    identity_hash: { type: 'char(64)' },
    request_id: { type: 'varchar(128)' },
    occurred_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });
  pgm.addConstraint('auth_events', 'auth_events_kind_valid', {
    check:
      "event in ('login_succeeded', 'login_failed', 'refresh_rotated', 'refresh_reuse_detected', 'logout')",
  });
  pgm.createIndex('auth_events', ['user_id', 'occurred_at']);
  pgm.createIndex('auth_events', ['business_id', 'occurred_at']);
  pgm.createIndex('auth_events', 'occurred_at');
};

exports.down = (pgm) => {
  pgm.dropTable('auth_events', { ifExists: true, cascade: true });
  pgm.dropTable('auth_sessions', { ifExists: true, cascade: true });
  pgm.dropConstraint(
    'business_memberships',
    'business_memberships_session_scope_unique',
    { ifExists: true },
  );
  pgm.renameTable('rate_limit_buckets', 'public_rate_limit_buckets');
};
