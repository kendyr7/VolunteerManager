import fs from 'fs';

const groups = JSON.parse(fs.readFileSync('scratch/classified_groups.json', 'utf-8'));

let md = '# INVENTARIO COMPLETO DE LOS 59 GRUPOS DE TELÉFONOS DUPLICADOS\n\n';

groups.forEach((g: any) => {
  md += `### Grupo ${g.groupIndex}: Teléfono Normalizado ${g.phone_normalized} (${g.volunteers.length} registros) - Categoría ${g.categoryCode} [${g.category}]\n`;
  md += `**Motivo de Clasificación**: ${g.reason}\n\n`;
  md += `| ID Voluntario | Nombre Completo | Teléfono Almacenado | Estado | Edad | Comité | Estaca / Barrio | Creado En |\n`;
  md += `| :--- | :--- | :--- | :---: | :---: | :--- | :--- | :--- |\n`;
  g.volunteers.forEach((v: any) => {
    md += `| \`${v.id.slice(0, 8)}\` | ${v.first_name} ${v.last_name} | \`${v.raw_phone}\` | **${v.status}** | ${v.age ?? 'N/A'} | ${v.committee} | ${v.stake || 'N/A'} / ${v.neighborhood || 'N/A'} | ${v.created_at ? v.created_at.slice(0, 10) : 'N/A'} |\n`;
  });
  md += `\n---\n\n`;
});

fs.writeFileSync('scratch/inventory_output.md', md);
console.log('Formatted markdown inventory written to scratch/inventory_output.md');
