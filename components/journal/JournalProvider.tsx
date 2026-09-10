'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
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
type JournalContextValue = {
  journals: Record<string, JournalState>;
  update: (userId: string, change: (state: JournalState) => JournalState) => void;
  load: (userId: string) => Promise<void>;
  flush: (userId: string) => Promise<void>;
  status: (userId: string) => JournalStatus;
  retry: (userId: string) => Promise<void>;
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
  const saveQueues = useRef(new Map<string, Promise<void>>());

  useEffect(() => { journalsRef.current = journals; }, [journals]);

  const saveNow = useCallback(async (userId: string, notes: KeepNote[]) => {
    setStatuses(current => ({ ...current, [userId]: 'saving' }));
    try {
      const db = createClient();
      const existing = await db.from('volunteer_journal_notes').select('id').eq('volunteer_id', userId);
      if (existing.error) throw existing.error;
      const desiredIds = new Set(notes.map(note => note.id));
      const staleIds = (existing.data || []).map(row => row.id).filter(id => !desiredIds.has(id));
      const writes = notes.length
        ? db.from('volunteer_journal_notes').upsert(notes.map(note => noteToRow(userId, note)), { onConflict: 'id' })
        : Promise.resolve({ error: null });
      const deletes = staleIds.length
        ? db.from('volunteer_journal_notes').delete().eq('volunteer_id', userId).in('id', staleIds)
        : Promise.resolve({ error: null });
      const [writeResult, deleteResult] = await Promise.all([writes, deletes]);
      if (writeResult.error || deleteResult.error) throw writeResult.error || deleteResult.error;
      setStatuses(current => ({ ...current, [userId]: 'ready' }));
    } catch {
      setStatuses(current => ({ ...current, [userId]: 'error' }));
    }
  }, []);

  // Serialize writes per volunteer so a slower earlier request cannot finish
  // after a newer close-and-save request and restore stale content.
  const enqueueSave = useCallback((userId: string, notes: KeepNote[]) => {
    const previous = saveQueues.current.get(userId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(() => saveNow(userId, notes));
    saveQueues.current.set(userId, next);
    return next;
  }, [saveNow]);

  const persist = useCallback((userId: string, notes: KeepNote[]) => {
    const existingTimer = timers.current.get(userId);
    if (existingTimer) clearTimeout(existingTimer);
    const timer = setTimeout(() => { void enqueueSave(userId, notes); }, 700);
    timers.current.set(userId, timer);
  }, [enqueueSave]);

  const flush = useCallback(async (userId: string) => {
    const timer = timers.current.get(userId);
    if (timer) clearTimeout(timer);
    timers.current.delete(userId);
    await enqueueSave(userId, journalsRef.current[userId]?.notes ?? []);
  }, [enqueueSave]);

  const load = useCallback(async (userId: string) => {
    if (!userId || loaded.current.has(userId) || loading.current.has(userId)) return;
    loading.current.add(userId);
    setStatuses(current => ({ ...current, [userId]: 'loading' }));
    const db = createClient();
    const result = await db.from('volunteer_journal_notes')
      .select('id, volunteer_id, title, content_html, content_text, content_version, shift_date, color, pattern, is_pinned, tags, revision, created_at, updated_at')
      .eq('volunteer_id', userId)
      .order('is_pinned', { ascending: false })
      .order('updated_at', { ascending: false })
      .then(value => value, () => null);
    if (!result) {
      loading.current.delete(userId);
      setStatuses(current => ({ ...current, [userId]: 'error' }));
      return;
    }
    if (result.error) {
      loading.current.delete(userId);
      setStatuses(current => ({ ...current, [userId]: 'error' }));
      return;
    }
    loading.current.delete(userId);
    loaded.current.add(userId);
    const loadedNotes = (result.data || []).map(rowToNote);
    const current = journalsRef.current[userId] ?? emptyState;
    // Preserve anything typed while the initial request was in flight. Those
    // local notes are queued for persistence after the remote list is merged.
    const remoteIds = new Set(loadedNotes.map(note => note.id));
    const localOnly = current.notes.filter(note => !remoteIds.has(note.id));
    const next = { ...current, notes: [...localOnly, ...loadedNotes] };
    journalsRef.current = { ...journalsRef.current, [userId]: next };
    setJournals(journalsRef.current);
    setStatuses(currentStatuses => ({ ...currentStatuses, [userId]: 'ready' }));
    if (localOnly.length) persist(userId, next.notes);
  }, [persist]);

  const update = useCallback((userId: string, change: (state: JournalState) => JournalState) => {
    const previous = journalsRef.current[userId] ?? emptyState;
    const next = change(previous);
    journalsRef.current = { ...journalsRef.current, [userId]: next };
    setJournals(journalsRef.current);
    if (loaded.current.has(userId) && !loading.current.has(userId) && JSON.stringify(previous.notes) !== JSON.stringify(next.notes)) persist(userId, next.notes);
  }, [persist]);

  const retry = useCallback(async (userId: string) => {
    loaded.current.delete(userId);
    loading.current.delete(userId);
    await load(userId);
  }, [load]);

  useEffect(() => () => timers.current.forEach(timer => clearTimeout(timer)), []);

  const value: JournalContextValue = { journals, update, load, flush, retry, status: userId => statuses[userId] || 'idle' };
  return <JournalContext.Provider value={value}>{children}</JournalContext.Provider>;
}

export function useJournal(userId: string) {
  const context = useContext(JournalContext);
  if (!context) throw new Error('JournalProvider is required');
  useEffect(() => { void context.load(userId); }, [context, userId]);
  return {
    state: context.journals[userId] ?? emptyState,
    update: (change: (state: JournalState) => JournalState) => context.update(userId, change),
    flush: () => context.flush(userId),
    status: context.status(userId),
    retry: () => context.retry(userId),
  };
}
