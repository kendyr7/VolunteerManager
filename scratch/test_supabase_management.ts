import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function testManagementApi() {
  console.log('Testing Supabase REST endpoints...');
  const res = await fetch(`${supabaseUrl}/rest/v1/`, {
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`
    }
  });

  console.log('OpenAPI Schema Status:', res.status);
  const swagger = await res.json();
  const paths = Object.keys(swagger.paths || {});
  console.log('Available RPC paths:', paths.filter(p => p.includes('rpc')));
}

testManagementApi().catch(console.error);
