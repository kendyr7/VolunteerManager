import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from './server';

/**
 * Creates a Supabase client that uses SUPABASE_SERVICE_ROLE_KEY if available
 * to bypass RLS for auth operations (like logging in or checking passkeys before login).
 * Falls back to normal server client if service role key is not defined.
 */
export async function getAdminSupabase() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (serviceKey && supabaseUrl) {
    return createSupabaseClient(supabaseUrl, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return await createClient();
}
