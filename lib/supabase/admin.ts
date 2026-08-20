import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * Creates a Supabase client that uses SUPABASE_SERVICE_ROLE_KEY if available
 * to bypass RLS for auth operations (like logging in or checking passkeys before login).
 * Does NOT import server headers/cookies to ensure safe bundle isolation for client/server boundary.
 */
export async function getAdminSupabase() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceKey || !supabaseUrl) {
    throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.');
  }

  return createSupabaseClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
