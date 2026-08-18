/* eslint-disable camelcase */

exports.up = (pgm) => {
  pgm.createTable('public_rate_limit_buckets', {
    limiter: { type: 'varchar(80)', notNull: true },
    bucket_hash: { type: 'char(64)', notNull: true },
    window_started_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
    window_seconds: { type: 'integer', notNull: true },
    request_count: { type: 'integer', notNull: true, default: 1 },
    last_seen_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });
  pgm.addConstraint(
    'public_rate_limit_buckets',
    'public_rate_limit_buckets_pkey',
    { primaryKey: ['limiter', 'bucket_hash'] },
  );
  pgm.addConstraint(
    'public_rate_limit_buckets',
    'public_rate_limit_buckets_values_valid',
    {
      check:
        'window_seconds between 1 and 86400 and request_count >= 1 and last_seen_at >= window_started_at',
    },
  );
  pgm.createIndex('public_rate_limit_buckets', 'last_seen_at');
};

exports.down = (pgm) => {
  pgm.dropTable('public_rate_limit_buckets', { ifExists: true, cascade: true });
};
