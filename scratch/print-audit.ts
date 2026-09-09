import * as fs from 'fs';

const data = JSON.parse(fs.readFileSync('scratch/no-shifts-audit-results.json', 'utf8'));

console.log('TOTAL:', data.total);
for (const [comm, stats] of Object.entries<any>(data.commBreakdown)) {
  console.log(`\n=== ${comm} (Total: ${stats.total} | Activos: ${stats.active} | Archivados: ${stats.archived}) ===`);
  const list = data.volunteers.filter((v: any) => v.subcomite === comm);
  list.forEach((v: any, i: number) => {
    console.log(`${i + 1}. ${v.nombre} | Tel: ${v.telefono} | Estado: ${v.estado} | Estaca: ${v.estaca} | Barrio: ${v.barrio}`);
  });
}
