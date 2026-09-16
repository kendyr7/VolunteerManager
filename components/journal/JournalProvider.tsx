'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';

export type NoteColor = 'default' | 'coral' | 'amber' | 'yellow' | 'emerald' | 'teal' | 'sky' | 'lavender' | 'rose' | 'slate';
export type NotePattern = 'none' | 'grid' | 'dots' | 'lines' | 'gradient';

export type KeepNote = {
  id: string;
  title: string;
  html: string;
  text: string;
  shiftDay?: string | null;
  color?: NoteColor;
  pattern?: NotePattern;
  isPinned?: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

export type JournalEntry = {
  day: string;
  title: string;
  html: string;
  text: string;
  mood: string;
  tags: string[];
};

export type JournalState = {
  notes: KeepNote[];
  drafts: Record<string, JournalEntry>;
  entries: Record<string, JournalEntry>;
};

const emptyState: JournalState = { notes: [], drafts: {}, entries: {} };
type JournalStatus = 'idle' | 'loading' | 'ready' | 'saving' | 'error';
export type JournalContextValue = {
  journals: Record<string, JournalState>;
  update: (userId: string, change: (state: JournalState) => JournalState) => void;
  load: (userId: string) => Promise<void>;
  flush: (userId: string) => Promise<boolean>;
  status: (userId: string) => JournalStatus;
  retry: (userId: string) => Promise<void>;
  clear: (userId?: string) => void;
  hasPendingChanges: (userId?: string) => boolean;
  registerDraftHandler: (userId: string, handler: (() => Promise<void>) | null) => void;
  setHasUnsavedDraft: (userId: string, dirty: boolean) => void;
  saveAndFlush: (userId?: string) => Promise<boolean>;
};
const JournalContext = createContext<JournalContextValue | null>(null);

function rowToNote(row: Record<string, unknown>): KeepNote {
  return {
    id: String(row.id),
    title: String(row.title || ''),
    html: String(row.content_html || ''),
    text: String(row.content_text || ''),
    shiftDay: row.shift_date ? String(row.shift_date) : null,
    color: (row.color as NoteColor) || 'default',
    pattern: (row.pattern as NotePattern) || 'none',
    isPinned: Boolean(row.is_pinned),
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
  };
}

function noteToRow(userId: string, note: KeepNote) {
  return {
    id: note.id,
    volunteer_id: userId,
    title: note.title || '',
    content_html: note.html || '',
    content_text: note.text || '',
    content_version: 1,
    shift_date: note.shiftDay || null,
    color: note.color || 'default',
    pattern: note.pattern || 'none',
    is_pinned: Boolean(note.isPinned),
    tags: note.tags || [],
  };
}

// Notes sync directly through the browser Supabase client and RLS. Unsaved editor
// state stays in memory, so private content is never written to browser storage.
export function JournalProvider({ children }: { children: ReactNode }) {
  const [journals, setJournals] = useState<Record<string, JournalState>>({});
  const [statuses, setStatuses] = useState<Record<string, JournalStatus>>({});
  const journalsRef = useRef(journals);
  const loaded = useRef(new Set<string>());
  const loading = useRef(new Set<string>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const saveQueues = useRef(new Map<string, Promise<boolean>>());
  // Only notes actually changed in this session may be written or removed.
  const persistedNotes = useRef(new Map<string, KeepNote[]>());
  const pendingUsers = useRef(new Set<string>());
  const dirtyDraftsRef = useRef(new Set<string>());
  const draftHandlersRef = useRef(new Map<string, () => Promise<void>>());

  const saveNow = useCallback(async (userId: string, notes: KeepNote[]) => {
    if (!loaded.current.has(userId)) return false;
    setStatuses(current => ({ ...current, [userId]: 'saving' }));
    try {
      const db = createClient();
      const baseline = persistedNotes.current.get(userId) ?? [];
      const previous = new Map(baseline.map(note => [note.id, note]));
      const desiredIds = new Set(notes.map(note => note.id));
      const changed = notes.filter(note => JSON.stringify(previous.get(note.id)) !== JSON.stringify(note));
      const removedIds = baseline.filter(note => !desiredIds.has(note.id)).map(note => note.id);
      if (changed.length) {
        const result = await db.from('volunteer_journal_notes').upsert(changed.map(note => noteToRow(userId, note)), { onConflict: 'id' });
        if (result.error) throw result.error;
        changed.forEach(note => previous.set(note.id, note));
        persistedNotes.current.set(userId, [...previous.values()]);
      }
      if (removedIds.length) {
        const result = await db.from('volunteer_journal_notes').delete().eq('volunteer_id', userId).in('id', removedIds);
        if (result.error) throw result.error;
      }
      persistedNotes.current.set(userId, notes);
      if (JSON.stringify(journalsRef.current[userId]?.notes) === JSON.stringify(notes)) pendingUsers.current.delete(userId);
      setStatuses(current => ({ ...current, [userId]: 'ready' }));
      return true;
    } catch {
      pendingUsers.current.add(userId);
      setStatuses(current => ({ ...current, [userId]: 'error' }));
      return false;
    }
  }, []);

  // Serialize writes per volunteer so a slower earlier request cannot finish
  // after a newer close-and-save request and restore stale content.
  const enqueueSave = useCallback((userId: string, notes: KeepNote[]) => {
    const previous = saveQueues.current.get(userId) ?? Promise.resolve(true);
    const next = previous.catch(() => undefined).then(() => saveNow(userId, notes));
    saveQueues.current.set(userId, next);
    return next;
  }, [saveNow]);

  const persist = useCallback((userId: string, notes: KeepNote[]) => {
    const existingTimer = timers.current.get(userId);
    if (existingTimer) clearTimeout(existingTimer);
    const timer = setTimeout(() => {
      timers.current.delete(userId);
      void enqueueSave(userId, notes);
    }, 700);
    timers.current.set(userId, timer);
  }, [enqueueSave]);

  const flush = useCallback(async (userId: string) => {
    const timer = timers.current.get(userId);
    if (timer) clearTimeout(timer);
    timers.current.delete(userId);
    if (!loaded.current.has(userId)) return !pendingUsers.current.has(userId);
    return enqueueSave(userId, journalsRef.current[userId]?.notes ?? []);
  }, [enqueueSave]);

  const load = useCallback(async (userId: string) => {
    if (!userId || loaded.current.has(userId) || loading.current.has(userId)) return;
    loading.current.add(userId);
    setStatuses(current => ({ ...current, [userId]: 'loading' }));
    try {
      const db = createClient();
      const result = await db.from('volunteer_journal_notes')
        .select('id, volunteer_id, title, content_html, content_text, content_version, shift_date, color, pattern, is_pinned, tags, revision, created_at, updated_at')
        .eq('volunteer_id', userId)
        .order('is_pinned', { ascending: false })
        .order('updated_at', { ascending: false });

      if (result.error) {
        setStatuses(current => ({ ...current, [userId]: 'error' }));
        return;
      }

      loaded.current.add(userId);
      const loadedNotes = (result.data || []).map(rowToNote);
      persistedNotes.current.set(userId, loadedNotes);

      // Preserve drafts created during the initial request (including a retry).
      const current = journalsRef.current[userId] ?? emptyState;
      const localIds = new Set(current.notes.map(note => note.id));
      const next = { ...current, notes: [...current.notes, ...loadedNotes.filter(note => !localIds.has(note.id))] };
      journalsRef.current = { ...journalsRef.current, [userId]: next };
      setJournals(journalsRef.current);
      setStatuses(currentStatuses => ({ ...currentStatuses, [userId]: 'ready' }));
      loading.current.delete(userId);
      if (pendingUsers.current.has(userId)) await enqueueSave(userId, next.notes);
    } catch {
      setStatuses(current => ({ ...current, [userId]: 'error' }));
    } finally {
      loading.current.delete(userId);
    }
  }, [enqueueSave]);

  const update = useCallback((userId: string, change: (state: JournalState) => JournalState) => {
    const previous = journalsRef.current[userId] ?? emptyState;
    const next = change(previous);
    journalsRef.current = { ...journalsRef.current, [userId]: next };
    setJournals(journalsRef.current);
    if (JSON.stringify(previous.notes) !== JSON.stringify(next.notes)) {
      pendingUsers.current.add(userId);
      if (loaded.current.has(userId) && !loading.current.has(userId)) persist(userId, next.notes);
    }
  }, [persist]);

  const retry = useCallback(async (userId: string) => {
    if (loaded.current.has(userId)) await flush(userId);
    else await load(userId);
  }, [flush, load]);

  const clear = useCallback((userId?: string) => {
    if (userId) {
      loaded.current.delete(userId);
      loading.current.delete(userId);
      const timer = timers.current.get(userId);
      if (timer) clearTimeout(timer);
      timers.current.delete(userId);
      saveQueues.current.delete(userId);
      persistedNotes.current.delete(userId);
      pendingUsers.current.delete(userId);
      dirtyDraftsRef.current.delete(userId);
      draftHandlersRef.current.delete(userId);
      setJournals(prev => {
        const next = { ...prev };
        delete next[userId];
        journalsRef.current = next;
        return next;
      });
      setStatuses(prev => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
    } else {
      loaded.current.clear();
      loading.current.clear();
      timers.current.forEach(timer => clearTimeout(timer));
      timers.current.clear();
      saveQueues.current.clear();
      persistedNotes.current.clear();
      pendingUsers.current.clear();
      dirtyDraftsRef.current.clear();
      draftHandlersRef.current.clear();
      journalsRef.current = {};
      setJournals({});
      setStatuses({});
    }
  }, []);

  const setHasUnsavedDraft = useCallback((userId: string, dirty: boolean) => {
    if (dirty) {
      dirtyDraftsRef.current.add(userId);
    } else {
      dirtyDraftsRef.current.delete(userId);
    }
  }, []);

  const registerDraftHandler = useCallback((userId: string, handler: (() => Promise<void>) | null) => {
    if (handler) {
      draftHandlersRef.current.set(userId, handler);
    } else {
      draftHandlersRef.current.delete(userId);
    }
  }, []);

  const hasPendingChanges = useCallback((userId?: string) => {
    if (userId) {
      const isDirty = dirtyDraftsRef.current.has(userId);
      const hasTimer = timers.current.has(userId);
      const isSaving = statuses[userId] === 'saving';
      return isDirty || hasTimer || isSaving || pendingUsers.current.has(userId);
    }
    const hasAnyDirty = dirtyDraftsRef.current.size > 0;
    const hasAnyTimer = timers.current.size > 0;
    const hasAnySaving = Object.values(statuses).some(s => s === 'saving');
    return hasAnyDirty || hasAnyTimer || hasAnySaving || pendingUsers.current.size > 0;
  }, [statuses]);

  const saveAndFlush = useCallback(async (userId?: string): Promise<boolean> => {
    const targetUsers = userId
      ? [userId]
      : Array.from(new Set([
          ...dirtyDraftsRef.current,
          ...timers.current.keys(),
          ...Object.keys(journalsRef.current),
        ]));

    try {
      for (const uid of targetUsers) {
        const handler = draftHandlersRef.current.get(uid);
        if (handler) {
          await handler();
        }
        if (!await flush(uid)) return false;
        dirtyDraftsRef.current.delete(uid);
      }
      return true;
    } catch (e) {
      console.error('Error in saveAndFlush:', e);
      return false;
    }
  }, [flush]);

  useEffect(() => () => timers.current.forEach(timer => clearTimeout(timer)), []);

  const value: JournalContextValue = {
    journals,
    update,
    load,
    flush,
    retry,
    clear,
    status: userId => statuses[userId] || 'idle',
    hasPendingChanges,
    registerDraftHandler,
    setHasUnsavedDraft,
    saveAndFlush,
  };
  return <JournalContext.Provider value={value}>{children}</JournalContext.Provider>;
}

export function useJournal(userId: string) {
  const context = useContext(JournalContext);
  if (!context) throw new Error('JournalProvider is required');
  const { load } = context;
  useEffect(() => { void load(userId); }, [load, userId]);
  const { update, flush, retry, clear, registerDraftHandler, setHasUnsavedDraft, saveAndFlush } = context;
  const actions = useMemo(() => ({
    update: (change: (state: JournalState) => JournalState) => update(userId, change),
    flush: () => flush(userId),
    retry: () => retry(userId),
    clear: () => clear(userId),
    registerDraftHandler: (handler: (() => Promise<void>) | null) => registerDraftHandler(userId, handler),
    setHasUnsavedDraft: (dirty: boolean) => setHasUnsavedDraft(userId, dirty),
    saveAndFlush: () => saveAndFlush(userId),
  }), [userId, update, flush, retry, clear, registerDraftHandler, setHasUnsavedDraft, saveAndFlush]);
  return {
    ...actions,
    state: context.journals[userId] ?? emptyState,
    status: context.status(userId),
    hasPendingChanges: () => context.hasPendingChanges(userId),
  };
}

export function useJournalGuard() {
  const context = useContext(JournalContext);
  return {
    hasPendingChanges: (userId?: string) => (context ? context.hasPendingChanges(userId) : false),
    saveAndFlush: async (userId?: string) => (context ? context.saveAndFlush(userId) : true),
  };
}
