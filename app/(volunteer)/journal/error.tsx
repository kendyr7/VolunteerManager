'use client';

export default function JournalError({ reset }: { reset: () => void }) {
  return <div className="p-8 text-text space-y-4">
    <h1 className="text-2xl font-bold">No pudimos cargar tu diario</h1>
    <p>No se pudieron consultar tus días de servicio. Inténtalo de nuevo.</p>
    <button onClick={reset} className="rounded-lg bg-gold px-4 py-3 text-white font-semibold">Volver a intentar</button>
  </div>;
}
