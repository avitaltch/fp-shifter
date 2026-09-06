/* eslint-disable camelcase */

exports.up = (pgm) => {
  pgm.addColumns('users', {
    must_change_password: { type: 'boolean', notNull: true, default: false },
  });
  pgm.addColumns('business_memberships', {
    disabled_at: { type: 'timestamptz' },
  });
  pgm.createIndex('business_memberships', ['business_id', 'disabled_at']);
  pgm.dropConstraint('auth_events', 'auth_events_kind_valid');
  pgm.addConstraint('auth_events', 'auth_events_kind_valid', {
    check:
      "event in ('login_succeeded', 'login_failed', 'refresh_rotated', 'refresh_reuse_detected', 'logout', 'password_changed')",
  });
};

exports.down = (pgm) => {
  pgm.dropConstraint('auth_events', 'auth_events_kind_valid');
  pgm.addConstraint('auth_events', 'auth_events_kind_valid', {
    check:
      "event in ('login_succeeded', 'login_failed', 'refresh_rotated', 'refresh_reuse_detected', 'logout')",
  });
  pgm.dropColumn('business_memberships', 'disabled_at');
  pgm.dropColumn('users', 'must_change_password');
};
