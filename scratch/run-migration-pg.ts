import dotenv from 'dotenv';
import { Client } from 'pg';

dotenv.config({ path: '.env.local' });

async function run() {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.SUPABASE_DB_URL;
  if (connectionString) {
    console.log('Connecting via connection string...');
    const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
    await client.connect();
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies 
          WHERE schemaname = 'public' 
            AND tablename = 'volunteers' 
            AND policyname = 'Lectura pública de volunteers'
        ) THEN
          CREATE POLICY "Lectura pública de volunteers"
          ON public.volunteers
          FOR SELECT
          USING (true);
        END IF;
      END $$;
    `);
    console.log('? Policy created successfully!');
    await client.end();
    return;
  }
  console.log('No direct connection string found.');
}

run().catch(console.error);
