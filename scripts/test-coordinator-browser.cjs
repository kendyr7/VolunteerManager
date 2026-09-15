// Runs against a local production build. Every data request is intercepted;
// all records and authentication identity are synthetic, with no DB access.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createJiti } = require('jiti');
const jiti = createJiti(__filename, { fsCache: false, alias: { '@': path.resolve(__dirname, '..') } });
require('@next/env').loadEnvConfig(process.cwd());
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const { signSession } = jiti('../lib/auth.ts');
const { EMPTY_AUTHORIZATION_SNAPSHOT, CONFIGURABLE_PERMISSION_DEFAULTS } = jiti('../lib/role-permissions.ts');
const origin = 'http://localhost:3005';
const manifest = JSON.parse(fs.readFileSync('.next/server/server-reference-manifest.json', 'utf8'));
const actionNames = new Map(Object.entries(manifest.node).map(([id, action]) => [id, Object.values(action.workers)[0].exportedName]));
const buildId = fs.readFileSync('.next/BUILD_ID', 'utf8').trim();
const snapshot = { ...EMPTY_AUTHORIZATION_SNAPSHOT, authenticated: true, userType: 'profile',
  userId: '00000000-0000-4000-8000-000000000001', name: 'Prueba de rendimiento', role: 'Admin',
  permissions: Object.fromEntries(Object.keys(CONFIGURABLE_PERMISSION_DEFAULTS).map(key => [key, true])) };
const token = signSession({ userId: snapshot.userId, userType: 'profile', role: 'Admin', committee: '' });
const volunteers = Array.from({ length: 1253 }, (_, i) => ({ id: `v${i}`, first_name: `${String.fromCharCode(65 + i % 26)}nombre`,
  last_name: `Prueba${String(i).padStart(4, '0')}`, phone: '88888888', stake: 'Estaca de prueba', neighborhood: 'Barrio de prueba',
  committee_id: 'c1', committees: { name: 'Seguridad' }, status: 'active', age: 25 }));
const shifts = volunteers.map((vol, i) => ({ id: `s${i}`, volunteer_id: vol.id, day_key: 'lun 14', shift_key: `T${i % 4 + 1}`,
  checked_in: false, checked_out: false }));

(async () => {
  fs.mkdirSync('outputs/performance', { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    for (const [label, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
      const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
      await context.addCookies([{ name: 'session', value: token, url: origin }, { name: 'unofficial_site_ack', value: '1', url: origin }]);
      const page = await context.newPage();
      const errors = [];
      const actions = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => {
        // Existing decorative SVG path warning is unrelated to these changes.
        if (message.type() === 'error' && !message.text().includes('<path> attribute d')) errors.push(message.text());
      });
      await page.routeWebSocket(/.*/, socket => socket.close());
      await page.route('**/*', async route => {
        const request = route.request();
        const url = new URL(request.url());
        const action = request.headers()['next-action'];
        const json = value => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(value) });
        if (action) {
          const name = actionNames.get(action);
          actions.push(name || 'unknown');
          let value = [];
          if (name === 'getCurrentAuthorizationAction') value = { success: true, snapshot };
          else if (name === 'getReminderDeliveryLogsAction') value = { success: true, logs: [] };
          else if (name !== 'getAttendanceSessionsAction') value = { success: true, data: [] };
          return route.fulfill({ status: 200, contentType: 'text/x-component',
            body: `0:${JSON.stringify({ a: '$@1', b: buildId, f: '' })}\n1:${JSON.stringify(value)}\n` });
        }
        if (url.pathname.startsWith('/rest/v1/')) {
          const table = url.pathname.split('/').pop();
          const records = table === 'volunteers' ? volunteers : table === 'shifts' ? shifts
            : table === 'committees' ? [{ id: 'c1', name: 'Seguridad', status: 'active' }] : [];
          const offset = Number(url.searchParams.get('offset') || 0);
          const limit = Number(url.searchParams.get('limit') || 1000);
          return json(records.slice(offset, offset + limit));
        }
        if (url.pathname.startsWith('/api/')) return json(url.pathname.includes('/auth/session') ? { token }
          : { items: [], unreadCount: 0, todayCount: 0, nextCursor: null, asOf: new Date().toISOString(), success: true });
        if (url.origin !== origin || !['GET', 'HEAD'].includes(request.method())) return json({});
        return route.continue();
      });
      const start = performance.now();
      await page.goto(`${origin}/volunteers`, { waitUntil: 'domcontentloaded' });
      await page.getByText('Anombre Prueba0000', { exact: false }).first().waitFor({ timeout: 15000 }).catch(async error => {
        await page.screenshot({ path: `outputs/performance/failure-${label}.png` });
        console.log({ actions, errors, body: (await page.locator('body').innerText()).slice(0, 1800) });
        throw error;
      });
      const elapsed = Math.round(performance.now() - start);
      const rows = page.locator('[data-item-index]');
      const count = await rows.count();
      assert.ok(count > 0 && count < 80, `Expected bounded rendered rows, got ${count}`);
      if (label === 'desktop') {
        await rows.first().locator('.pr-3').click();
        await page.getByText('voluntario seleccionado', { exact: true }).waitFor();
      }
      await page.locator('[data-letter="Z"]').click();
      await page.getByText('Znombre', { exact: false }).first().waitFor();
      await page.locator('[data-letter="A"]').click();
      await page.getByText('Anombre Prueba0000', { exact: false }).first().waitFor();
      if (label === 'desktop') {
        await page.getByText('voluntario seleccionado', { exact: true }).waitFor();
        assert.ok(await rows.first().locator('.pr-3 svg').count(), 'Selection must survive unmount and remount');
        await rows.first().locator('.pr-3').click();
      }
      const search = page.getByPlaceholder(/buscar/i).first();
      await search.fill('Prueba1252');
      await search.press('Enter');
      await page.getByText('Enombre Prueba1252', { exact: false }).first().waitFor();
      assert.ok(await rows.count() <= 2, 'Filtering should narrow the virtual list');
      await search.fill('');
      await search.press('Enter');
      await page.getByText('Anombre Prueba0000', { exact: false }).first().waitFor();
      await page.screenshot({ path: `outputs/performance/volunteers-${label}.png` });
      await page.goto(`${origin}/shifts`, { waitUntil: 'domcontentloaded' });
      await page.getByText(/Lunes\s*14/i).first().click();
      await page.getByText('Anombre Prueba0000', { exact: false }).first().waitFor({ timeout: 10000 }).catch(async error => {
        await page.screenshot({ path: `outputs/performance/failure-shifts-${label}.png` });
        console.log({ actions, errors, body: (await page.locator('body').innerText()).slice(0, 2200) });
        throw error;
      });
      await page.screenshot({ path: `outputs/performance/shifts-${label}.png` });
      assert.deepEqual(errors, [], 'Browser runtime errors');
      console.log(`PASS ${label}: ${count}/1253 rows mounted, alphabet jumps, filtering, both routes; initial load ${elapsed}ms`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
