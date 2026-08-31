/** Normalize formatting only; never infer which words are someone's surnames. */
export function normalizeVolunteerText(value: string | null | undefined): string {
  return (value || '').normalize('NFC').trim().replace(/\s+/g, ' ');
}

export type ChurchUnitLevel = 'stake' | 'neighborhood';

// Spellings already represented in this application's data. Unknown names are
// preserved: this is not an authoritative directory or a hierarchy validator.
const canonicalNames: Record<ChurchUnitLevel, string[]> = {
  stake: ['Managua', 'Masaya', 'Villa Flor', 'Universitaria', 'Masatepe',
    'Bello Horizonte', 'Jinotepe', 'Chinandega Oeste', 'Granada', 'León',
    'Puerto Cabezas', 'Las Américas', 'Estelí', 'Managua Norte', 'Chinandega',
    'Matagalpa', 'Managua Sur', 'Juigalpa'],
  neighborhood: ['Ciudad Sandino', 'Bello Amanecer', 'San Marcos', 'René Polanco',
    'Las Flores', 'Mateare', 'Altagracia', 'Linda Vista', 'Villa Flor', 'Los Laureles',
    'Masatepe', 'San Juan', 'Nindirí', 'La Trinidad', 'San Carlos', 'Diriomo',
    'Waspán', 'El Rosario', 'Villa Venezuela', 'Diriamba', 'Batahola', 'El Viejo',
    'Las Sabogales', 'Masaya', 'Ciudad Jardín', 'Estelí', 'Los Repartos', 'Ducualí',
    'San Judas', '14 de Septiembre', 'Lezcano', 'Monte Fresco', 'Jinotepe',
    'La Primavera', 'San Miguel', 'Rubén Darío', 'Tezoatega', 'Cuatro Esquinas',
    'Prinzapolka', 'La Estación', 'La Concepción', 'Acome', 'Trinidad', 'Monserrat',
    'La Borgoña', 'Bóer', 'Nandaime', 'El Coyolar', 'Loma Linda', 'Las Villas',
    'Veracruz', 'Sabaneta', 'Sabogales', 'Granada', 'Ciudadela', 'Juigalpa', 'Bilwi',
    'Puerto Cabezas', 'Pancasán', 'Las Palmas', 'La Rotonda', 'San Juan de Oriente',
    'Primavera', 'Managua', 'Rivas', 'Lamlaya', 'La Posada', 'Villa Universitaria',
    'Boaco', 'Ocotal', 'Matagalpa', 'Loma Verde', 'Florida', 'Las Mercedes',
    'Las Colinas', 'Acahualinca', 'Las Américas', 'Bello Horizonte', 'Chinandega'],
};

function unitKey(value: string): string {
  // Keep ñ distinct from n; remove only acute accents for matching variants.
  return value.toLocaleLowerCase('es').replace(/[áéíóú]/g, letter =>
    ({ á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u' })[letter]!);
}

export function normalizeChurchUnit(value: string | null | undefined, level: ChurchUnitLevel): string {
  const text = normalizeVolunteerText(value);
  // The existing import convention stores the name without the unit prefix.
  // Never strip a prefix from the wrong level: it can reveal swapped columns.
  const prefix = level === 'stake' ? /^(estaca|distrito)\s+/i : /^(barrio|rama)\s+/i;
  const name = text.replace(prefix, '');
  return canonicalNames[level].find(candidate => unitKey(candidate) === unitKey(name)) || name;
}

export function normalizeVolunteerIdentity<T extends {
  firstName: string; lastName: string; stake?: string | null; neighborhood?: string | null;
}>(payload: T): T {
  return {
    ...payload,
    firstName: normalizeVolunteerText(payload.firstName),
    lastName: normalizeVolunteerText(payload.lastName),
    stake: normalizeChurchUnit(payload.stake, 'stake') || null,
    neighborhood: normalizeChurchUnit(payload.neighborhood, 'neighborhood') || null,
  };
}

export function volunteerIdentityError(payload: {
  firstName: string; lastName: string; stake?: string | null; neighborhood?: string | null;
}): string | null {
  if (!normalizeVolunteerText(payload.firstName) || !normalizeVolunteerText(payload.lastName)) {
    return 'Escribe los nombres y los apellidos en sus campos separados.';
  }
  if (/^(barrio|rama)\b/i.test(normalizeVolunteerText(payload.stake)) ||
      /^(estaca|distrito)\b/i.test(normalizeVolunteerText(payload.neighborhood))) {
    return 'Revisa las unidades: el barrio o rama y la estaca o distrito parecen intercambiados.';
  }
  return null;
}

/** Only a draft for old one-column files; explicit review is always required. */
export function draftVolunteerName(fullName: string): { firstName: string; lastName: string; nameNeedsReview: true } {
  const words = normalizeVolunteerText(fullName).split(' ').filter(Boolean);
  const hasParticles = words.some(word => /^(de|del|la|las|los|y)$/i.test(word));
  const boundary = hasParticles ? words.length : words.length >= 4 ? words.length - 2 : Math.max(1, words.length - 1);
  return { firstName: words.slice(0, boundary).join(' '), lastName: words.slice(boundary).join(' '), nameNeedsReview: true };
}
