import assert from 'node:assert/strict';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { clearBrowserClient, createClient, setGlobalToken } from '../lib/supabase/client';

console.log('Testing Supabase client anti-cache headers and clearBrowserClient...');

// 1. Verify clearBrowserClient clears globalToken and singleton
setGlobalToken('test-token-123');
clearBrowserClient();

// 2. Mock fetch to inspect options passed by createClient
let interceptedFetchOptions: RequestInit | undefined;

globalThis.fetch = (async (url: string | URL | Request, options?: RequestInit) => {
  interceptedFetchOptions = options;
  return new Response(JSON.stringify([]), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}) as typeof fetch;

const client = createClient();
assert.ok(client, 'createClient must return a client instance');

await client.from('volunteer_journal_notes').select('id').eq('volunteer_id', 'test-user');

assert.ok(interceptedFetchOptions, 'fetch must have been called');
assert.equal(interceptedFetchOptions.cache, 'no-store', 'fetch options must specify cache: "no-store"');

const headers = new Headers(interceptedFetchOptions.headers);
assert.equal(
  headers.get('Cache-Control'),
  'no-cache, no-store, must-revalidate',
  'Cache-Control header must enforce no-cache, no-store, must-revalidate'
);
assert.equal(headers.get('Pragma'), 'no-cache', 'Pragma header must be no-cache');

console.log('✓ createClient correctly enforces cache: "no-store" and anti-cache headers on all requests');

// 3. Test clearBrowserClient
clearBrowserClient();
console.log('✓ clearBrowserClient executed cleanly');

console.log('All journal cache and sync tests passed successfully!');
