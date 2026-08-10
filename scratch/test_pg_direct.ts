import dotenv from 'dotenv';
import { Client } from 'pg';
import fs from 'fs';

dotenv.config({ path: '.env.local' });

async function testPgDirect() {
  const connectionStrings = [
    process.env.DATABASE_URL,
    process.env.POSTGRES_URL,
    process.env.SUPABASE_DB_URL,
    process.env.DIRECT_URL,
  ].filter(Boolean);

  console.log('Testing connection strings found:', connectionStrings.length);

  for (const connStr of connectionStrings) {
    try {
      const client = new Client({
        connectionString: connStr,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 5000,
      });
      await client.connect();
      console.log('✅ CONNECTED TO POSTGRES VIA CONNECTION STRING!');

      const sqlContent = fs.readFileSync('supabase/migrations/20261010000000_attendance_sessions.sql', 'utf-8');
      await client.query(sqlContent);
      console.log('✅ MIGRATION EXECUTED SUCCESSFULLY VIA DIRECT PG!');

      const res = await client.query("SELECT table_name FROM information_schema.tables WHERE table_name = 'attendance_sessions';");
      console.log('Verification query:', res.rows);

      await client.end();
      return true;
    } catch (e: any) {
      console.log('Connection failed:', e.message);
    }
  }
  return false;
}

testPgDirect().catch(console.error);
