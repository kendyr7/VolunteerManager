'use client';

import { Button } from '@/components/ui/button';

interface SharedPhoneWarningProps {
  phone: string;
  names: string[];
  isConfirming?: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
}

export function SharedPhoneWarning({
  phone,
  names,
  isConfirming = false,
  onConfirm,
  onDismiss,
}: SharedPhoneWarningProps) {
  return (
    <section
      role="alert"
      aria-live="assertive"
      className="rounded-2xl border border-amber-500/35 bg-amber-500/10 p-4 text-left shadow-[0_12px_32px_rgba(180,83,9,0.08)]"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="material-symbols-outlined mt-0.5 shrink-0 text-[22px] text-amber-600 dark:text-amber-400"
        >
          warning
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-extrabold leading-5 text-text">
            Este número ya está compartido
          </h3>
          <p className="mt-1 text-xs leading-5 text-text-dim">
            El teléfono <strong className="font-mono font-bold text-text">{phone}</strong> también está asociado con:
          </p>
          <ul className="mt-2 space-y-1" aria-label="Voluntarios que comparten este teléfono">
            {names.map((name, index) => (
              <li key={`${name}-${index}`} className="flex items-center gap-2 text-xs font-bold text-amber-700 dark:text-amber-300">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                <span className="break-words">{name}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] leading-4 text-text-dim">
            Puedes asignarlo también. Ten en cuenta que el acceso y los mensajes de WhatsApp llegarán al mismo teléfono.
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Button
          type="button"
          variant="outline"
          onClick={onDismiss}
          disabled={isConfirming}
          className="h-10 rounded-xl border-border bg-dark3 text-xs font-bold text-text"
        >
          Cambiar número
        </Button>
        <Button
          type="button"
          onClick={onConfirm}
          disabled={isConfirming}
          className="h-10 rounded-xl bg-amber-600 text-xs font-bold text-white hover:bg-amber-700 active:scale-[0.98]"
        >
          {isConfirming ? 'Confirmando…' : 'Confirmar y usarlo'}
        </Button>
      </div>
    </section>
  );
}
