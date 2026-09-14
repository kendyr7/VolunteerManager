const assert = require('node:assert/strict');
const path = require('node:path');
const { createJiti } = require('jiti');

const jiti = createJiti(__filename, { alias: { '@': path.resolve(__dirname, '..') } });
const { findWhatsAppSenderProfiles, phoneMatchesSender } = jiti('../lib/services/whatsapp-sender-lookup.ts');

function mockSupabase(tables, failOnPage = -1) {
  const pages = [];
  return {
    pages,
    from(table) {
      return {
        select() {
          let rows = tables[table];
          return {
            or(filter) {
              rows = rows.filter(record => filter.includes('neq.archived')
                ? record.status !== 'archived'
                : !record.status || record.status === 'active');
              return this;
            },
            order(column) {
              rows = [...rows].sort((a, b) => a[column].localeCompare(b[column]));
              return this;
            },
            async range(from, to) {
              pages.push({ table, from, to });
              if (from / 1000 === failOnPage) return { data: null, error: { message: 'Synthetic page failure' } };
              return { data: rows.slice(from, to + 1), error: null };
            },
          };
        },
      };
    },
  };
}

async function main() {
  const volunteers = Array.from({ length: 1080 }, (_, i) => ({
    id: `v${String(i).padStart(4, '0')}`,
    phone: `+505${String(70000000 + i)}`,
    status: 'active',
  }));
  volunteers[1079].phone = '+505 8888-9999';
  volunteers[17].phone = '88889999';
  volunteers.push({ id: 'v1080', phone: '+50588889999', status: 'archived' });
  const supabase = mockSupabase({ volunteers, profiles: [] });
  const matches = await findWhatsAppSenderProfiles(supabase, 'volunteers', 'id, phone, status', '50588889999');
  assert.deepEqual(matches.map(record => record.id), ['v0017', 'v1079']);
  assert.deepEqual(supabase.pages, [
    { table: 'volunteers', from: 0, to: 999 },
    { table: 'volunteers', from: 1000, to: 1999 },
  ]);

  volunteers[1079].phone = '+50587776666';
  assert.equal(phoneMatchesSender(volunteers[1079].phone, '50588889999'), false);
  assert.equal(phoneMatchesSender(volunteers[1079].phone, '50587776666'), true);
  assert.deepEqual((await findWhatsAppSenderProfiles(
    mockSupabase({ volunteers, profiles: [] }), 'volunteers', 'id, phone, status', '50587776666',
  )).map(record => record.id), ['v1079']);

  const failed = mockSupabase({ volunteers, profiles: [] }, 1);
  await assert.rejects(
    findWhatsAppSenderProfiles(failed, 'volunteers', 'id, phone, status', '50587776666'),
    /Synthetic page failure/,
  );
  console.log('PASS búsqueda paginada, teléfonos compartidos, cambio de número y error de página');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
