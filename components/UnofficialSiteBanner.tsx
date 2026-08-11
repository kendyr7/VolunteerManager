'use client';

import { useState } from 'react';

export function UnofficialSiteBanner({ initialAcknowledged = false }: { initialAcknowledged?: boolean }) {
  const [acknowledged, setAcknowledged] = useState(initialAcknowledged);

  if (acknowledged) return null;

  const handleAcknowledge = () => {
    document.cookie = `unofficial_site_ack=1; Max-Age=${60 * 60 * 24 * 365}; Path=/; SameSite=Lax`;
    setAcknowledged(true);
  };

  return (
    <aside
      role="note"
      aria-label="Aviso de sitio no oficial"
      className="relative z-50 flex shrink-0 items-center justify-between gap-2 border-b border-amber-400/40 bg-amber-300 px-3 py-1.5 text-left text-[10px] font-bold leading-3.5 text-amber-950 sm:min-h-10 sm:justify-center sm:gap-3 sm:px-4 sm:py-2 sm:text-center sm:text-xs sm:leading-4"
    >
      <span className="material-symbols-outlined hidden shrink-0 text-[18px] sm:inline-block" aria-hidden="true">
        warning
      </span>
      <span className="min-w-0 flex-1 sm:flex-none">
        Este no es un sitio web oficial de La Iglesia de Jesucristo de los Santos de los Últimos Días.
      </span>
      <button
        type="button"
        onClick={handleAcknowledge}
        className="h-7 shrink-0 rounded-full border border-amber-950/20 bg-amber-950 px-2.5 text-[10px] font-extrabold text-amber-50 transition-colors hover:bg-amber-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-950/40 active:scale-[0.97] sm:px-3 sm:text-[11px]"
      >
        Entendido
      </button>
    </aside>
  );
}
