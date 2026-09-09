import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

// Run the actual actions against an in-memory database and transport.
// These checks never read credentials, send messages or modify live records.
const compile = async file => ts.transpileModule(await readFile(new URL(file, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const actionsSource = await compile('../app/actions/shift-change-actions.ts');
const presentation = {};
vm.runInNewContext(await compile('../lib/shift-change-presentation.ts'), { exports: presentation });

function fixture(options = {}) {
  const request = {
    id: 'request', volunteer_id: 'volunteer', status: options.status || 'pending',
    current_day_key: 'Lun 14', current_shift_key: 'T1',
    requested_day_key: 'Mar 15', requested_shift_key: 'T2',
    reason: 'Motivo de salud',
    volunteers: { id: 'volunteer', first_name: 'Ana', last_name: 'Pérez', phone: options.noPhone ? '' : '+50588889999', committee_id: null },
  };
  const tables = {
    shift_change_requests: [request, ...(options.extraRequests || [])],
    shifts: [{ id: 'original', volunteer_id: 'volunteer', day_key: 'Lun 14', shift_key: 'T1' }],
  };
  const sent = [];
  const updates = [];
  const db = { from(table) {
    let filters = [], mutation = null, value;
    const execute = () => {
      if (options.loadError && !mutation) return { data: null, error: { message: 'Read failed' } };
      if (options.updateError && mutation === 'update') return { data: null, error: { message: 'Write failed' } };
      const rows = tables[table].filter(row => filters.every(([key, expected]) => row[key] === expected));
      if (mutation === 'update') {
        if (options.concurrentResolution) return { data: [], error: null };
        rows.forEach(row => Object.assign(row, value));
        updates.push(value);
      }
      if (mutation === 'delete') tables[table] = tables[table].filter(row => !rows.includes(row));
      if (mutation === 'upsert') {
        const row = { id: 'replacement', ...value };
        tables[table].push(row);
        return { data: [row], error: null };
      }
      return { data: rows, error: null };
    };
    return {
      select() { return this; }, order() { return this; },
      eq(key, expected) { filters.push([key, expected]); return this; },
      update(data) { mutation = 'update'; value = data; return this; },
      delete() { mutation = 'delete'; return this; },
      upsert(data) { mutation = 'upsert'; value = data; return this; },
      single() { return this.maybeSingle(); },
      maybeSingle() { const result = execute(); return Promise.resolve({ ...result, data: result.data?.[0] || null }); },
      then(resolve, reject) { return Promise.resolve(execute()).then(resolve, reject); },
    };
  } };
  const exports = {};
  vm.runInNewContext(actionsSource, {
    exports, process: { env: { SUPABASE_SERVICE_ROLE_KEY: 'fake', NEXT_PUBLIC_SUPABASE_URL: 'https://example.invalid' } },
    console: { error() {}, warn() {} },
    require: name => {
      if (name === '@supabase/supabase-js') return { createClient: () => db };
      if (name === '@/lib/supabase/server') return { createClient: () => db };
      if (name === '@/lib/authorization') {
        const authorize = async () => {
          if (options.denied) throw new Error('No autorizado');
          return { userId: 'reviewer', name: 'Coordinador', role: 'Admin' };
        };
        return { requireCapability: authorize, requireVolunteerCapability: authorize };
      }
      if (name === '@/lib/role-permissions') return { hasCapability: () => true };
      if (name === '@/lib/whatsapp') return { formatE164: phone => phone };
      if (name === '@/lib/whatsapp-api') return { sendShiftChangeResultTemplate: async payload => {
        sent.push(payload);
        if (options.transport === 'throw') throw new Error('Network failed');
        return { success: options.transport !== 'failed' };
      } };
      if (name === '@/lib/dates') return { isShiftAvailableForDay: () => true };
      if (name === '@/app/actions/activity-actions') return { createActivityLog: async () => true };
      if (name === '@/lib/services/shift-broadcast.service') return { broadcastShiftSync() {} };
      if (name === '@/lib/push/service') return { schedulePushDispatch() {} };
      if (name === '@/lib/shift-coverage' || name === '@/lib/services/shift-change-request.service') return {};
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return { actions: exports, request, tables, sent, updates };
}

const list = fixture({ extraRequests: [
  { id: 'portal-pending', status: 'pending' },
  { id: 'whatsapp-approved', status: 'approved' },
  { id: 'portal-rejected', status: 'rejected' },
] });
assert.equal((await list.actions.fetchAllShiftChangeRequestsAction()).requests.length, 4);
assert.deepEqual(Array.from((await list.actions.fetchPendingShiftChangeRequestsAction()).requests, row => row.id), ['request', 'portal-pending']);
assert.equal((await fixture({ loadError: true }).actions.fetchAllShiftChangeRequestsAction()).success, false, 'Database failure is not an empty inbox');
assert.equal((await fixture({ denied: true }).actions.fetchAllShiftChangeRequestsAction()).success, false);

for (const status of ['approved', 'rejected']) {
  for (const transport of ['sent', 'failed', 'throw', 'unavailable']) {
    const test = fixture({ transport, noPhone: transport === 'unavailable' });
    const result = status === 'approved'
      ? await test.actions.approveShiftChangeRequestAction('request')
      : await test.actions.rejectShiftChangeRequestAction('request', '  Cambio no autorizado por el coordinador  ');
    assert.equal(result.success, true);
    assert.equal(result.notification, transport === 'throw' ? 'failed' : transport);
    assert.equal(test.request.status, status, 'Notification errors do not undo the saved decision');
    assert.equal(test.sent.length, transport === 'unavailable' ? 0 : 1);
    if (status === 'approved') {
      assert.equal(test.tables.shifts.length, 1);
      assert.equal(test.tables.shifts[0].shift_key, 'T2');
    } else {
      assert.equal(test.request.rejection_reason, 'Cambio no autorizado por el coordinador');
    }
    const message = presentation.shiftChangeResolutionMessage(status, result.notification);
    assert.match(message, /portal/);
    assert.match(message, transport === 'sent' ? /entrega aún no está confirmada/ : /No (se envió|se pudo enviar)/);
  }
  const failed = fixture({ updateError: true });
  const result = status === 'approved'
    ? await failed.actions.approveShiftChangeRequestAction('request')
    : await failed.actions.rejectShiftChangeRequestAction('request', 'Motivo');
  assert.equal(result.success, false);
  assert.equal(failed.sent.length, 0, 'Never notify a decision that failed to save');
}

for (const status of ['approved', 'rejected']) {
  const test = fixture({ status });
  assert.equal((await test.actions.rejectShiftChangeRequestAction('request', 'Motivo')).success, false);
  assert.equal(test.updates.length, 0);
  assert.equal(test.sent.length, 0);
}
const racing = fixture({ concurrentResolution: true });
assert.equal((await racing.actions.rejectShiftChangeRequestAction('request', 'Motivo')).success, false);
assert.equal(racing.sent.length, 0);
const emptyReason = fixture();
assert.equal((await emptyReason.actions.rejectShiftChangeRequestAction('request', '   ')).success, false);
assert.equal(emptyReason.updates.length, 0);
const denied = fixture({ denied: true });
assert.equal((await denied.actions.rejectShiftChangeRequestAction('request', 'Motivo')).success, false);
assert.equal(denied.updates.length, 0);
console.log('PASS: mixed request states, load errors, permissions, approval/rejection persistence, WhatsApp outcomes, required rejection reasons and stale decisions.');
