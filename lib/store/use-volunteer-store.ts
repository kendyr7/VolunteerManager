import { create } from 'zustand';
import type { VolunteerType } from '@/components/VolunteerTableRow';
import { useRealtimeStore } from '@/lib/store/use-realtime-store';

interface VolunteerStoreState {
  // Fuente única de verdad (Single Source of Truth)
  volunteersMap: Map<string, VolunteerType>;

  // Acciones e Inserciones Incrementales O(1)
  setInitialVolunteers: (volunteers: VolunteerType[]) => void;
  upsertVolunteer: (volunteer: VolunteerType) => boolean;
  deleteVolunteer: (id: string) => boolean;
  
  // Selectores derivados
  getVolunteersList: () => VolunteerType[];
  getVolunteerById: (id: string) => VolunteerType | undefined;
}

export const useVolunteerStore = create<VolunteerStoreState>((set, get) => ({
  volunteersMap: new Map<string, VolunteerType>(),

  setInitialVolunteers: (volunteers: VolunteerType[]) => {
    const map = new Map<string, VolunteerType>();
    volunteers.forEach(v => {
      map.set(v.id, v);
    });
    set({ volunteersMap: map });
    useRealtimeStore.getState().setInitialSyncCompleted(true);
  },

  upsertVolunteer: (incoming: VolunteerType) => {
    const currentMap = get().volunteersMap;
    const existing = currentMap.get(incoming.id);

    // Protección contra eventos desordenados durante la carga inicial
    const isInitialCompleted = useRealtimeStore.getState().initialSyncCompleted;
    if (!existing && !isInitialCompleted) {
      // Si la carga inicial no ha finalizado y el voluntario no existe en la foto inicial, se ignora
      return false;
    }

    // Estrategia de Resolución de Conflictos: Last-Write-Wins (LWW) por updated_at / created_at
    const currentTsVal = (existing as any)?.updated_at || (existing as any)?.created_at;
    const incomingTsVal = (incoming as any)?.updated_at || (incoming as any)?.created_at;

    if (existing && currentTsVal && incomingTsVal) {
      const currentTs = new Date(currentTsVal).getTime();
      const incomingTs = new Date(incomingTsVal).getTime();

      if (incomingTs < currentTs) {
        // Evento más antiguo -> Se descarta silenciosamente
        return false;
      }

      if (incomingTs === currentTs) {
        // Regla de Desempate (Tie-Breaker): Fusión de campos no nulos
        const isIdentical = JSON.stringify(existing) === JSON.stringify(incoming);
        if (isIdentical) return false;
      }
    }

    const newMap = new Map(currentMap);
    const merged = existing ? { ...existing, ...incoming } : incoming;
    newMap.set(incoming.id, merged);
    set({ volunteersMap: newMap });
    useRealtimeStore.getState().recordSync();
    return true;
  },

  deleteVolunteer: (id: string) => {
    const currentMap = get().volunteersMap;
    if (!currentMap.has(id)) return false;

    const newMap = new Map(currentMap);
    newMap.delete(id);
    set({ volunteersMap: newMap });
    useRealtimeStore.getState().recordSync();
    return true;
  },

  getVolunteersList: () => {
    return Array.from(get().volunteersMap.values());
  },

  getVolunteerById: (id: string) => {
    return get().volunteersMap.get(id);
  },
}));
