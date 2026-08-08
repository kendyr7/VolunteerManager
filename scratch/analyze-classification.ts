import fs from 'fs';

interface Vol {
  id: string;
  first_name: string;
  last_name: string;
  raw_phone: string;
  status: string;
  age: number | null;
  stake: string;
  neighborhood: string;
  committee: string;
  created_at: string;
}

interface Group {
  groupIndex: number;
  phone_normalized: string;
  count: number;
  volunteers: Vol[];
}

const groups: Group[] = JSON.parse(fs.readFileSync('scratch/duplicate_groups.json', 'utf-8'));

function classifyGroup(g: Group): { cat: string; catCode: string; reason: string } {
  const vols = g.volunteers;
  const statuses = Array.from(new Set(vols.map(v => v.status)));
  const rawPhones = Array.from(new Set(vols.map(v => v.raw_phone)));
  
  const names = vols.map(v => `${v.first_name} ${v.last_name}`.trim().toLowerCase());
  const firstNames = vols.map(v => v.first_name.trim().toLowerCase());
  const lastNames = vols.map(v => v.last_name.trim().toLowerCase());
  const ages = vols.map(v => v.age);

  // Check format difference first if raw phones differ
  const hasFormatDiff = rawPhones.length > 1;

  // Check Active + Archived
  const isActiveArchived = statuses.includes('active') && statuses.includes('archived');

  // Check Same Person Duplicate
  // If first names match or names are very similar
  const isSamePerson = names.every(n => n === names[0]) || 
    (firstNames.every(fn => fn === firstNames[0]) && lastNames.some(ln => ln.includes(lastNames[0]) || lastNames[0].includes(ln)));

  // Check Family / Minor / Shared
  // Share last name or stake/ward and different first names, or minors (<18)
  const containsMinor = ages.some(a => a !== null && a < 18);
  const sharesLastNamePart = lastNames.some((ln1, i) => 
    lastNames.some((ln2, j) => i !== j && (ln1.includes(ln2) || ln2.includes(ln1) || ln1.split(' ').some(part => part.length > 2 && ln2.includes(part))))
  );
  const sharesWardOrStake = vols.some((v1, i) => vols.some((v2, j) => i !== j && (v1.neighborhood === v2.neighborhood || v1.stake === v2.stake)));

  if (isActiveArchived && !isSamePerson) {
    return {
      catCode: 'D',
      cat: 'ACTIVE + ARCHIVED',
      reason: `Un registro activo y otro archivado (${statuses.join(' + ')}). Posible reutilización o actualización de registro.`
    };
  }

  if (isSamePerson) {
    return {
      catCode: 'A',
      cat: 'DUPLICADO PROBABLE DE LA MISMA PERSONA',
      reason: `Nombres coincidentes ("${vols[0].first_name} ${vols[0].last_name}"). Mismo usuario registrado múltiples veces.${hasFormatDiff ? ' Presenta además diferencia de formato.' : ''}`
    };
  }

  if (hasFormatDiff && !containsMinor && !sharesLastNamePart) {
    return {
      catCode: 'C',
      cat: 'DIFERENCIA DE FORMATO',
      reason: `Mismo número almacenado con formatos distintos: ${rawPhones.join(' vs ')}.`
    };
  }

  if (containsMinor || sharesLastNamePart || sharesWardOrStake) {
    const minorNote = containsMinor ? ' Incluye menor de edad.' : '';
    const lastNote = sharesLastNamePart ? ' Comparten apellido/familia.' : '';
    return {
      catCode: 'B',
      cat: 'FAMILIA / TUTOR / MENORES',
      reason: `Misma estaca/barrio o lazo familiar.${minorNote}${lastNote} Teléfono legítimamente compartido.`
    };
  }

  return {
    catCode: 'E',
    cat: 'CASO AMBIGUO',
    reason: `Nombres distintos de personas adultas sin relación evidente de apellido o ubicación. Requiere revisión manual.`
  };
}

const classified = groups.map(g => {
  const c = classifyGroup(g);
  return {
    ...g,
    categoryCode: c.catCode,
    category: c.cat,
    reason: c.reason
  };
});

fs.writeFileSync('scratch/classified_groups.json', JSON.stringify(classified, null, 2));

const catCounts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, E: 0 };
classified.forEach(g => {
  catCounts[g.categoryCode]++;
});

console.log('--- RESUMEN DE CLASIFICACIÓN ---');
console.log(`A. DUPLICADO PROBABLE MISMA PERSONA: ${catCounts.A}`);
console.log(`B. FAMILIA / TUTOR / MENORES:         ${catCounts.B}`);
console.log(`C. DIFERENCIA DE FORMATO:             ${catCounts.C}`);
console.log(`D. ACTIVE + ARCHIVED:                 ${catCounts.D}`);
console.log(`E. CASO AMBIGUO:                      ${catCounts.E}`);
console.log(`TOTAL GRUPOS:                         ${classified.length}`);
