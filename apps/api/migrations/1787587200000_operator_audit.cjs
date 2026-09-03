/* eslint-disable camelcase */

exports.up = (pgm) => {
  pgm.createTable('operator_audit_events', {
    id: { type: 'bigserial', primaryKey: true },
    business_id: {
      type: 'uuid',
      notNull: true,
      references: 'businesses',
      onDelete: 'CASCADE',
    },
    actor_user_id: {
      type: 'uuid',
      references: 'users',
      onDelete: 'SET NULL',
    },
    action: { type: 'varchar(64)', notNull: true },
    resource_type: { type: 'varchar(48)', notNull: true },
    resource_id: { type: 'uuid' },
    details: { type: 'jsonb', notNull: true, default: '{}' },
    request_id: { type: 'varchar(128)' },
    occurred_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });
  pgm.addConstraint('operator_audit_events', 'operator_audit_action_format', {
    check: "action ~ '^[a-z]+(?:[._][a-z]+)*$'",
  });
  pgm.addConstraint(
    'operator_audit_events',
    'operator_audit_resource_type_format',
    { check: "resource_type ~ '^[a-z]+(?:_[a-z]+)*$'" },
  );
  pgm.createIndex('operator_audit_events', [
    'business_id',
    'occurred_at',
  ]);
  pgm.createIndex('operator_audit_events', [
    'business_id',
    'resource_type',
    'resource_id',
  ]);
};

exports.down = (pgm) => {
  pgm.dropTable('operator_audit_events', { ifExists: true, cascade: true });
};
