/* eslint-disable camelcase */

exports.up = (pgm) => {
  pgm.addColumns('appointments', {
    idempotency_key: { type: 'uuid' },
    idempotency_request_fingerprint: { type: 'varchar(64)' },
  });
  pgm.addConstraint(
    'appointments',
    'appointments_idempotency_fields_together',
    {
      check: `
        (idempotency_key is null and idempotency_request_fingerprint is null)
        or
        (idempotency_key is not null and idempotency_request_fingerprint is not null)
      `,
    },
  );
  pgm.addConstraint(
    'appointments',
    'appointments_idempotency_fingerprint_format',
    {
      check: `
        idempotency_request_fingerprint is null
        or idempotency_request_fingerprint ~ '^[a-f0-9]{64}$'
      `,
    },
  );
  pgm.sql(`
    create unique index appointments_business_idempotency_unique
    on appointments (business_id, idempotency_key)
    where idempotency_key is not null;
  `);
};

exports.down = (pgm) => {
  pgm.sql('drop index appointments_business_idempotency_unique;');
  pgm.dropConstraint(
    'appointments',
    'appointments_idempotency_fingerprint_format',
  );
  pgm.dropConstraint(
    'appointments',
    'appointments_idempotency_fields_together',
  );
  pgm.dropColumns('appointments', [
    'idempotency_key',
    'idempotency_request_fingerprint',
  ]);
};
