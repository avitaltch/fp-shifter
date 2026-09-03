const { hash, argon2id } = require('argon2');
const { Pool } = require('pg');

const required = (key, { trim = true } = {}) => {
  const rawValue = process.env[key];
  if (typeof rawValue !== 'string') throw new Error(`${key} is required`);
  const value = trim ? rawValue.trim() : rawValue;
  if (value.length === 0) throw new Error(`${key} is required`);
  return value;
};

const databaseUrl = required('DATABASE_URL');
const businessSlug = required('OWNER_BUSINESS_SLUG');
const email = required('OWNER_EMAIL').toLowerCase();
const password = required('OWNER_PASSWORD', { trim: false });
const firstName = required('OWNER_FIRST_NAME');
const lastName = required('OWNER_LAST_NAME');

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
  throw new Error('OWNER_EMAIL must be a valid email address');
}
if (password.length < 12 || password.length > 256) {
  throw new Error('OWNER_PASSWORD must be between 12 and 256 characters');
}
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(businessSlug)) {
  throw new Error('OWNER_BUSINESS_SLUG is invalid');
}

async function main() {
  const passwordHash = await hash(password, {
    type: argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();
  try {
    await client.query('begin');
    const business = await client.query(
      'select id from businesses where slug = $1',
      [businessSlug],
    );
    if (!business.rows[0]) throw new Error('Business was not found');
    const user = await client.query(
      `insert into users (email, password_hash, first_name, last_name)
       values ($1, $2, $3, $4)
       on conflict (email) do update set
         password_hash = excluded.password_hash,
         first_name = excluded.first_name,
         last_name = excluded.last_name,
         disabled_at = null
       returning id`,
      [email, passwordHash, firstName, lastName],
    );
    await client.query(
      `insert into business_memberships (business_id, user_id, role)
       values ($1, $2, 'Owner')
       on conflict (business_id, user_id) do update set role = 'Owner'`,
      [business.rows[0].id, user.rows[0].id],
    );
    await client.query('commit');
    process.stdout.write(`Owner provisioned for ${businessSlug}: ${email}\n`);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Owner provisioning failed'}\n`);
  process.exitCode = 1;
});
