// Runs the real journal components and CSS in Chromium with a synthetic DB.
// No credentials, production requests, or real volunteer records are used.
// PLAYWRIGHT_PACKAGE may point to the desktop app's bundled playwright package.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const ts = require('typescript');
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const root = path.resolve(__dirname, '..');

// Small CommonJS fixture bundler: transpile TSX, retain the real React runtime,
// and replace only the Supabase boundary. CSS module names stay readable.
const modules = new Map();
function bundle(file, source) {
  if (modules.has(file)) return modules.get(file).id;
  const item = { id: modules.size, code: '' };
  modules.set(file, item);
  if (file.endsWith('.css')) {
    item.code = 'module.exports = new Proxy({}, {get: (_, key) => key === "__esModule" ? false : key});';
    return item.id;
  }
  if (file === path.join(root, 'lib/supabase/client.ts')) {
    item.code = 'exports.createClient = () => window.testDb;';
    return item.id;
  }
  let code = source ?? fs.readFileSync(file, 'utf8');
  if (/\.[mt]sx?$/.test(file)) code = ts.transpileModule(code, { compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020, esModuleInterop: true,
  } }).outputText;
  item.code = code.replace(/require\(['"]([^'"]+)['"]\)/g, (_, name) => {
    let resolved;
    const target = name.startsWith('@/') ? path.join(root, name.slice(2))
      : name.startsWith('.') ? path.resolve(path.dirname(file), name) : null;
    if (target) resolved = [target, ...['.ts', '.tsx', '.js', '.cjs'].map(ext => target + ext)]
      .find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
    if (!resolved) resolved = require.resolve(name, { paths: [path.dirname(file)] });
    return `require(${bundle(resolved)})`;
  });
  return item.id;
}
const entry = bundle(path.join(root, 'journal-test-entry.tsx'), `
import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { JournalProvider, useJournal } from './components/journal/JournalProvider';
import { VolunteerJournal } from './components/journal/VolunteerJournal';
function Probe() {
  const journal = useJournal('synthetic-volunteer');
  useEffect(() => { window.journal = journal; });
  return null;
}
createRoot(document.getElementById('root')).render(<JournalProvider>
  <VolunteerJournal volunteerId="synthetic-volunteer" days={['2026-09-16']} /><Probe />
</JournalProvider>);
`);
const script = `const process={env:{NODE_ENV:'development'}}; const modules={${[...modules.values()]
  .map(item => `${item.id}:function(module,exports,require){${item.code}\n}`).join(',')}};
const cache={}; function require(id){if(cache[id])return cache[id].exports;
const module=cache[id]={exports:{}};modules[id](module,module.exports,require);return module.exports;}
require(${entry});`;
const css = fs.readFileSync(path.join(root, 'components/journal/journal.module.css'), 'utf8')
  .replace(/:global\(([^)]+)\)/g, '$1');
const server = http.createServer((req, res) => {
  if (req.url === '/icons.woff2') {
    res.setHeader('Content-Type', 'font/woff2');
    return res.end(fs.readFileSync(path.join(root, 'node_modules/material-symbols/material-symbols-outlined.woff2')));
  }
  res.setHeader('Content-Type', req.url === '/app.js' ? 'text/javascript' : 'text/html');
  res.end(req.url === '/app.js' ? script : `<!doctype html><html lang="es"><meta charset="utf-8">
    <style>:root{--dark2:white;--dark3:#f4f4f4;--text:#222;--border:#ddd}body{margin:0;font-family:Arial}
    @font-face{font-family:MaterialSymbols;src:url('/icons.woff2')}
    .material-symbols-outlined{font-family:MaterialSymbols;font-size:24px;font-weight:normal;font-style:normal;line-height:1;display:inline-block;white-space:nowrap;font-feature-settings:'liga'}
    *{box-sizing:border-box}button,input{font:inherit}${css}</style>
    <div id="root"></div><script src="/app.js"></script></html>`);
});

async function installDatabase(page) {
  await page.addInitScript(() => {
    localStorage.setItem('vm_journal_tour_seen_v1', 'true');
    const note = (id, title, html) => ({ id, volunteer_id: 'synthetic-volunteer', title,
      content_html: html, content_text: 'Primer párrafo Segundo párrafo Tarea', content_version: 1,
      color: 'sky', pattern: 'lines', is_pinned: false, tags: ['existente'], shift_date: null,
      revision: 7, created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-02T00:00:00Z' });
    const legacy = '<p>Primer párrafo normal con <b>negrita</b></p><div style="display:flex;gap:8px"><input type="checkbox"><span>Tarea</span><div>Segundo párrafo normal</div></div><p>Último párrafo</p>';
    window.dbState = { rows: [note('a', 'Nota existente', legacy), note('b', 'Otra nota', '<p>Intacta</p>')],
      requests: [], failWrites: false, delay: 30 };
    window.originalRows = JSON.parse(JSON.stringify(window.dbState.rows));
    window.testDb = { from(table) {
      const query = { table, method: 'GET', payload: null, ids: null };
      const builder = {
        select() { return builder; }, eq() { return builder; }, order() { return builder; },
        in(column, ids) { query.ids = ids; return builder; },
        upsert(payload) { query.method = 'POST'; query.payload = payload; return builder; },
        delete() { query.method = 'DELETE'; return builder; },
        then(resolve, reject) {
          window.dbState.requests.push(structuredClone(query));
          return new Promise(done => setTimeout(() => {
            if (query.method !== 'GET' && window.dbState.failWrites) return done({ error: { message: 'Synthetic offline' } });
            if (query.method === 'POST') for (const row of query.payload) {
              const index = window.dbState.rows.findIndex(item => item.id === row.id);
              if (index < 0) window.dbState.rows.push(row);
              else window.dbState.rows[index] = { ...window.dbState.rows[index], ...row };
            }
            if (query.method === 'DELETE') window.dbState.rows = window.dbState.rows.filter(row => !query.ids.includes(row.id));
            done({ data: structuredClone(window.dbState.rows), error: null });
          }, window.dbState.delay)).then(resolve, reject);
        },
      };
      return builder;
    } };
  });
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    fs.mkdirSync(path.join(root, 'outputs/journal'), { recursive: true });
    for (const [label, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
      const page = await browser.newPage({ viewport });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
      await installDatabase(page);
      await page.goto(origin);
      await page.waitForFunction(() => window.journal?.status === 'ready');
      assert.deepEqual(await page.evaluate(() => window.dbState.rows), await page.evaluate(() => window.originalRows));
      assert.equal(await page.evaluate(() => window.dbState.requests.length), 1, 'Load is deduplicated');
      const card = page.getByRole('article', { name: 'Nota: Nota existente', exact: true });
      if (label === 'mobile') await card.getByTitle('Expandir').click();
      await card.locator('input[type=checkbox]').click();
      await page.waitForFunction(() => window.dbState.rows[0].content_html.includes('checked'));
      assert.equal(await card.locator('input[type=checkbox]').isChecked(), true);
      await card.locator('input[type=checkbox]').focus();
      await page.keyboard.press('Space');
      await page.waitForFunction(() => !window.dbState.rows[0].content_html.includes('checked'));
      assert.equal(await page.evaluate(() => window.dbState.requests.filter(r => r.method === 'GET').length), 1);
      // Another device creates one note and edits another. Saving A must touch neither.
      await page.evaluate(() => {
        window.dbState.rows.push({ ...window.dbState.rows[1], id: 'remote', title: 'Nueva desde otro dispositivo' });
        window.dbState.rows[1].content_html = '<p>Cambio remoto que debe conservarse</p>';
        window.getSelection()?.removeAllRanges();
      });
      if (label === 'mobile') await card.getByTitle('Abrir editor completo').click();
      else await card.getByRole('heading', { name: 'Nota existente' }).click();
      const editor = page.getByRole('textbox', { name: 'Contenido de la nota' });
      await editor.waitFor();
      assert.equal(await editor.locator('div').first().evaluate(el => getComputedStyle(el).display), 'block', 'Legacy flex rows stay in document flow');
      await editor.locator('input').click();
      await page.waitForFunction(() => window.dbState.rows[0].content_html.includes('checked'));
      await editor.locator('input').click();
      await page.waitForFunction(() => !window.dbState.rows[0].content_html.includes('checked'));
      await editor.click();
      await page.keyboard.press('Control+End');
      await page.keyboard.press('Enter');
      await page.keyboard.type('Texto normal añadido sin columnas');
      await page.waitForFunction(() => window.dbState.rows[0].content_html.includes('Texto normal añadido sin columnas'));
      const snapshot = await page.evaluate(() => window.dbState.rows);
      assert.equal(snapshot.length, 3);
      assert.equal(snapshot[1].content_html, '<p>Cambio remoto que debe conservarse</p>');
      assert.equal(snapshot[0].created_at, '2026-09-01T00:00:00Z');
      assert.deepEqual(snapshot[0].tags, ['existente']);
      assert.equal(snapshot[0].color, 'sky');
      assert.equal(snapshot[0].pattern, 'lines');
      await page.screenshot({ path: path.join(root, `outputs/journal/${label}.png`), fullPage: true });
      // A failed save remains pending; retry sends the draft instead of reloading.
      await page.evaluate(() => { window.dbState.failWrites = true; });
      await editor.click();
      await page.keyboard.press('Control+End');
      await page.keyboard.type(' Borrador sin conexión');
      await page.waitForFunction(() => window.journal.status === 'error');
      assert.equal(await page.evaluate(() => window.journal.hasPendingChanges()), true);
      assert.equal(await page.evaluate(() => window.journal.saveAndFlush()), false, 'Navigation cannot report a failed save as successful');
      await page.evaluate(() => { window.dbState.failWrites = false; });
      await page.getByRole('button', { name: 'Reintentar', exact: true }).click({ force: true });
      await page.waitForFunction(() => window.dbState.rows[0].content_html.includes('Borrador sin conexión'));
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !window.journal.hasPendingChanges());
      assert.equal(await page.evaluate(() => window.dbState.requests.filter(r => r.method === 'GET').length), 1);
      assert.equal(await page.evaluate(() => window.dbState.requests.filter(r => r.method === 'DELETE').length), 0);
      // A remount restores serialized checkbox state and all existing metadata.
      const persisted = await page.evaluate(() => window.dbState.rows);
      await page.addInitScript(rows => { window.dbState.rows = rows; }, persisted);
      await page.reload();
      await page.waitForFunction(() => window.journal?.status === 'ready');
      assert.deepEqual(await page.evaluate(() => window.dbState.rows), persisted);
      // Merely reading an old note cannot sanitize or rewrite its stored content.
      const reloaded = page.getByRole('article', { name: 'Nota: Nota existente', exact: true });
      if (label === 'mobile') {
        await reloaded.getByTitle('Expandir').click();
        await reloaded.getByTitle('Abrir editor completo').click();
      } else await reloaded.getByRole('heading', { name: 'Nota existente' }).click();
      await page.getByRole('textbox', { name: 'Contenido de la nota' }).waitFor();
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => window.journal.status === 'ready');
      assert.deepEqual(await page.evaluate(() => window.dbState.rows), persisted);
      assert.equal(await page.evaluate(() => window.dbState.requests.filter(r => r.method !== 'GET').length), 0);
      // Only an explicitly confirmed deletion may remove a known note.
      await reloaded.getByTitle('Eliminar nota').click();
      await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
      assert.equal(await page.evaluate(() => window.dbState.rows.length), 3);
      await reloaded.getByTitle('Eliminar nota').click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Eliminar nota', exact: true }).click();
      await page.waitForFunction(() => window.dbState.rows.length === 2);
      assert.deepEqual(await page.evaluate(() => window.dbState.rows.map(row => row.id)), ['b', 'remote']);
      // New checklists also survive save and reopen.
      await page.getByRole('button', { name: /Escribe una nota/ }).click();
      await page.getByPlaceholder('Título', { exact: true }).fill('Nota nueva de prueba');
      await page.getByTitle('Lista de tareas', { exact: true }).click();
      const creator = page.getByRole('textbox', { name: 'Contenido de la nota' });
      await creator.locator('input[type=checkbox]').click();
      await page.waitForFunction(() => window.dbState.rows.some(row => row.title === 'Nota nueva de prueba' && row.content_html.includes('checked')));
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !window.journal.hasPendingChanges());
      assert.equal(await page.getByRole('article', { name: 'Nota: Nota nueva de prueba', exact: true }).locator('input').isChecked(), true);
      assert.deepEqual(errors, []);
      console.log(`PASS ${label}: legacy content, checkbox mouse/keyboard/editor, autosave, offline retry, remote notes, reload, confirmed deletion, new checklist`);
      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
