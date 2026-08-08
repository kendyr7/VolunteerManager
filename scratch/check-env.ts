import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

console.log('Environment variables present:');
console.log('NEXT_PUBLIC_SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
console.log('SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'EXISTS (length ' + process.env.SUPABASE_SERVICE_ROLE_KEY.length + ')' : 'MISSING');
console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'EXISTS' : 'MISSING');
console.log('POSTGRES_URL:', process.env.POSTGRES_URL ? 'EXISTS' : 'MISSING');
