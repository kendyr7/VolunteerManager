import Fuse from 'fuse.js';
import { normalizeSearch } from '@/lib/utils';
import type { VolunteerType } from '@/components/VolunteerTableRow';

export function getDynamicThreshold(queryLength: number): number {
  if (queryLength <= 3) return 0.15;
  if (queryLength <= 6) return 0.25;
  return 0.35;
}

export class VolunteerSearchService {
  private fuse: Fuse<VolunteerType> | null = null;
  private volunteerMap = new Map<string, VolunteerType>();
  private volunteers: VolunteerType[] = [];

  constructor(volunteers: VolunteerType[] = []) {
    this.updateVolunteers(volunteers);
  }

  public updateVolunteers(volunteers: VolunteerType[]) {
    this.volunteers = volunteers;
    this.volunteerMap.clear();

    volunteers.forEach(v => {
      this.volunteerMap.set(v.id, v);
    });

    this.rebuildFuse();
  }

  public upsertVolunteer(incoming: VolunteerType) {
    this.volunteerMap.set(incoming.id, incoming);
    this.volunteers = Array.from(this.volunteerMap.values());
    if (this.fuse) {
      this.fuse.setCollection(this.volunteers);
    } else {
      this.rebuildFuse();
    }
  }

  public deleteVolunteer(id: string) {
    if (!this.volunteerMap.has(id)) return;
    this.volunteerMap.delete(id);
    this.volunteers = Array.from(this.volunteerMap.values());
    if (this.fuse) {
      this.fuse.setCollection(this.volunteers);
    } else {
      this.rebuildFuse();
    }
  }

  private rebuildFuse() {
    this.fuse = new Fuse(this.volunteers, {
      keys: [
        { name: 'name', weight: 0.4 },
        { name: 'phone', weight: 0.2 },
        { name: 'stake', weight: 0.15 },
        { name: 'ward', weight: 0.15 },
        { name: 'committee', weight: 0.1 },
      ],
      threshold: 0.25,
      ignoreLocation: true,
      minMatchCharLength: 2,
    });
  }

  public getVolunteerById(id: string): VolunteerType | undefined {
    return this.volunteerMap.get(id);
  }

  public search(query: string): string[] {
    const trimmed = query.trim();
    if (!trimmed) return this.volunteers.map(v => v.id);

    const terms = trimmed.split(',').map(term => normalizeSearch(term.trim())).filter(Boolean);
    const exactResults: string[] = [];
    for (let i = 0; i < this.volunteers.length; i++) {
      const volunteer = this.volunteers[i];
      const searchText = volunteer.normalizedSearchText || normalizeSearch(
        `${volunteer.name} ${volunteer.phone} ${volunteer.committee} ${volunteer.stake} ${volunteer.ward}`
      );
      if (terms.every(term => searchText.includes(term))) exactResults.push(volunteer.id);
    }

    if (exactResults.length > 0 || terms.length > 1) return exactResults;

    // Preserve fuzzy matching for misspelled single searches only when there is no exact match.
    if (!this.fuse) return this.volunteers.map(v => v.id);

    this.fuse.setCollection(this.volunteers);
    
    // Perform search with dynamic threshold
    const fuseResults = this.fuse.search(trimmed, { limit: 1000 });
    return fuseResults.map(r => r.item.id);
  }
}
