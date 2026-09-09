import Link from 'next/link';
import { ArrowLeft, MapPinOff } from 'lucide-react';

export default function NotFound() {
  return (
    <main className="flex min-h-[100svh] flex-1 flex-col bg-dark px-6 py-8 text-text sm:px-10">
      <Link
        href="/"
        className="w-fit rounded-sm text-sm font-bold text-text focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
      >
        Volunteer Manager
      </Link>

      <section aria-labelledby="not-found-title" className="mx-auto flex w-full max-w-lg flex-1 flex-col items-start justify-center py-16">
        <div className="mb-6 flex items-center gap-2 text-sm font-semibold text-blue-800 dark:text-blue-300">
          <MapPinOff size={20} aria-hidden="true" />
          Página no encontrada
        </div>
        <p aria-hidden="true" className="mb-6 text-8xl font-extrabold leading-none tracking-tight text-text">
          404
        </p>
        <h1 id="not-found-title" className="text-2xl font-bold text-text">
          Este enlace no lleva a ninguna página
        </h1>
        <p className="mt-4 max-w-md text-base leading-relaxed text-slate-600 dark:text-slate-300">
          La dirección puede estar incompleta o la página pudo haber cambiado.
          Vuelve al inicio para continuar con tus turnos y solicitudes.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-blue-700 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary motion-reduce:transition-none"
        >
          <ArrowLeft size={18} aria-hidden="true" />
          Volver al inicio
        </Link>
      </section>

      <p className="text-xs text-slate-600 dark:text-slate-400">Gestión de voluntarios · Templo de Managua</p>
    </main>
  );
}
