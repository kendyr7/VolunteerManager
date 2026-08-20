import fs from 'fs';

const results = JSON.parse(fs.readFileSync('scratch/seguridad_audit_results.json', 'utf-8'));

console.log('Total:', results.length);
const active = results.filter(r => r.status === 'active');
const archived = results.filter(r => r.status === 'archived');
console.log('Active:', active.length);
console.log('Archived:', archived.length);
if (archived.length > 0) {
  console.log('Archived records:', archived);
}

// Generate Markdown Table matching template columns:
// Nombres y Apellidos | Edad | Barrio / Rama | Estaca | Teléfono | Comité
let md = `| # | Nombres y Apellidos | Edad | Barrio / Rama | Estaca | Teléfono | Comité | Estado |\n`;
md += `|---|---|---|---|---|---|---|---|\n`;

for (let i = 0; i < results.length; i++) {
  const r = results[i];
  md += `| ${i + 1} | ${r.fullName} | ${r.age || '-'} | ${r.ward || '-'} | ${r.stake || '-'} | ${r.phone || '-'} | ${r.committee} | ${r.status} |\n`;
}

fs.writeFileSync('scratch/seguridad_table.md', md, 'utf-8');
console.log('Done generating table.');
