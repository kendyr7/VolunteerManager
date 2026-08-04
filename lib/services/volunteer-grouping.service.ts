import type { VolunteerType } from '@/components/VolunteerTableRow';

export interface GroupedVolunteersResult {
  letters: string[];
  groupCounts: number[];
  groupedVolunteers: VolunteerType[][];
  groupsRecord: Record<string, VolunteerType[]>;
  flatVolunteers: VolunteerType[];
}

export function groupVolunteersAlphabetically(
  volunteers: VolunteerType[]
): GroupedVolunteersResult {
  const groupsRecord: Record<string, VolunteerType[]> = {};

  volunteers.forEach(v => {
    let letter = (v.name || '').charAt(0).toUpperCase();
    if (!/^[A-Z]$/.test(letter)) letter = '#';
    if (!groupsRecord[letter]) groupsRecord[letter] = [];
    groupsRecord[letter].push(v);
  });

  const sortedLetters = Object.keys(groupsRecord).sort((a, b) =>
    a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b)
  );

  const groupCounts: number[] = [];
  const groupedVolunteers: VolunteerType[][] = [];
  const flatVolunteers: VolunteerType[] = [];

  sortedLetters.forEach(letter => {
    const list = groupsRecord[letter];
    groupCounts.push(list.length);
    groupedVolunteers.push(list);
    flatVolunteers.push(...list);
  });

  return {
    letters: sortedLetters,
    groupCounts,
    groupedVolunteers,
    groupsRecord,
    flatVolunteers,
  };
}
