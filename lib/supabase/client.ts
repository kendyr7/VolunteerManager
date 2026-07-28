import { createBrowserClient } from '@supabase/ssr'

let globalToken: string | null = null;

export function setGlobalToken(token: string | null) {
  globalToken = token;
}

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
}
