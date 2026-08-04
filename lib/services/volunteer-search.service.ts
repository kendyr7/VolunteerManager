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

    this.fuse = new Fuse(volunteers, {
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

    const normQuery = normalizeSearch(trimmed);
    const isSimpleQuery = !trimmed.includes(' ') && !trimmed.includes(',');

    // Fast O(N) string includes for simple single-word / phone searches
    if (isSimpleQuery) {
      const results: string[] = [];
      for (let i = 0; i < this.volunteers.length; i++) {
        const v = this.volunteers[i];
        const searchStr =
          v.normalizedSearchText ||
          normalizeSearch(`${v.name} ${v.phone} ${v.committee} ${v.stake} ${v.ward}`);

        if (searchStr.includes(normQuery)) {
          results.push(v.id);
        }
      }
      return results;
    }

    // Fuzzy search via Fuse.js for multi-word or multi-token queries
    if (!this.fuse) return this.volunteers.map(v => v.id);

    const threshold = getDynamicThreshold(trimmed.length);
    this.fuse.setCollection(this.volunteers);
    
    // Perform search with dynamic threshold
    const fuseResults = this.fuse.search(trimmed, { limit: 1000 });
    return fuseResults.map(r => r.item.id);
  }
}
