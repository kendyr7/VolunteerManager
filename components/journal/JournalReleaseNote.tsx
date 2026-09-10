'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'vm_journal_calendar_release_seen_v1';

function markAsSeen() {
  try {
    localStorage.setItem(STORAGE_KEY, 'true');
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}

export function JournalReleaseNote() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        setIsVisible(localStorage.getItem(STORAGE_KEY) !== 'true');
      } catch {
        setIsVisible(true);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  if (!isVisible) return null;

  const dismiss = () => {
    markAsSeen();
    setIsVisible(false);
  };

  return (
    <aside
      className="relative overflow-hidden rounded-2xl border border-border border-l-4 border-l-primary bg-dark2 shadow-sm motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2 motion-safe:duration-300"
      aria-labelledby="journal-release-title"
    >
      <div className="flex items-start gap-3.5 p-4 sm:p-5">
        <div className="min-w-0 flex-1 pr-7">
          <p className="mb-1 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-primary">
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">book_2</span>
            Nueva función
          </p>
          <h2 id="journal-release-title" className="text-base font-black leading-tight text-text sm:text-lg">
            Registra lo que viviste en cada turno
          </h2>
          <p className="mt-1.5 max-w-2xl text-xs font-medium leading-5 text-text-dim sm:text-sm">
            Mi Diario es un espacio privado para escribir tus impresiones, guardar aprendizajes y volver a ellos cuando quieras.
          </p>

          <ul className="mt-3 grid gap-2 text-[11px] font-bold text-text-dim sm:grid-cols-3 sm:gap-3 sm:text-xs">
            <li className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-primary" aria-hidden="true">edit_note</span>
              Texto con formato
            </li>
            <li className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-primary" aria-hidden="true">event</span>
              Notas vinculadas a tus turnos
            </li>
            <li className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-primary" aria-hidden="true">cloud_done</span>
              Guardado automático
            </li>
          </ul>
        </div>

        <button
          type="button"
          onClick={dismiss}
          className="absolute right-3 top-3 inline-flex size-8 items-center justify-center rounded-lg text-text-dim transition-colors hover:bg-dark3 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label="Cerrar aviso de Mi Diario"
          title="Cerrar"
        >
          <span className="material-symbols-outlined text-[19px]" aria-hidden="true">close</span>
        </button>
      </div>

      <div className="flex flex-col gap-2 border-t border-border bg-dark3/35 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <p className="text-[11px] font-semibold text-text-dim">Disponible desde la sección Mi Diario.</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={dismiss}
            className="min-h-9 rounded-lg px-3 text-[11px] font-extrabold text-text-dim transition-colors hover:bg-dark3 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Ahora no
          </button>
          <Link
            href="/journal"
            onClick={dismiss}
            className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-primary px-3.5 text-[11px] font-black text-white shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-dark2"
          >
            Abrir Mi Diario
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">arrow_forward</span>
          </Link>
        </div>
      </div>
    </aside>
  );
}
