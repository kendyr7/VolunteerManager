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
  // Client Components can call this helper during every render. Reuse one
  // browser client so effects keep stable dependencies and Realtime does not
  // create duplicate WebSocket/channel infrastructure.
  if (typeof window !== 'undefined' && browserClient) return browserClient;

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
          let lastError: unknown;
          for (let attempt = 0; attempt < 3; attempt += 1) {
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
              lastError = err;
              if (attempt < 2) {
                await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
              }
            }
          }
          console.error("Supabase fetch network error:", lastError);
          throw lastError;
        }
      }
    }
  )

  if (typeof window !== 'undefined') {
    browserClient = client;
  }

  return client;
}
