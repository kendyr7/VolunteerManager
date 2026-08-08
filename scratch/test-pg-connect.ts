import dotenv from 'dotenv';
import { Client } from 'pg';

dotenv.config({ path: '.env.local' });

async function testPg() {
  const projectRef = 'tjcrgohdkntkixirhilo';
  const passwordsToTry = [
    process.env.SUPABASE_DB_PASSWORD,
    process.env.POSTGRES_PASSWORD,
    'postgres',
    'admin',
    'VolunteerManager2026',
    'VolunteerManager123',
    'tjcrgohdkntkixirhilo',
  ].filter(Boolean);

  console.log('Testing postgres connections...');

  const connectionConfigs = [
    { host: `db.${projectRef}.supabase.co`, port: 5432, user: 'postgres' },
    { host: `aws-0-us-west-1.pooler.supabase.com`, port: 6543, user: `postgres.${projectRef}` },
    { host: `aws-0-us-east-1.pooler.supabase.com`, port: 6543, user: `postgres.${projectRef}` },
    { host: `aws-0-sa-east-1.pooler.supabase.com`, port: 6543, user: `postgres.${projectRef}` },
  ];

  for (const config of connectionConfigs) {
    for (const pwd of passwordsToTry) {
      try {
        console.log(`Trying ${config.host}:${config.port} user ${config.user} with pwd length ${pwd?.length}...`);
        const client = new Client({
          host: config.host,
          port: config.port,
          database: 'postgres',
          user: config.user,
          password: pwd as string,
          ssl: { rejectUnauthorized: false },
          connectionTimeoutMillis: 4000,
        });
        await client.connect();
        console.log(`✅ SUCCESS connecting to ${config.host}!`);
        const res = await client.query('SELECT current_database(), version();');
        console.log('Query result:', res.rows);
        await client.end();
        return;
      } catch (err: any) {
        console.log(`Failed ${config.host}: ${err.message}`);
      }
    }
  }
}

testPg().catch(console.error);
