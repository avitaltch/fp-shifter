const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

const businesses = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    locationId: '00000000-0000-4000-8000-000000000101',
    name: 'Happy Pets Demo',
    slug: 'happy-pets-demo',
    locationName: 'Happy Pets — Tel Aviv',
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    locationId: '00000000-0000-4000-8000-000000000102',
    name: 'Compound Beauty Demo',
    slug: 'compound-beauty-demo',
    locationName: 'Compound Beauty — Haifa',
  },
];

async function seed() {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const client = await pool.connect();

  try {
    await client.query('begin');
    for (const business of businesses) {
      await client.query(
        `insert into businesses (id, name, slug)
         values ($1, $2, $3)
         on conflict (id) do update
         set name = excluded.name, slug = excluded.slug`,
        [business.id, business.name, business.slug],
      );
      await client.query(
        `insert into locations (id, business_id, name, is_primary)
         values ($1, $2, $3, true)
         on conflict (id) do update
         set name = excluded.name, is_primary = true`,
        [business.locationId, business.id, business.locationName],
      );
    }
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

seed()
  .then(() => {
    console.log(`Seeded ${businesses.length} ShiftSync demo businesses.`);
  })
  .catch((error) => {
    console.error('Seed failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
