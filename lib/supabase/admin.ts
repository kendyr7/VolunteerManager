import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * Creates a Supabase client that uses SUPABASE_SERVICE_ROLE_KEY if available
 * to bypass RLS for auth operations (like logging in or checking passkeys before login).
 * Does NOT import server headers/cookies to ensure safe bundle isolation for client/server boundary.
 */
export async function getAdminSupabase() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'dummy';

  if (serviceKey && supabaseUrl) {
    return createSupabaseClient(supabaseUrl, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return createSupabaseClient(supabaseUrl || 'http://localhost:54321', anonKey, {
    auth: { persistSession: false }
  });
}
