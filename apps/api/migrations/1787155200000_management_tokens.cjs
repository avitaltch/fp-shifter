/* eslint-disable camelcase */

exports.up = (pgm) => {
  pgm.addColumns('appointments', {
    management_token_hash: { type: 'varchar(64)' },
    management_token_expires_at: { type: 'timestamptz' },
    management_token_revoked_at: { type: 'timestamptz' },
  });
  pgm.addConstraint('appointments', 'appointments_management_token_fields_together', {
    check: `
      (management_token_hash is null and management_token_expires_at is null)
      or
      (management_token_hash is not null and management_token_expires_at is not null)
    `,
  });
  pgm.addConstraint('appointments', 'appointments_management_token_hash_format', {
    check: `
      management_token_hash is null
      or management_token_hash ~ '^[a-f0-9]{64}$'
    `,
  });
  pgm.sql(`
    create unique index appointments_business_management_token_unique
    on appointments (business_id, management_token_hash)
    where management_token_hash is not null;
  `);
};

exports.down = (pgm) => {
  pgm.sql('drop index appointments_business_management_token_unique;');
  pgm.dropConstraint(
    'appointments',
    'appointments_management_token_hash_format',
  );
  pgm.dropConstraint(
    'appointments',
    'appointments_management_token_fields_together',
  );
  pgm.dropColumns('appointments', [
    'management_token_hash',
    'management_token_expires_at',
    'management_token_revoked_at',
  ]);
};
