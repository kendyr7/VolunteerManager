'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { SmartSearchBar } from '@/components/SmartSearchBar';
import {
  useJournal,
  type KeepNote,
  type NoteColor,
  type NotePattern,
} from './JournalProvider';
import styles from './journal.module.css';
import { DeleteNoteDialog } from './DeleteNoteDialog';
import { JournalTourModal } from './JournalTourModal';

// ---------------------------------------------------------------------------
// Constants & Palettes
// ---------------------------------------------------------------------------
export const NOTE_COLORS: { id: NoteColor; label: string; lightBg: string; darkBg: string }[] = [
  { id: 'default', label: 'Por defecto', lightBg: '#ffffff', darkBg: '#1e1e1e' },
  { id: 'coral', label: 'Coral', lightBg: '#fae3d9', darkBg: '#382320' },
  { id: 'amber', label: 'Arena', lightBg: '#fbf0d9', darkBg: '#392f1b' },
  { id: 'yellow', label: 'Amarillo', lightBg: '#fef9c3', darkBg: '#383012' },
  { id: 'emerald', label: 'Menta', lightBg: '#ddf5e4', darkBg: '#1a3523' },
  { id: 'teal', label: 'Turquesa', lightBg: '#d6f5f6', darkBg: '#173439' },
  { id: 'sky', label: 'Cielo', lightBg: '#dceafe', darkBg: '#1c2e49' },
  { id: 'lavender', label: 'Lavanda', lightBg: '#ede7fe', darkBg: '#2b2144' },
  { id: 'rose', label: 'Rosa', lightBg: '#fce4ec', darkBg: '#3a1c2a' },
  { id: 'slate', label: 'Pizarra', lightBg: '#edf2f7', darkBg: '#222934' },
];

export const NOTE_PATTERNS: { id: NotePattern; label: string; icon: string }[] = [
  { id: 'none', label: 'Liso', icon: 'block' },
  { id: 'grid', label: 'Cuadrícula', icon: 'grid_4x4' },
  { id: 'dots', label: 'Puntos', icon: 'grain' },
  { id: 'lines', label: 'Líneas', icon: 'format_align_justify' },
  { id: 'gradient', label: 'Degradado', icon: 'gradient' },
];

const highlights = [
  { name: 'Amarillo', color: '#facc15' },
  { name: 'Azul', color: '#60a5fa' },
  { name: 'Verde', color: '#4ade80' },
  { name: 'Morado', color: '#c084fc' },
  { name: 'Rosa', color: '#f472b6' },
  { name: 'Naranja', color: '#fb923c' },
];

const dateOf = (day: string) => new Date(`${day}T12:00:00`);

function newNoteId() {
  return globalThis.crypto?.randomUUID?.() ?? `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0')}`;
}

const formatChipDate = (day: string) => {
  try {
    const d = dateOf(day);
    const rawMonth = d.toLocaleDateString('es', { month: 'short' }).replace('.', '');
    const month = rawMonth.charAt(0).toUpperCase() + rawMonth.slice(1);
    return `${d.getDate()} ${month}`;
  } catch {
    return day;
  }
};

function Icon({ name, className = '' }: { name: string; className?: string }) {
  return <span aria-hidden="true" className={`material-symbols-outlined ${className}`}>{name}</span>;
}

// Clean and sanitize HTML for storage and previews
function cleanHtml(html: string): string {
  if (typeof document === 'undefined') return html;
  const template = document.createElement('template');
  template.innerHTML = html;
  const clean = (node: Node): Node => {
    if (node.nodeType === Node.TEXT_NODE) {
      return document.createTextNode((node.textContent ?? '').replace(/\u200B/g, ''));
    }
    const fragment = document.createDocumentFragment();
    if (!(node instanceof HTMLElement)) return fragment;
    if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'SVG', 'IMG'].includes(node.tagName)) return fragment;

    const permitted = [
      'B', 'STRONG', 'I', 'EM', 'U', 'BR', 'P', 'DIV', 'SPAN',
      'H1', 'H2', 'H3', 'H4',
      'UL', 'OL', 'LI',
      'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD',
      'A', 'INPUT', 'LABEL'
    ];
    const target = permitted.includes(node.tagName) ? document.createElement(node.tagName.toLowerCase()) : fragment;

    if (target instanceof HTMLElement) {
      // Background highlight (Relleno)
      const color = node.style.backgroundColor;
      const allowedColor = highlights.find(item => {
        const sample = document.createElement('span');
        sample.style.backgroundColor = item.color;
        return sample.style.backgroundColor === color;
      });
      if (allowedColor) {
        target.setAttribute('data-highlight', 'fill');
        target.style.backgroundColor = allowedColor.color;
        target.style.color = '#1e293b';
        target.style.borderRadius = '3px';
        target.style.padding = '1px 3px';
      }

      // Underline highlight (Subrayado)
      const decoColor = node.style.textDecorationColor;
      const hasUnderline = node.style.textDecoration?.includes('underline') || node.tagName === 'U';
      if (hasUnderline) {
        const allowedDeco = highlights.find(item => {
          const sample = document.createElement('span');
          sample.style.textDecorationColor = item.color;
          return sample.style.textDecorationColor === decoColor;
        });
        target.setAttribute('data-highlight', 'underline');
        target.style.textDecoration = 'underline';
        target.style.textDecorationColor = allowedDeco ? allowedDeco.color : (allowedColor ? allowedColor.color : 'currentColor');
        target.style.textDecorationThickness = '2.5px';
        target.style.textUnderlineOffset = '3px';
      }

      if (node.style.fontWeight === 'bold' || node.style.fontWeight === '700') target.style.fontWeight = 'bold';
      if (node.style.fontStyle === 'italic') target.style.fontStyle = 'italic';

      // Attributes for links
      if (node.tagName === 'A' && target instanceof HTMLAnchorElement) {
        const href = (node as HTMLAnchorElement).getAttribute('href') || '#';
        if (/^(https?:\/\/|mailto:|tel:|\/)/i.test(href)) {
          target.setAttribute('href', href);
          target.setAttribute('target', '_blank');
          target.setAttribute('rel', 'noopener noreferrer');
        }
      }

      // Attributes for checkboxes
      if (node.tagName === 'INPUT' && target instanceof HTMLInputElement) {
        target.setAttribute('type', 'checkbox');
        if ((node as HTMLInputElement).checked || node.getAttribute('checked') !== null) {
          target.setAttribute('checked', 'checked');
          target.checked = true;
        }
      }
    }
    node.childNodes.forEach(child => target.appendChild(clean(child)));
    return target;
  };
  const output = document.createElement('div');
  template.content.childNodes.forEach(node => output.appendChild(clean(node)));
  return output.innerHTML;
}

// Toggle a checkbox inside HTML string by index
function toggleCheckboxInHtml(html: string, index: number): string {
  if (typeof document === 'undefined') return html;
  const temp = document.createElement('div');
  temp.innerHTML = html;
  const checkboxes = temp.querySelectorAll('input[type="checkbox"]');
  if (checkboxes[index]) {
    const cb = checkboxes[index] as HTMLInputElement;
    if (cb.hasAttribute('checked') || cb.checked) {
      cb.removeAttribute('checked');
      cb.checked = false;
    } else {
      cb.setAttribute('checked', 'checked');
      cb.checked = true;
    }
  }
  return temp.innerHTML;
}

// ---------------------------------------------------------------------------
// Main VolunteerJournal Component (Google Keep Notes Experience)
// ---------------------------------------------------------------------------
export function VolunteerJournal({
  volunteerId,
  days,
}: {
  volunteerId: string;
  days: string[];
}) {
  const { state, update, flush, status, retry } = useJournal(volunteerId);

  // Automatic one-time migration of previous shift entries into keep notes
  useEffect(() => {
    if ((!state.notes || state.notes.length === 0) && state.entries && Object.keys(state.entries).length > 0) {
      const migrated: KeepNote[] = Object.entries(state.entries)
        .filter(([, e]) => e && (e.text?.trim() || e.title?.trim()))
        .map(([day, e]) => ({
          id: newNoteId(),
          title: e.title?.trim() || `Turno ${formatChipDate(day)}`,
          html: e.html || '',
          text: e.text || '',
          shiftDay: day,
          color: 'default',
          pattern: 'none',
          isPinned: false,
          tags: e.tags || [],
          createdAt: new Date(`${day}T12:00:00`).toISOString(),
          updatedAt: new Date().toISOString(),
        }));
      if (migrated.length > 0) {
        update(current => ({ ...current, notes: migrated, entries: {}, drafts: {} }));
      }
    }
  }, [state.entries, state.notes, update]);

  // Search & Filter state
  const [search, setSearch] = useState('');
  const [shiftFilter, setShiftFilter] = useState<'all' | 'none' | string>('all');
  const [toastMessage, setToastMessage] = useState('');
  const [noteToDelete, setNoteToDelete] = useState<KeepNote | null>(null);
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [isTourOpen, setIsTourOpen] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Show release notes / guided tour only once
  useEffect(() => {
    try {
      const seen = localStorage.getItem('vm_journal_tour_seen_v1');
      if (!seen) {
        setIsTourOpen(true);
      }
    } catch {
      // Ignore storage errors in restricted contexts
    }
  }, []);

  const handleCloseTour = useCallback(() => {
    setIsTourOpen(false);
    try {
      localStorage.setItem('vm_journal_tour_seen_v1', 'true');
    } catch {
      // Ignore storage errors
    }
  }, []);

  // Top Creator State
  const [isCreatorExpanded, setIsCreatorExpanded] = useState(false);
  const [creatorTitle, setCreatorTitle] = useState('');
  const [creatorHtml, setCreatorHtml] = useState('');
  const [creatorText, setCreatorText] = useState('');
  const [creatorShift, setCreatorShift] = useState<string | null>(null);
  const [creatorColor, setCreatorColor] = useState<NoteColor>('default');
  const [creatorPattern, setCreatorPattern] = useState<NotePattern>('none');
  const [creatorIsPinned, setCreatorIsPinned] = useState(false);

  // Creator popovers
  const [creatorPaletteOpen, setCreatorPaletteOpen] = useState(false);
  const [creatorShiftOpen, setCreatorShiftOpen] = useState(false);

  // Note Edit Modal State
  const [editingNote, setEditingNote] = useState<KeepNote | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editHtml, setEditHtml] = useState('');
  const [editText, setEditText] = useState('');
  const [editShift, setEditShift] = useState<string | null>(null);
  const [editColor, setEditColor] = useState<NoteColor>('default');
  const [editPattern, setEditPattern] = useState<NotePattern>('none');
  const [editIsPinned, setEditIsPinned] = useState(false);
  const [editPaletteOpen, setEditPaletteOpen] = useState(false);
  const [editShiftOpen, setEditShiftOpen] = useState(false);

  // Card action popovers
  const [cardPaletteNoteId, setCardPaletteNoteId] = useState<string | null>(null);
  const [cardShiftNoteId, setCardShiftNoteId] = useState<string | null>(null);

  // Styled Link Modal State
  const [linkModalData, setLinkModalData] = useState<{
    isOpen: boolean;
    title: string;
    url: string;
    range: Range | null;
  } | null>(null);

  // Floating text formatting toolbar
  const [floatingToolbar, setFloatingToolbar] = useState<{
    x: number;
    y: number;
    placeBelow: boolean;
  } | null>(null);
  const [highlightMode, setHighlightMode] = useState<'fill' | 'underline'>('fill');

  const creatorEditorRef = useRef<HTMLDivElement>(null);
  const modalEditorRef = useRef<HTMLDivElement>(null);
  const creatorContainerRef = useRef<HTMLDivElement>(null);
  const savedSelectionRange = useRef<Range | null>(null);
  const creatorNoteId = useRef<string | null>(null);
  const editDirty = useRef(false);
  const isInteractingWithToolbarRef = useRef(false);
  const selectedNoteCardIdRef = useRef<string | null>(null);
  const lastSelectionTimeRef = useRef(0);

  const buildCreatorNote = useCallback((): KeepNote | null => {
    const rawText = creatorEditorRef.current
      ? creatorEditorRef.current.innerText.replace(/\u200B/g, '').trim()
      : creatorText.trim();
    const rawHtml = creatorEditorRef.current?.innerHTML ?? creatorHtml;
    const title = creatorTitle.trim();
    if (!title && !rawText) return null;
    const now = new Date().toISOString();
    return {
      id: creatorNoteId.current ?? newNoteId(),
      title,
      html: cleanHtml(rawHtml),
      text: rawText,
      shiftDay: creatorShift,
      color: creatorColor,
      pattern: creatorPattern,
      isPinned: creatorIsPinned,
      tags: [],
      createdAt: now,
      updatedAt: now,
    };
  }, [creatorTitle, creatorText, creatorHtml, creatorShift, creatorColor, creatorPattern, creatorIsPinned]);

  const autosaveCreator = useCallback(() => {
    const note = buildCreatorNote();
    if (!note) return;
    creatorNoteId.current = note.id;
    update(current => ({
      ...current,
      notes: current.notes.some(item => item.id === note.id)
        ? current.notes.map(item => item.id === note.id ? { ...item, ...note, createdAt: item.createdAt } : item)
        : [note, ...current.notes],
    }));
  }, [buildCreatorNote, update]);

  useEffect(() => {
    if (!isCreatorExpanded) return;
    if (!creatorTitle.trim() && !creatorText.trim() && !creatorHtml.trim()) return;
    const timer = setTimeout(autosaveCreator, 850);
    return () => clearTimeout(timer);
  }, [isCreatorExpanded, creatorTitle, creatorText, creatorHtml, creatorShift, creatorColor, creatorPattern, creatorIsPinned, autosaveCreator]);

  const showToast = (msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastMessage(msg);
    toastTimer.current = setTimeout(() => setToastMessage(''), 2600);
  };

  useEffect(() => {
    if (!editingNote || !editDirty.current) return;
    const timer = setTimeout(() => {
      const editor = modalEditorRef.current;
      const html = cleanHtml(editor?.innerHTML ?? editHtml);
      const text = editor?.innerText.replace(/\u200B/g, '').trim() ?? editText.trim();
      update(current => ({
        ...current,
        notes: current.notes.map(note => note.id === editingNote.id
          ? { ...note, title: editTitle.trim(), html, text, shiftDay: editShift, color: editColor, pattern: editPattern, isPinned: editIsPinned, updatedAt: new Date().toISOString() }
          : note),
      }));
      editDirty.current = false;
    }, 850);
    return () => clearTimeout(timer);
  }, [editingNote, editTitle, editHtml, editText, editShift, editColor, editPattern, editIsPinned, update]);

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);



  // Selection change handler for floating toolbar
  useEffect(() => {
    const handleSelectionChange = () => {
      if (isInteractingWithToolbarRef.current) return;
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
        setFloatingToolbar(null);
        selectedNoteCardIdRef.current = null;
        return;
      }
      const range = selection.getRangeAt(0);
      const text = selection.toString().trim();
      if (!text) {
        setFloatingToolbar(null);
        selectedNoteCardIdRef.current = null;
        return;
      }

      // Ensure selection is inside one of our active editors or an expanded note card body
      const inCreator = creatorEditorRef.current?.contains(range.commonAncestorContainer);
      const inModal = modalEditorRef.current?.contains(range.commonAncestorContainer);

      const container = range.commonAncestorContainer instanceof Element
        ? range.commonAncestorContainer
        : range.commonAncestorContainer.parentElement;
      const cardBody = container?.closest(`.${styles.noteCardBody}`) as HTMLElement | null;
      const cardNoteId = cardBody?.getAttribute('data-note-id') || null;

      if (!inCreator && !inModal && !cardNoteId) {
        setFloatingToolbar(null);
        selectedNoteCardIdRef.current = null;
        return;
      }

      lastSelectionTimeRef.current = Date.now();
      savedSelectionRange.current = range.cloneRange();
      selectedNoteCardIdRef.current = cardNoteId;

      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        setFloatingToolbar(null);
        return;
      }

      const isNarrow = window.innerWidth < 768;
      const toolbarWidth = isNarrow ? Math.min(310, window.innerWidth - 20) : Math.min(420, window.innerWidth - 24);
      const toolbarHeight = isNarrow ? 120 : 145;

      let x = rect.left + rect.width / 2;
      x = Math.max(toolbarWidth / 2 + 10, Math.min(window.innerWidth - toolbarWidth / 2 - 10, x));

      let placeBelow = rect.top < (toolbarHeight + 20);
      let y = placeBelow ? rect.bottom + 12 : rect.top - 12;

      if (placeBelow && (y + toolbarHeight > window.innerHeight - 10)) {
        y = Math.max(toolbarHeight + 10, rect.top - 12);
        placeBelow = false;
      } else if (!placeBelow && y < toolbarHeight + 10) {
        y = toolbarHeight + 10;
      }

      setFloatingToolbar({ x, y, placeBelow });
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    window.addEventListener('resize', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
      window.removeEventListener('resize', handleSelectionChange);
    };
  }, []);

  // Save creator note
  const handleSaveCreator = useCallback(() => {
    const newNote = buildCreatorNote();
    if (!newNote) {
      setIsCreatorExpanded(false);
      return;
    }

    update(current => ({
      ...current,
      notes: current.notes.some(note => note.id === newNote.id)
        ? current.notes.map(note => note.id === newNote.id ? { ...note, ...newNote, createdAt: note.createdAt } : note)
        : [newNote, ...(current.notes || [])],
    }));
    void flush();

    // Reset creator
    setCreatorTitle('');
    setCreatorHtml('');
    setCreatorText('');
    setCreatorShift(null);
    setCreatorColor('default');
    setCreatorPattern('none');
    setCreatorIsPinned(false);
    creatorNoteId.current = null;
    if (creatorEditorRef.current) {
      creatorEditorRef.current.innerHTML = '';
    }
    setIsCreatorExpanded(false);
    showToast('Nota guardada');
  }, [buildCreatorNote, flush, update]);

  // Open note edit modal
  const handleOpenEditModal = (note: KeepNote) => {
    setEditingNote(note);
    setEditTitle(note.title || '');
    setEditHtml(note.html || '');
    setEditText(note.text || '');
    setEditShift(note.shiftDay || null);
    setEditColor(note.color || 'default');
    setEditPattern(note.pattern || 'none');
    setEditIsPinned(!!note.isPinned);
    editDirty.current = false;
  };

  // Save note edit modal
  const handleSaveEditModal = useCallback(() => {
    if (!editingNote) return;
    const rawText = modalEditorRef.current ? modalEditorRef.current.innerText.replace(/\u200B/g, '').trim() : editText.trim();
    const rawHtml = modalEditorRef.current?.innerHTML ?? editHtml;
    const title = editTitle.trim();

    update(current => ({
      ...current,
      notes: (current.notes || []).map(n =>
        n.id === editingNote.id
          ? {
              ...n,
              title,
              html: cleanHtml(rawHtml),
              text: rawText,
              shiftDay: editShift,
              color: editColor,
              pattern: editPattern,
              isPinned: editIsPinned,
              updatedAt: new Date().toISOString(),
            }
          : n
      ),
    }));

    // Cerrar el editor fuerza la última escritura pendiente antes de desmontar
    // cualquier contenido local del formulario.
    void flush();

    editDirty.current = false;
    setEditingNote(null);
    showToast('Cambios guardados');
  }, [editingNote, editTitle, editText, editHtml, editShift, editColor, editPattern, editIsPinned, flush, update]);

  // Close creator or modal popovers on click outside and handle Escape key
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (noteToDelete) return;
      const target = e.target as HTMLElement;
      if (!target.closest(`.${styles.palettePopover}`) && !target.closest(`.${styles.shiftPopover}`)) {
        setCreatorPaletteOpen(false);
        setCreatorShiftOpen(false);
        setEditPaletteOpen(false);
        setEditShiftOpen(false);
        setCardPaletteNoteId(null);
        setCardShiftNoteId(null);
      }
      if (
        isCreatorExpanded &&
        creatorContainerRef.current &&
        !creatorContainerRef.current.contains(target) &&
        !target.closest(`.${styles.palettePopover}`) &&
        !target.closest(`.${styles.shiftPopover}`) &&
        !target.closest(`.${styles.floatingToolbar}`) &&
        !target.closest(`.${styles.modalBackdrop}`)
      ) {
        handleSaveCreator();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (noteToDelete) return;
      if (e.key === 'Escape') {
        if (creatorPaletteOpen || editPaletteOpen || cardPaletteNoteId || creatorShiftOpen || editShiftOpen || cardShiftNoteId) {
          setCreatorPaletteOpen(false);
          setEditPaletteOpen(false);
          setCardPaletteNoteId(null);
          setCreatorShiftOpen(false);
          setEditShiftOpen(false);
          setCardShiftNoteId(null);
          return;
        }
        if (linkModalData?.isOpen) {
          setLinkModalData(null);
        } else if (editingNote) {
          handleSaveEditModal();
        } else if (isCreatorExpanded) {
          handleSaveCreator();
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isCreatorExpanded, editingNote, linkModalData, noteToDelete, handleSaveCreator, handleSaveEditModal]);

  // Delete note
  const handleDeleteNote = (noteId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const note = state.notes.find(note => note.id === noteId);
    if (!note) return;
    setNoteToDelete(editingNote?.id === noteId ? { ...note, title: editTitle } : note);
    setFloatingToolbar(null);
    setCardPaletteNoteId(null);
    setCardShiftNoteId(null);
  };

  const confirmDeleteNote = () => {
    if (!noteToDelete) return;
    const noteId = noteToDelete.id;
    update(current => ({
      ...current,
      notes: (current.notes || []).filter(n => n.id !== noteId),
    }));
    void flush();
    if (editingNote?.id === noteId) {
      setEditingNote(null);
    }
    setNoteToDelete(null);
    showToast('Nota eliminada');
  };

  // Toggle pin
  const handleTogglePin = (noteId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    update(current => ({
      ...current,
      notes: (current.notes || []).map(n => (n.id === noteId ? { ...n, isPinned: !n.isPinned } : n)),
    }));
  };

  // Toggle checkbox directly in card
  const handleToggleCardCheckbox = (noteId: string, checkboxIndex: number, e: React.MouseEvent) => {
    e.stopPropagation();
    update(current => ({
      ...current,
      notes: (current.notes || []).map(n => {
        if (n.id === noteId) {
          const updatedHtml = toggleCheckboxInHtml(n.html, checkboxIndex);
          return { ...n, html: updatedHtml, updatedAt: new Date().toISOString() };
        }
        return n;
      }),
    }));
  };

  // Restore text selection in active editor
  const restoreActiveSelection = () => {
    const activeEditor = editingNote ? modalEditorRef.current : creatorEditorRef.current;
    if (!activeEditor) return;
    activeEditor.focus();
    const selection = window.getSelection();
    if (savedSelectionRange.current && activeEditor.contains(savedSelectionRange.current.commonAncestorContainer)) {
      selection?.removeAllRanges();
      selection?.addRange(savedSelectionRange.current);
    }
  };

  // Formatting commands for active editor
  const execFormat = (cmd: string, val?: string) => {
    if (editingNote) editDirty.current = true;
    restoreActiveSelection();
    document.execCommand(cmd, false, val);
    const activeEditor = editingNote ? modalEditorRef.current : creatorEditorRef.current;
    if (activeEditor) {
      if (editingNote) {
        setEditHtml(cleanHtml(activeEditor.innerHTML));
        setEditText(activeEditor.innerText.replace(/\u200B/g, ''));
      } else {
        setCreatorHtml(cleanHtml(activeEditor.innerHTML));
        setCreatorText(activeEditor.innerText.replace(/\u200B/g, ''));
      }
    }
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      savedSelectionRange.current = selection.getRangeAt(0).cloneRange();
    }
  };

  const applyHeading = (tag: 'p' | 'h1' | 'h2' | 'h3') => {
    if (editingNote) editDirty.current = true;
    restoreActiveSelection();
    try {
      document.execCommand('formatBlock', false, `<${tag}>`);
    } catch {
      document.execCommand('formatBlock', false, tag);
    }
    const activeEditor = editingNote ? modalEditorRef.current : creatorEditorRef.current;
    if (activeEditor) {
      if (editingNote) {
        setEditHtml(cleanHtml(activeEditor.innerHTML));
      } else {
        setCreatorHtml(cleanHtml(activeEditor.innerHTML));
      }
    }
  };

  const applyHighlight = (color: string, mode: 'fill' | 'underline') => {
    restoreActiveSelection();
    const selection = window.getSelection();
    const range: Range | null = selection && !selection.isCollapsed && selection.rangeCount > 0
      ? selection.getRangeAt(0)
      : savedSelectionRange.current;

    if (!range || range.collapsed) return;

    const inCreator = creatorEditorRef.current?.contains(range.commonAncestorContainer);
    const inModal = modalEditorRef.current?.contains(range.commonAncestorContainer);

    const container = range.commonAncestorContainer instanceof Element
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;
    const cardBody = container?.closest(`.${styles.noteCardBody}`) as HTMLElement | null;
    const cardNoteId = cardBody?.getAttribute('data-note-id') || selectedNoteCardIdRef.current;

    if (!inCreator && !inModal && (!cardBody || !cardNoteId)) return;

    if (editingNote) editDirty.current = true;

    try {
      const fragment = range.extractContents();
      const span = document.createElement('span');

      if (mode === 'fill') {
        span.setAttribute('data-highlight', 'fill');
        span.style.backgroundColor = color;
        span.style.color = '#1e293b';
        span.style.borderRadius = '3px';
        span.style.padding = '1px 3px';
      } else {
        span.setAttribute('data-highlight', 'underline');
        span.style.textDecoration = 'underline';
        span.style.textDecorationColor = color;
        span.style.textDecorationThickness = '2.5px';
        span.style.textUnderlineOffset = '3px';
      }
      span.appendChild(fragment);
      range.insertNode(span);
      selection?.removeAllRanges();

      const activeEditor = editingNote ? modalEditorRef.current : creatorEditorRef.current;
      if (activeEditor) {
        if (editingNote) setEditHtml(cleanHtml(activeEditor.innerHTML));
        else setCreatorHtml(cleanHtml(activeEditor.innerHTML));
      } else if (cardBody && cardNoteId) {
        const updatedHtml = cleanHtml(cardBody.innerHTML);
        const updatedText = cardBody.innerText.replace(/\u200B/g, '');
        update(current => ({
          ...current,
          notes: current.notes.map(n => n.id === cardNoteId ? {
            ...n,
            html: updatedHtml,
            text: updatedText,
            updatedAt: new Date().toISOString()
          } : n)
        }));
        void flush();
      }
    } catch (err) {
      console.error('Error applying highlight:', err);
    }
  };

  const removeFormat = () => {
    restoreActiveSelection();
    const selection = window.getSelection();
    const range: Range | null = selection && !selection.isCollapsed && selection.rangeCount > 0
      ? selection.getRangeAt(0)
      : savedSelectionRange.current;

    const activeEditor = editingNote ? modalEditorRef.current : creatorEditorRef.current;
    if (activeEditor) {
      if (editingNote) editDirty.current = true;
      document.execCommand('removeFormat', false);
      if (range) {
        const spans = activeEditor.querySelectorAll('span[data-highlight]');
        spans.forEach(span => {
          if (range && range.intersectsNode(span)) {
            const parent = span.parentNode;
            while (span.firstChild) parent?.insertBefore(span.firstChild, span);
            parent?.removeChild(span);
          }
        });
      }
      if (editingNote) setEditHtml(cleanHtml(activeEditor.innerHTML));
      else setCreatorHtml(cleanHtml(activeEditor.innerHTML));
    } else if (range) {
      const container = range.commonAncestorContainer instanceof Element
        ? range.commonAncestorContainer
        : range.commonAncestorContainer.parentElement;
      const cardBody = container?.closest(`.${styles.noteCardBody}`) as HTMLElement | null;
      const cardNoteId = cardBody?.getAttribute('data-note-id') || selectedNoteCardIdRef.current;
      if (cardBody && cardNoteId) {
        const spans = cardBody.querySelectorAll('span[data-highlight]');
        spans.forEach(span => {
          if (range && range.intersectsNode(span)) {
            const parent = span.parentNode;
            while (span.firstChild) parent?.insertBefore(span.firstChild, span);
            parent?.removeChild(span);
          }
        });
        const updatedHtml = cleanHtml(cardBody.innerHTML);
        const updatedText = cardBody.innerText.replace(/\u200B/g, '');
        update(current => ({
          ...current,
          notes: current.notes.map(n => n.id === cardNoteId ? {
            ...n,
            html: updatedHtml,
            text: updatedText,
            updatedAt: new Date().toISOString()
          } : n)
        }));
        void flush();
      }
    }
    setFloatingToolbar(null);
  };

  const insertUnorderedList = () => {
    if (editingNote) editDirty.current = true;
    restoreActiveSelection();
    document.execCommand('insertUnorderedList', false);
    const activeEditor = editingNote ? modalEditorRef.current : creatorEditorRef.current;
    if (activeEditor) {
      if (editingNote) setEditHtml(cleanHtml(activeEditor.innerHTML));
      else setCreatorHtml(cleanHtml(activeEditor.innerHTML));
    }
  };

  const insertChecklist = () => {
    if (editingNote) editDirty.current = true;
    restoreActiveSelection();
    const html = `<div style="display:flex;align-items:center;gap:8px;margin:6px 0;"><input type="checkbox" style="width:16px;height:16px;cursor:pointer;" /> <span>Tarea</span></div><p><br></p>`;
    document.execCommand('insertHTML', false, html);
    const activeEditor = editingNote ? modalEditorRef.current : creatorEditorRef.current;
    if (activeEditor) {
      if (editingNote) setEditHtml(cleanHtml(activeEditor.innerHTML));
      else setCreatorHtml(cleanHtml(activeEditor.innerHTML));
    }
  };

  // Filter notes
  const notes = state.notes || [];
  const filteredNotes = notes.filter(note => {
    if (search.trim()) {
      const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const q = normalize(search.trim());
      const matchTitle = normalize(note.title || '').includes(q);
      const matchText = normalize(note.text || '').includes(q);
      const matchTag = note.tags?.some(t => normalize(t).includes(q));
      if (!matchTitle && !matchText && !matchTag) return false;
    }
    if (shiftFilter === 'none') {
      if (note.shiftDay) return false;
    } else if (shiftFilter !== 'all') {
      if (note.shiftDay !== shiftFilter) return false;
    }
    return true;
  });

  const pinnedNotes = filteredNotes.filter(n => n.isPinned);
  const otherNotes = filteredNotes.filter(n => !n.isPinned);

  return (
    <div className={styles.journal}>
      {/* Toast Notification */}
      {toastMessage && <div className={styles.toolbarToast} role="status">{toastMessage}</div>}
      {noteToDelete && <DeleteNoteDialog title={noteToDelete.title} onCancel={() => setNoteToDelete(null)} onConfirm={confirmDeleteNote} />}
      <JournalTourModal
        key={isTourOpen ? 'tour-open' : 'tour-closed'}
        isOpen={isTourOpen}
        onClose={handleCloseTour}
      />

      {/* Page Header */}
      <div className="flex items-center justify-between border-b border-border pb-3 mb-4 sm:mb-6">
        <div className="flex items-center gap-2.5">
          <h1 className="text-2xl sm:text-3xl font-black text-text tracking-tight">
            Mi Diario
          </h1>
          <button
            type="button"
            onClick={() => setIsTourOpen(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-extrabold text-amber-700 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/25 transition-all shadow-sm"
            title="Conoce las novedades de Mi Diario para las Puertas Abiertas"
          >
            <Icon name="auto_awesome" className="text-[14px]" />
            <span className="hidden sm:inline">Novedades</span>
          </button>
        </div>
        {status !== 'ready' && (
          <div className={styles.persistenceStatus} role="status" aria-live="polite">
            {status === 'loading' && (
              <span className="flex items-center gap-1.5 text-xs text-text-dim">
                <Icon name="sync" className="animate-spin text-[16px]" />
                <span>Cargando…</span>
              </span>
            )}
            {status === 'saving' && (
              <span className="flex items-center gap-1.5 text-xs text-text-dim">
                <Icon name="cloud_upload" className="animate-pulse text-[16px]" />
                <span>Guardando…</span>
              </span>
            )}
            {status === 'error' && (
              <span className="flex items-center gap-1.5 text-xs text-rose-500 font-semibold">
                <Icon name="cloud_off" className="text-[16px]" />
                <span>Error</span>
                <button type="button" className="underline ml-1" onClick={() => void retry()}>Reintentar</button>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Top Note Creator (Google Keep Style) */}
      <div className={styles.creatorContainer} ref={creatorContainerRef}>
        {!isCreatorExpanded ? (
          <div
            className={styles.creatorCollapsed}
            onClick={() => setIsCreatorExpanded(true)}
            role="button"
            tabIndex={0}
            onKeyDown={e => {
              if (e.target !== e.currentTarget) return;
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setIsCreatorExpanded(true);
              }
            }}
          >
            <span className={styles.creatorCollapsedPlaceholder}>Escribe una nota...</span>
            <div className={styles.creatorCollapsedActions}>
              <button
                type="button"
                className={styles.creatorQuickBtn}
                title="Nueva lista con tareas"
                onClick={e => {
                  e.stopPropagation();
                  setIsCreatorExpanded(true);
                  setTimeout(() => {
                    creatorEditorRef.current?.focus();
                    insertChecklist();
                  }, 50);
                }}
              >
                <Icon name="check_box" />
              </button>
              <button
                type="button"
                className={styles.creatorQuickBtn}
                title="Elegir color de fondo"
                onClick={e => {
                  e.stopPropagation();
                  setIsCreatorExpanded(true);
                  setTimeout(() => {
                    setCreatorPaletteOpen(true);
                  }, 50);
                }}
              >
                <Icon name="palette" />
              </button>
            </div>
          </div>
        ) : (
          <div
            className={`${styles.creatorExpanded} ${styles[`theme_${creatorColor}`]} ${styles[`pattern_${creatorPattern}`]}`}
          >
            {/* Header: Title and Pin */}
            <div className={styles.creatorHeader}>
              <input
                type="text"
                className={styles.creatorTitleInput}
                placeholder="Título"
                maxLength={200}
                value={creatorTitle}
                onChange={e => setCreatorTitle(e.target.value)}
                autoFocus
              />
              <button
                type="button"
                className={`${styles.creatorPinBtn} ${creatorIsPinned ? styles.creatorPinBtnActive : ''}`}
                title={creatorIsPinned ? 'Desfijar nota' : 'Fijar nota arriba'}
                onClick={() => setCreatorIsPinned(!creatorIsPinned)}
              >
                <Icon name={creatorIsPinned ? 'keep' : 'keep_public'} />
              </button>
            </div>

            {/* Body: Rich Contenteditable */}
            <div
              ref={creatorEditorRef}
              contentEditable
              onPaste={event => {
                event.preventDefault();
                document.execCommand('insertText', false, event.clipboardData.getData('text/plain'));
              }}
              onDrop={event => event.preventDefault()}
              suppressContentEditableWarning
              role="textbox"
              aria-label="Contenido de la nota"
              aria-multiline="true"
              data-placeholder="Escribe una nota..."
              className={styles.creatorBody}
              onInput={() => {
                if (creatorEditorRef.current) {
                  setCreatorHtml(creatorEditorRef.current.innerHTML);
                  setCreatorText(creatorEditorRef.current.innerText);
                }
              }}
              onClick={e => {
                const target = e.target as HTMLElement;
                if (target && target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'checkbox') {
                  const input = target as HTMLInputElement;
                  if (input.checked) input.setAttribute('checked', 'checked');
                  else input.removeAttribute('checked');
                  if (creatorEditorRef.current) {
                    setCreatorHtml(creatorEditorRef.current.innerHTML);
                  }
                }
              }}
            />

            {/* Footer: Tools, Shift Selector, Palette & Actions */}
            <div className={styles.creatorFooter}>
              <div className={styles.creatorFooterLeft}>
                {/* Shift Association Chip / Dropdown */}
                <div className="relative">
                  <button
                    type="button"
                    className={styles.shiftChipBtn}
                    onClick={() => setCreatorShiftOpen(!creatorShiftOpen)}
                    title="Asociar a un turno de servicio"
                  >
                    <Icon name="calendar_month" />
                    <span>{creatorShift ? `Turno ${formatChipDate(creatorShift)}` : 'Asociar turno'}</span>
                    <Icon name="arrow_drop_down" className="-ml-1 opacity-70 text-[16px]" />
                  </button>

                  {creatorShiftOpen && (
                    <div className={styles.shiftPopover}>
                      <div className="px-2 py-1 text-[11px] font-bold text-journal-secondary uppercase">
                        Vincular a un turno
                      </div>
                      <button
                        type="button"
                        className={`${styles.shiftOptionItem} ${creatorShift === null ? styles.shiftOptionItemActive : ''}`}
                        onClick={() => {
                          setCreatorShift(null);
                          setCreatorShiftOpen(false);
                        }}
                      >
                        <span>Sin turno (Nota personal)</span>
                        {creatorShift === null && <Icon name="check" />}
                      </button>
                      {days.map(d => (
                        <button
                          key={d}
                          type="button"
                          className={`${styles.shiftOptionItem} ${creatorShift === d ? styles.shiftOptionItemActive : ''}`}
                          onClick={() => {
                            setCreatorShift(d);
                            setCreatorShiftOpen(false);
                          }}
                        >
                          <span>Turno: {formatChipDate(d)}</span>
                          {creatorShift === d && <Icon name="check" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Color and Pattern Palette */}
                <div className="relative">
                  <button
                    type="button"
                    className={`${styles.keepToolBtn} ${creatorPaletteOpen ? styles.keepToolBtnActive : ''}`}
                    title="Opciones de fondo y colores"
                    onClick={() => setCreatorPaletteOpen(!creatorPaletteOpen)}
                  >
                    <Icon name="palette" />
                  </button>

                  {creatorPaletteOpen && (
                    <div className={styles.palettePopover}>
                      <div className={styles.paletteSectionTitle}>Color de fondo</div>
                      <div className={styles.paletteColorsGrid}>
                        {NOTE_COLORS.map(c => (
                          <button
                            key={c.id}
                            type="button"
                            title={c.label}
                            className={`${styles.colorSwatchBtn} ${creatorColor === c.id ? styles.colorSwatchBtnActive : ''}`}
                            style={{ '--swatch-light': c.lightBg, '--swatch-dark': c.darkBg, background: c.lightBg } as React.CSSProperties}
                            onClick={() => setCreatorColor(c.id)}
                          >
                            {creatorColor === c.id && <Icon name="check" />}
                          </button>
                        ))}
                      </div>

                      <div className={styles.paletteSectionTitle}>Diseño de fondo</div>
                      <div className={styles.palettePatternsGrid}>
                        {NOTE_PATTERNS.map(p => (
                          <button
                            key={p.id}
                            type="button"
                            title={p.label}
                            className={`${styles.patternSwatchBtn} ${creatorPattern === p.id ? styles.patternSwatchBtnActive : ''}`}
                            onClick={() => setCreatorPattern(p.id)}
                          >
                            <Icon name={p.icon} />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Block Tools */}
                <button
                  type="button"
                  className={styles.keepToolBtn}
                  title="Lista de tareas"
                  onClick={insertChecklist}
                >
                  <Icon name="check_box" />
                </button>
                <button
                  type="button"
                  className={styles.keepToolBtn}
                  title="Lista con viñetas"
                  onClick={insertUnorderedList}
                >
                  <Icon name="format_list_bulleted" />
                </button>

                {/* Link Modal */}
                <button
                  type="button"
                  className={styles.keepToolBtn}
                  title="Insertar enlace"
                  onClick={() => {
                    const sel = window.getSelection();
                    const text = sel ? sel.toString().trim() : '';
                    setLinkModalData({ isOpen: true, title: text, url: '', range: savedSelectionRange.current });
                  }}
                >
                  <Icon name="link" />
                </button>
              </div>

              {/* Action: Close aligned to right */}
              <div className={styles.creatorFooterRight}>
                <button
                  type="button"
                  className={styles.keepSaveBtn}
                  onClick={handleSaveCreator}
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Search & Filter Bar */}
      <div className={styles.keepSearchRow}>
        <SmartSearchBar
          value={search}
          onValueChange={setSearch}
          placeholder="Buscar por título o contenido de notas..."
          className="w-full"
        />

        {/* Shift Filter Chips */}
        {days.length > 0 && (
          <div className={styles.keepFilterScroll}>
            <button
              type="button"
              className={`${styles.keepFilterChip} ${shiftFilter === 'all' ? styles.keepFilterChipActive : ''}`}
              onClick={() => setShiftFilter('all')}
            >
              Todas las notas
            </button>
            <button
              type="button"
              className={`${styles.keepFilterChip} ${shiftFilter === 'none' ? styles.keepFilterChipActive : ''}`}
              onClick={() => setShiftFilter('none')}
            >
              Sin turno
            </button>
            {days.map(d => (
              <button
                key={d}
                type="button"
                className={`${styles.keepFilterChip} ${shiftFilter === d ? styles.keepFilterChipActive : ''}`}
                onClick={() => setShiftFilter(d)}
              >
                <Icon name="calendar_month" className="text-[14px]" />
                {formatChipDate(d)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Notes Grid */}
      {filteredNotes.length === 0 ? (
        <div className={styles.keepEmptyState}>
          <div className={styles.keepEmptyIcon}>
            <Icon name="note_alt" />
          </div>
          <h3 className={styles.keepEmptyTitle}>
            {search.trim() || shiftFilter !== 'all' ? 'No se encontraron notas' : 'Aún no tienes notas'}
          </h3>
          <p className={styles.keepEmptyDesc}>
            {search.trim() || shiftFilter !== 'all'
              ? 'Intenta con otro término de búsqueda o limpia los filtros.'
              : 'Escribe una nota arriba para guardar recuerdos, reflexiones o listas de tus turnos de servicio.'}
          </p>
          {(search.trim() || shiftFilter !== 'all') && <button type="button" className={styles.keepSaveBtn} onClick={() => { setSearch(''); setShiftFilter('all'); }}>Limpiar filtros</button>}
        </div>
      ) : (
        <>
          {/* Pinned Notes Section */}
          {pinnedNotes.length > 0 && (
            <div>
              <div className={styles.keepSectionTitle}>
                <Icon name="push_pin" />
                Fijadas
              </div>
              <div className={styles.notesGrid}>
                {pinnedNotes.map((note, index) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    onOpen={() => handleOpenEditModal(note)}
                    onTogglePin={e => handleTogglePin(note.id, e)}
                    onDelete={e => handleDeleteNote(note.id, e)}
                    onToggleCheckbox={(idx, e) => handleToggleCardCheckbox(note.id, idx, e)}
                    cardPaletteNoteId={cardPaletteNoteId}
                    setCardPaletteNoteId={setCardPaletteNoteId}
                    onSetColor={(c, p) => {
                      update(curr => ({
                        ...curr,
                        notes: (curr.notes || []).map(n =>
                          n.id === note.id ? { ...n, color: c, pattern: p ?? n.pattern } : n
                        ),
                      }));
                      setCardPaletteNoteId(null);
                    }}
                    cardShiftNoteId={cardShiftNoteId}
                    setCardShiftNoteId={setCardShiftNoteId}
                    days={days}
                    onSetShift={s => {
                      update(curr => ({
                        ...curr,
                        notes: (curr.notes || []).map(n =>
                          n.id === note.id ? { ...n, shiftDay: s } : n
                        ),
                      }));
                      setCardShiftNoteId(null);
                    }}
                    isExpanded={expandedNoteId === note.id}
                    onToggleExpand={() => setExpandedNoteId(prev => prev === note.id ? null : note.id)}
                    stackIndex={index}
                    isMobile={isMobile}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Other Notes Section */}
          {otherNotes.length > 0 && (
            <div>
              {pinnedNotes.length > 0 && (
                <div className={styles.keepSectionTitle}>
                  Otras
                </div>
              )}
              <div className={styles.notesGrid}>
                {otherNotes.map((note, index) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    onOpen={() => handleOpenEditModal(note)}
                    onTogglePin={e => handleTogglePin(note.id, e)}
                    onDelete={e => handleDeleteNote(note.id, e)}
                    onToggleCheckbox={(idx, e) => handleToggleCardCheckbox(note.id, idx, e)}
                    cardPaletteNoteId={cardPaletteNoteId}
                    setCardPaletteNoteId={setCardPaletteNoteId}
                    onSetColor={(c, p) => {
                      update(curr => ({
                        ...curr,
                        notes: (curr.notes || []).map(n =>
                          n.id === note.id ? { ...n, color: c, pattern: p ?? n.pattern } : n
                        ),
                      }));
                      setCardPaletteNoteId(null);
                    }}
                    cardShiftNoteId={cardShiftNoteId}
                    setCardShiftNoteId={setCardShiftNoteId}
                    days={days}
                    onSetShift={s => {
                      update(curr => ({
                        ...curr,
                        notes: (curr.notes || []).map(n =>
                          n.id === note.id ? { ...n, shiftDay: s } : n
                        ),
                      }));
                      setCardShiftNoteId(null);
                    }}
                    isExpanded={expandedNoteId === note.id}
                    onToggleExpand={() => setExpandedNoteId(prev => prev === note.id ? null : note.id)}
                    stackIndex={index}
                    isMobile={isMobile}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Note Edit Modal (Google Keep In-Place Dialog) */}
      {editingNote && (
        <div
          className={styles.noteEditBackdrop}
          onClick={handleSaveEditModal}
        >
          <div
            className={`${styles.noteEditCard} ${styles[`theme_${editColor}`]} ${styles[`pattern_${editPattern}`]}`}
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Editar nota"
          >
            {/* Header */}
            <div className={styles.creatorHeader}>
              <input
                type="text"
                className={styles.creatorTitleInput}
                placeholder="Título"
                maxLength={200}
                value={editTitle}
                onChange={e => { editDirty.current = true; setEditTitle(e.target.value); }}
              />
              <button
                type="button"
                className={`${styles.creatorPinBtn} ${editIsPinned ? styles.creatorPinBtnActive : ''}`}
                title={editIsPinned ? 'Desfijar nota' : 'Fijar nota arriba'}
                onClick={() => { editDirty.current = true; setEditIsPinned(!editIsPinned); }}
              >
                <Icon name={editIsPinned ? 'keep' : 'keep_public'} />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className={styles.noteEditBodyScroll}>
              <div
                ref={modalEditorRef}
                contentEditable
              onPaste={event => {
                event.preventDefault();
                document.execCommand('insertText', false, event.clipboardData.getData('text/plain'));
              }}
              onDrop={event => event.preventDefault()}
                suppressContentEditableWarning
                role="textbox"
                aria-label="Contenido de la nota"
                aria-multiline="true"
                data-placeholder="Escribe una nota..."
                className={styles.creatorBody}
                dangerouslySetInnerHTML={{ __html: editingNote.html }}
                onInput={() => {
                  if (modalEditorRef.current) {
                    editDirty.current = true;
                    setEditHtml(modalEditorRef.current.innerHTML);
                    setEditText(modalEditorRef.current.innerText);
                  }
                }}
                onClick={e => {
                  const target = e.target as HTMLElement;
                  if (target && target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'checkbox') {
                    const input = target as HTMLInputElement;
                    if (input.checked) input.setAttribute('checked', 'checked');
                    else input.removeAttribute('checked');
                    if (modalEditorRef.current) {
                      editDirty.current = true;
                      setEditHtml(modalEditorRef.current.innerHTML);
                    }
                  }
                }}
              />
            </div>

            {/* Modal Footer */}
            <div className={styles.creatorFooter}>
              <div className={styles.creatorFooterLeft}>
                {/* Shift Selector */}
                <div className="relative">
                  <button
                    type="button"
                    className={styles.shiftChipBtn}
                    onClick={() => setEditShiftOpen(!editShiftOpen)}
                  >
                    <Icon name="calendar_month" />
                    <span>{editShift ? `Turno ${formatChipDate(editShift)}` : 'Asociar turno'}</span>
                    <Icon name="arrow_drop_down" className="-ml-1 opacity-70 text-[16px]" />
                  </button>

                  {editShiftOpen && (
                    <div className={styles.shiftPopover}>
                      <button
                        type="button"
                        className={`${styles.shiftOptionItem} ${editShift === null ? styles.shiftOptionItemActive : ''}`}
                        onClick={() => {
                          editDirty.current = true;
                          setEditShift(null);
                          setEditShiftOpen(false);
                        }}
                      >
                        <span>Sin turno</span>
                        {editShift === null && <Icon name="check" />}
                      </button>
                      {days.map(d => (
                        <button
                          key={d}
                          type="button"
                          className={`${styles.shiftOptionItem} ${editShift === d ? styles.shiftOptionItemActive : ''}`}
                          onClick={() => {
                            editDirty.current = true;
                            setEditShift(d);
                            setEditShiftOpen(false);
                          }}
                        >
                          <span>Turno: {formatChipDate(d)}</span>
                          {editShift === d && <Icon name="check" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Color & Pattern */}
                <div className="relative">
                  <button
                    type="button"
                    className={`${styles.keepToolBtn} ${editPaletteOpen ? styles.keepToolBtnActive : ''}`}
                    title="Fondo y color"
                    onClick={() => setEditPaletteOpen(!editPaletteOpen)}
                  >
                    <Icon name="palette" />
                  </button>

                  {editPaletteOpen && (
                    <div className={styles.palettePopover}>
                      <div className={styles.paletteSectionTitle}>Color de fondo</div>
                      <div className={styles.paletteColorsGrid}>
                        {NOTE_COLORS.map(c => (
                          <button
                            key={c.id}
                            type="button"
                            title={c.label}
                            className={`${styles.colorSwatchBtn} ${editColor === c.id ? styles.colorSwatchBtnActive : ''}`}
                            style={{ '--swatch-light': c.lightBg, '--swatch-dark': c.darkBg, background: c.lightBg } as React.CSSProperties}
                            onClick={() => { editDirty.current = true; setEditColor(c.id); }}
                          >
                            {editColor === c.id && <Icon name="check" />}
                          </button>
                        ))}
                      </div>

                      <div className={styles.paletteSectionTitle}>Diseño de fondo</div>
                      <div className={styles.palettePatternsGrid}>
                        {NOTE_PATTERNS.map(p => (
                          <button
                            key={p.id}
                            type="button"
                            title={p.label}
                            className={`${styles.patternSwatchBtn} ${editPattern === p.id ? styles.patternSwatchBtnActive : ''}`}
                            onClick={() => { editDirty.current = true; setEditPattern(p.id); }}
                          >
                            <Icon name={p.icon} />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Block Tools in Modal */}
                <button type="button" className={styles.keepToolBtn} title="Checklist" onClick={insertChecklist}>
                  <Icon name="check_box" />
                </button>
                <button type="button" className={styles.keepToolBtn} title="Lista con viñetas" onClick={insertUnorderedList}>
                  <Icon name="format_list_bulleted" />
                </button>

                {/* Delete Note */}
                <button
                  type="button"
                  className={`${styles.keepToolBtn} ${styles.noteActionBtnDanger}`}
                  title="Eliminar nota"
                  onClick={() => handleDeleteNote(editingNote.id)}
                >
                  <Icon name="delete" />
                </button>
              </div>

              {/* Close */}
              <div className={styles.creatorFooterRight}>
                <button
                  type="button"
                  className={styles.keepSaveBtn}
                  onClick={handleSaveEditModal}
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Selection Formatting Toolbar (Gospel Library / Scripture Reader Style) */}
      {floatingToolbar && (
        <div
          role="toolbar"
          aria-label="Herramientas de formato flotante"
          className={`${styles.floatingToolbar} ${floatingToolbar.placeBelow ? styles.placedBelow : ''}`}
          style={{
            top: `${floatingToolbar.y}px`,
            left: `${floatingToolbar.x}px`,
          }}
          onMouseDown={e => e.preventDefault()}
          onPointerDown={e => {
            e.preventDefault();
            isInteractingWithToolbarRef.current = true;
          }}
          onPointerUp={() => {
            setTimeout(() => {
              isInteractingWithToolbarRef.current = false;
            }, 250);
          }}
          onTouchEnd={() => {
            setTimeout(() => {
              isInteractingWithToolbarRef.current = false;
            }, 250);
          }}
        >
          {/* Row 0: Block Typography */}
          <div className={styles.toolbarTypeRow}>
            <button
              type="button"
              className={styles.typeBtn}
              onPointerDown={e => e.preventDefault()}
              onClick={() => applyHeading('p')}
              title="Texto normal"
            >
              Texto
            </button>
            <button
              type="button"
              className={styles.typeBtn}
              onPointerDown={e => e.preventDefault()}
              onClick={() => applyHeading('h1')}
              title="Título grande"
            >
              H1
            </button>
            <button
              type="button"
              className={styles.typeBtn}
              onPointerDown={e => e.preventDefault()}
              onClick={() => applyHeading('h2')}
              title="Título mediano"
            >
              H2
            </button>
            <button
              type="button"
              className={styles.typeBtn}
              onPointerDown={e => e.preventDefault()}
              onClick={() => applyHeading('h3')}
              title="Subtítulo"
            >
              H3
            </button>
          </div>

          {/* Row 1: Mode toggle + Color swatches */}
          <div className={styles.toolbarTopRow}>
            <div className={styles.modeToggleGroup}>
              <button
                type="button"
                className={`${styles.modeToggleBtn} ${highlightMode === 'fill' ? styles.modeToggleBtnActive : ''}`}
                onPointerDown={e => e.preventDefault()}
                onClick={() => setHighlightMode('fill')}
                title="Resaltado con fondo"
              >
                <span className={styles.fillIconBadge} style={{ background: '#facc15' }}>
                  A
                </span>
              </button>
              <button
                type="button"
                className={`${styles.modeToggleBtn} ${highlightMode === 'underline' ? styles.modeToggleBtnActive : ''}`}
                onPointerDown={e => e.preventDefault()}
                onClick={() => setHighlightMode('underline')}
                title="Subrayado de color"
              >
                <span className={styles.underlineIconBadge}>
                  <span>U</span>
                  <span className={styles.underlineBar} style={{ background: '#facc15' }} />
                </span>
              </button>
            </div>

            <div className={styles.toolbarRowDivider} />

            <div className={styles.colorSwatches}>
              {highlights.map(h => (
                <button
                  key={h.color}
                  type="button"
                  className={styles.colorCircle}
                  style={{ background: h.color }}
                  title={`Resaltar ${h.name}`}
                  onPointerDown={e => e.preventDefault()}
                  onClick={() => applyHighlight(h.color, highlightMode)}
                />
              ))}
            </div>
          </div>

          {/* Row 2: Action Buttons */}
          <div className={styles.toolbarActionsRow}>
            <button
              type="button"
              className={styles.actionItem}
              onPointerDown={e => e.preventDefault()}
              onClick={() => execFormat('bold')}
              title="Negrita"
            >
              <Icon name="format_bold" />
              <span className={styles.actionLabel}>Negrita</span>
            </button>
            <button
              type="button"
              className={styles.actionItem}
              onPointerDown={e => e.preventDefault()}
              onClick={() => execFormat('italic')}
              title="Cursiva"
            >
              <Icon name="format_italic" />
              <span className={styles.actionLabel}>Cursiva</span>
            </button>
            <button
              type="button"
              className={styles.actionItem}
              onPointerDown={e => e.preventDefault()}
              onClick={() => {
                const sel = window.getSelection();
                const text = sel ? sel.toString().trim() : '';
                setLinkModalData({ isOpen: true, title: text, url: '', range: savedSelectionRange.current });
              }}
              title="Insertar enlace"
            >
              <Icon name="link" />
              <span className={styles.actionLabel}>Enlace</span>
            </button>
            <button
              type="button"
              className={styles.actionItem}
              onPointerDown={e => e.preventDefault()}
              onClick={() => {
                const sel = window.getSelection();
                if (sel && sel.toString()) {
                  navigator.clipboard.writeText(sel.toString());
                  showToast('Copiado al portapapeles');
                }
              }}
              title="Copiar texto"
            >
              <Icon name="content_copy" />
              <span className={styles.actionLabel}>Copiar</span>
            </button>
            <button
              type="button"
              className={styles.actionItem}
              onPointerDown={e => e.preventDefault()}
              onClick={removeFormat}
              title="Quitar formato"
            >
              <Icon name="format_clear" />
              <span className={styles.actionLabel}>Quitar</span>
            </button>
          </div>
        </div>
      )}

      {/* Styled Link Modal */}
      {linkModalData?.isOpen && (
        <div className={styles.modalBackdrop} onClick={() => setLinkModalData(null)}>
          <div className={styles.modalCard} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className={styles.modalHeader}>
              <div className={styles.modalTitleGroup}>
                <div className={styles.modalIconBadge}>
                  <Icon name="link" />
                </div>
                <div>
                  <h3 className={styles.modalTitle}>Insertar enlace</h3>
                  <p className={styles.modalSubtitle}>Agrega un hipervínculo con texto y dirección URL</p>
                </div>
              </div>
              <button type="button" className={styles.modalCloseBtn} onClick={() => setLinkModalData(null)}>
                <Icon name="close" />
              </button>
            </div>

            <form
              onSubmit={e => {
                e.preventDefault();
                restoreActiveSelection();
                const text = linkModalData.title.trim() || linkModalData.url.trim();
                const url = linkModalData.url.trim();
                if (!url) return;
                const finalUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`;
                const anchor = document.createElement('a');
                anchor.href = finalUrl;
                anchor.target = '_blank';
                anchor.rel = 'noopener noreferrer';
                anchor.textContent = text;
                document.execCommand('insertHTML', false, anchor.outerHTML);
                const activeEditor = editingNote ? modalEditorRef.current : creatorEditorRef.current;
                if (activeEditor) {
                  if (editingNote) setEditHtml(cleanHtml(activeEditor.innerHTML));
                  else setCreatorHtml(cleanHtml(activeEditor.innerHTML));
                }
                setLinkModalData(null);
              }}
            >
              <div className={styles.modalBody}>
                <div className={styles.modalField}>
                  <label className={styles.modalLabel}>Texto para mostrar</label>
                  <input
                    type="text"
                    className={styles.modalInput}
                    placeholder="Ej. Guía del voluntario"
                    value={linkModalData.title}
                    onChange={e => setLinkModalData({ ...linkModalData, title: e.target.value })}
                  />
                </div>
                <div className={styles.modalField}>
                  <label className={styles.modalLabel}>Dirección web (URL)</label>
                  <input
                    type="text"
                    className={styles.modalInput}
                    placeholder="https://ejemplo.com"
                    value={linkModalData.url}
                    onChange={e => setLinkModalData({ ...linkModalData, url: e.target.value })}
                    autoFocus
                  />
                </div>
              </div>
              <div className={styles.modalFooter}>
                <button type="button" className={styles.modalCancelBtn} onClick={() => setLinkModalData(null)}>
                  Cancelar
                </button>
                <button type="submit" className={styles.modalSubmitBtn} disabled={!linkModalData.url.trim()}>
                  <Icon name="check" /> Insertar enlace
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Note Card Component
// ---------------------------------------------------------------------------
function NoteCard({
  note,
  onOpen,
  onTogglePin,
  onDelete,
  onToggleCheckbox,
  cardPaletteNoteId,
  setCardPaletteNoteId,
  onSetColor,
  cardShiftNoteId,
  setCardShiftNoteId,
  days,
  onSetShift,
  isExpanded = false,
  onToggleExpand,
  stackIndex = 0,
  isMobile = false,
}: {
  note: KeepNote;
  onOpen: () => void;
  onTogglePin: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
  onToggleCheckbox: (index: number, e: React.MouseEvent) => void;
  cardPaletteNoteId: string | null;
  setCardPaletteNoteId: (id: string | null) => void;
  onSetColor: (color: NoteColor, pattern?: NotePattern) => void;
  cardShiftNoteId: string | null;
  setCardShiftNoteId: (id: string | null) => void;
  days: string[];
  onSetShift: (shiftDay: string | null) => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  stackIndex?: number;
  isMobile?: boolean;
}) {
  const isPaletteOpen = cardPaletteNoteId === note.id;
  const isShiftOpen = cardShiftNoteId === note.id;
  const cardRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(
    () => typeof IntersectionObserver === 'undefined'
  );

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.08, rootMargin: '0px 0px -20px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={cardRef}
      className={`${styles.noteCard} ${styles[`theme_${note.color || 'default'}`]} ${styles[`pattern_${note.pattern || 'none'}`]} ${isExpanded ? styles.noteCardExpanded : styles.noteCardCollapsed} ${isVisible ? styles.noteCardVisible : ''}`}
      style={isMobile ? { zIndex: isExpanded ? 100 : stackIndex + 1 } : undefined}
      onClick={e => {
        if (isMobile) {
          if (!isExpanded) {
            onToggleExpand?.();
          }
        } else {
          onOpen();
        }
      }}
      role="button"
      tabIndex={0}
      onKeyDown={e => {
        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          if (isMobile) {
            onToggleExpand?.();
          } else {
            onOpen();
          }
        }
      }}
    >
      {/* Folder Tab ("Pestaña sobresaliente a la derecha") */}
      {note.shiftDay && (
        <div className={styles.folderTabWrap}>
          <div className={styles.folderTab} title={`Turno del ${formatChipDate(note.shiftDay)}`}>
            <Icon name="calendar_month" />
            <span className={styles.folderTabDate}>{formatChipDate(note.shiftDay)}</span>
          </div>
        </div>
      )}

      {/* Header with Title, Pin, and Mobile Stack Chevron */}
      <div
        className={styles.noteCardHeader}
        onClick={e => {
          if (isMobile && isExpanded) {
            e.stopPropagation();
            onToggleExpand?.();
          }
        }}
      >
        <div className={styles.noteTitleArea}>
          {note.title ? (
            <h3 className={styles.noteCardTitle}>{note.title}</h3>
          ) : note.text?.trim() ? (
            <h3 className={`${styles.noteCardTitle} ${styles.noteCardTitleSnippet}`}>{note.text.trim().slice(0, 50)}</h3>
          ) : (
            <span className="text-xs opacity-50 italic">Sin título</span>
          )}
        </div>

        <div className={styles.noteHeaderControls}>
          <button
            type="button"
            className={`${styles.notePinBtnFloating} ${note.isPinned ? styles.notePinBtnFloatingActive : ''}`}
            title={note.isPinned ? 'Desfijar nota' : 'Fijar nota'}
            onClick={e => {
              e.stopPropagation();
              onTogglePin(e);
            }}
          >
            <Icon name={note.isPinned ? 'keep' : 'keep_public'} />
          </button>
          {isMobile && (
            <button
              type="button"
              className={styles.mobileStackChevron}
              title={isExpanded ? 'Contraer' : 'Expandir'}
              onClick={e => {
                e.stopPropagation();
                onToggleExpand?.();
              }}
            >
              <Icon name={isExpanded ? 'expand_less' : 'expand_more'} />
            </button>
          )}
        </div>
      </div>

      {/* Body preview with interactive checklist clicks */}
      {note.html && (
        <div
          data-note-id={note.id}
          className={styles.noteCardBody}
          dangerouslySetInnerHTML={{ __html: note.html }}
          onClick={e => {
            const target = e.target as HTMLElement;
            if (target && target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'checkbox') {
              e.stopPropagation();
              const container = target.closest(`.${styles.noteCardBody}`);
              if (container) {
                const allCb = Array.from(container.querySelectorAll('input[type="checkbox"]'));
                const index = allCb.indexOf(target as HTMLInputElement);
                if (index >= 0) {
                  onToggleCheckbox(index, e);
                }
              }
            } else if (isMobile) {
              const sel = window.getSelection();
              const body = e.currentTarget as HTMLElement;
              const selectionIsInBody = Boolean(
                sel &&
                sel.toString().trim().length > 0 &&
                sel.anchorNode &&
                body.contains(sel.anchorNode)
              );
              if (selectionIsInBody) {
                // Keep a long-press selection from triggering the card action.
                e.stopPropagation();
                return;
              }
            }
          }}
        />
      )}

      {/* Footer: Badges and Action Buttons */}
      <div className={styles.noteCardFooter}>
        <div className={styles.noteCardBadges}>
          {note.shiftDay && (
            <span className={styles.noteShiftChip} title={`Asociado al turno del ${formatChipDate(note.shiftDay)}`}>
              <Icon name="calendar_month" />
              {formatChipDate(note.shiftDay)}
            </span>
          )}
          {note.tags?.map(t => (
            <span key={t} className={styles.noteTagChip}>
              #{t}
            </span>
          ))}
        </div>

        {/* Action Buttons (visible on hover / touch) */}
        <div className={styles.noteCardActions} onClick={e => e.stopPropagation()}>
          {/* Quick Palette */}
          <div className="relative">
            <button
              type="button"
              className={styles.noteActionBtn}
              title="Cambiar color de nota"
              onClick={e => {
                e.stopPropagation();
                setCardPaletteNoteId(isPaletteOpen ? null : note.id);
                setCardShiftNoteId(null);
              }}
            >
              <Icon name="palette" />
            </button>
            {isPaletteOpen && (
              <div className={styles.palettePopover}>
                <div className={styles.paletteSectionTitle}>Color</div>
                <div className={styles.paletteColorsGrid}>
                  {NOTE_COLORS.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      title={c.label}
                      className={`${styles.colorSwatchBtn} ${note.color === c.id ? styles.colorSwatchBtnActive : ''}`}
                      style={{ '--swatch-light': c.lightBg, '--swatch-dark': c.darkBg, background: c.lightBg } as React.CSSProperties}
                      onClick={() => onSetColor(c.id)}
                    >
                      {note.color === c.id && <Icon name="check" />}
                    </button>
                  ))}
                </div>
                <div className={styles.paletteSectionTitle}>Diseño</div>
                <div className={styles.palettePatternsGrid}>
                  {NOTE_PATTERNS.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      title={p.label}
                      className={`${styles.patternSwatchBtn} ${note.pattern === p.id ? styles.patternSwatchBtnActive : ''}`}
                      onClick={() => onSetColor(note.color || 'default', p.id)}
                    >
                      <Icon name={p.icon} />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Quick Shift Link */}
          {days.length > 0 && (
            <div className="relative">
              <button
                type="button"
                className={styles.noteActionBtn}
                title="Cambiar turno asociado"
                onClick={e => {
                  e.stopPropagation();
                  setCardShiftNoteId(isShiftOpen ? null : note.id);
                  setCardPaletteNoteId(null);
                }}
              >
                <Icon name="calendar_month" />
              </button>
              {isShiftOpen && (
                <div className={styles.shiftPopover}>
                  <button
                    type="button"
                    className={`${styles.shiftOptionItem} ${note.shiftDay === null ? styles.shiftOptionItemActive : ''}`}
                    onClick={() => onSetShift(null)}
                  >
                    <span>Sin turno</span>
                    {note.shiftDay === null && <Icon name="check" />}
                  </button>
                  {days.map(d => (
                    <button
                      key={d}
                      type="button"
                      className={`${styles.shiftOptionItem} ${note.shiftDay === d ? styles.shiftOptionItemActive : ''}`}
                      onClick={() => onSetShift(d)}
                    >
                      <span>{formatChipDate(d)}</span>
                      {note.shiftDay === d && <Icon name="check" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Mobile Full Edit Button */}
          {isMobile && (
            <button
              type="button"
              className={styles.noteMobileEditBtn}
              title="Abrir editor completo"
              onClick={e => {
                e.stopPropagation();
                onOpen();
              }}
            >
              <Icon name="open_in_full" />
              <span>Editar</span>
            </button>
          )}

          {/* Delete Button */}
          <button
            type="button"
            className={`${styles.noteActionBtn} ${styles.noteActionBtnDanger}`}
            title="Eliminar nota"
            onClick={onDelete}
          >
            <Icon name="delete" />
          </button>
        </div>
      </div>
    </div>
  );
}
