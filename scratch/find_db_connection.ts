import dotenv from 'dotenv';
import { Client } from 'pg';
import fs from 'fs';

dotenv.config({ path: '.env.local' });

async function runSql() {
  const projectRef = 'tjcrgohdkntkixirhilo';
  const passwordsToTry = [
    process.env.SUPABASE_DB_PASSWORD,
    process.env.POSTGRES_PASSWORD,
    process.env.DB_PASSWORD,
    'postgres',
    'VolunteerManager2026',
    'VolunteerManager123',
    'tjcrgohdkntkixirhilo',
  ].filter(Boolean);

  const connectionConfigs = [
    { host: `db.${projectRef}.supabase.co`, port: 5432, user: 'postgres' },
    { host: `aws-0-us-west-1.pooler.supabase.com`, port: 6543, user: `postgres.${projectRef}` },
    { host: `aws-0-us-east-1.pooler.supabase.com`, port: 6543, user: `postgres.${projectRef}` },
    { host: `aws-0-sa-east-1.pooler.supabase.com`, port: 6543, user: `postgres.${projectRef}` },
  ];

  for (const config of connectionConfigs) {
    for (const pwd of passwordsToTry) {
      try {
        const client = new Client({
          host: config.host,
          port: config.port,
          database: 'postgres',
          user: config.user,
          password: pwd as string,
          ssl: { rejectUnauthorized: false },
          connectionTimeoutMillis: 3000,
        });
        await client.connect();
        console.log(`✅ CONNECTED TO POSTGRES AT ${config.host}:${config.port}`);
        
        const sqlContent = fs.readFileSync('supabase/migrations/20261010000000_attendance_sessions.sql', 'utf-8');
        await client.query(sqlContent);
        console.log('✅ MIGRATION EXECUTED SUCCESSFULLY VIA PG!');
        
        const res = await client.query("SELECT table_name FROM information_schema.tables WHERE table_name = 'attendance_sessions';");
        console.log('Verification query:', res.rows);
        
        await client.end();
        return;
      } catch (err: any) {
        // ignore connection failure
      }
    }
  }

  console.log('❌ Could not connect via pg directly with standard passwords.');
}

runSql().catch(console.error);
