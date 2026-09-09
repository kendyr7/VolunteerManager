'use client';

import { useEffect, useRef } from 'react';
import styles from './journal.module.css';

export function DeleteNoteDialog({ title, onCancel, onConfirm }: {
  title: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement;
    element?.showModal();
    cancel.current?.focus();
    return () => {
      element?.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  return (
    <dialog ref={dialog} className={styles.deleteDialog} aria-labelledby="delete-note-title"
      aria-describedby="delete-note-description" role="alertdialog"
      onCancel={event => { event.preventDefault(); event.stopPropagation(); onCancel(); }}
      onKeyDown={event => { if (event.key === 'Escape') event.stopPropagation(); }}
      onClick={event => { if (event.target === event.currentTarget) onCancel(); }}>
      <div className={styles.deleteDialogContent}>
        <span className={`material-symbols-outlined ${styles.deleteDialogIcon}`} aria-hidden="true">delete</span>
        <h2 id="delete-note-title">¿Eliminar esta nota?</h2>
        <p id="delete-note-description">Se eliminará «{title.trim() || 'Nota sin título'}» de tu diario. Esta acción no se puede deshacer.</p>
        <div className={styles.deleteDialogActions}>
          <button ref={cancel} type="button" onClick={onCancel}>Cancelar</button>
          <button type="button" className={styles.deleteConfirmButton} onClick={onConfirm}>Eliminar nota</button>
        </div>
      </div>
    </dialog>
  );
}
