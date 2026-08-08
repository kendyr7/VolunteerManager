import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function checkOpenApi() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const resp = await fetch(`${url}/rest/v1/`, {
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`
    }
  });

  const spec = await resp.json();
  const paths = Object.keys(spec.paths || {});
  const rpcs = paths.filter(p => p.startsWith('/rpc/'));
  console.log('Available RPC endpoints in Supabase:', rpcs);
}

checkOpenApi().catch(console.error);
