import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

let globalToken: string | null = null;
let browserClient: SupabaseClient | null = null;

export function setGlobalToken(token: string | null) {
  if (globalToken === token) return;

  globalToken = token;

  // Postgres Changes applies RLS using the JWT attached to the Realtime
  // WebSocket, so keep the already-created browser client in sync as well.
  if (browserClient) {
    void browserClient.realtime.setAuth(token).catch((error) => {
      console.error('Supabase Realtime auth failed:', error);
    });
  }
}

export function createClient() {
  const client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // The custom application JWT must authenticate both HTTP requests and
      // Realtime subscriptions. Supabase forwards this callback to both.
      accessToken: async () => globalToken,
      global: {
        fetch: async (url, options = {}) => {
          if (globalToken) {
            const headers = new Headers(options.headers);
            headers.set('Authorization', `Bearer ${globalToken}`);
            options.headers = headers;
          }
          try {
            const res = await fetch(url, options);
            if (!res.ok) {
              const text = await res.text();
              // Don't trigger console.error overlay for 404 missing table schema errors (PGRST205)
              if (res.status !== 404 && !text.includes('PGRST205')) {
                console.error("Supabase fetch failed:", res.status, res.statusText, text);
              }
              // Devolver un objeto Response que supabase pueda parsear
              return new Response(text, { status: res.status, statusText: res.statusText, headers: res.headers });
            }
            return res;
          } catch (err) {
            console.error("Supabase fetch network error:", err);
            throw err;
          }
        }
      }
    }
  )

  if (typeof window !== 'undefined') {
    browserClient = client;
  }

  return client;
}
