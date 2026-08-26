import { Button } from "@/components/ui/button";

interface VolunteerTutorialsProps {
  onClose: () => void;
  onStartRequest: () => void;
}

interface TutorialStep {
  title: string;
  description: string;
}

const WHATSAPP_STEPS: TutorialStep[] = [
  {
    title: "Abre el chat del bot",
    description: "Usa el mismo número de WhatsApp registrado en tu perfil y abre la conversación donde recibes los avisos del evento.",
  },
  {
    title: "Escribe “Hola”",
    description: "El bot identificará tu perfil. Si el número está asociado a más de una persona, selecciona tu nombre antes de continuar.",
  },
  {
    title: "Toca “Mostrar menú”",
    description: "Verás opciones para confirmar asistencia, consultar turnos y áreas, recuperar tu PIN, generar tu QR o solicitar un cambio.",
  },
  {
    title: "Elige una opción y sigue las indicaciones",
    description: "Responde usando los botones del chat. Si la conversación venció, envía un mensaje nuevo para volver a empezar.",
  },
];

const PORTAL_REQUEST_STEPS: TutorialStep[] = [
  {
    title: "Pulsa “Reagendar turno”",
    description: "El botón está en la parte superior de esta página.",
  },
  {
    title: "Selecciona tu turno actual",
    description: "Elige la fecha y el turno asignado que necesitas cambiar.",
  },
  {
    title: "Selecciona el nuevo turno",
    description: "Elige otra fecha y horario. Los turnos completos, ya asignados o finalizados no se pueden seleccionar.",
  },
  {
    title: "Indica el motivo y envía",
    description: "La solicitud quedará en revisión hasta que un coordinador la apruebe o rechace.",
  },
];

const WHATSAPP_REQUEST_STEPS: TutorialStep[] = [
  {
    title: "Abre el menú del bot",
    description: "Escribe “Hola”, toca “Mostrar menú” y selecciona “Solicitar un cambio”. También puedes responder con el número 4.",
  },
  {
    title: "Elige el turno que quieres cambiar",
    description: "El bot mostrará únicamente tus turnos activos que todavía pueden modificarse.",
  },
  {
    title: "Elige la nueva fecha y horario",
    description: "El bot descartará horarios completos, finalizados o que ya tengas asignados.",
  },
  {
    title: "Selecciona el motivo y confirma",
    description: "Recibirás una confirmación en el chat. Tu horario no cambia hasta que un coordinador apruebe la solicitud.",
  },
];

function StepList({ steps }: { steps: TutorialStep[] }) {
  return (
    <ol className="space-y-4">
      {steps.map((step, index) => (
        <li key={step.title} className="grid grid-cols-[28px_1fr] gap-3">
          <span
            aria-hidden="true"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-[#4d7cfe]/12 text-[11px] font-black text-[#4d7cfe] ring-1 ring-inset ring-[#4d7cfe]/25"
          >
            {index + 1}
          </span>
          <div className="min-w-0 pt-0.5">
            <p className="text-sm font-bold leading-5 text-text">{step.title}</p>
            <p className="mt-0.5 text-xs leading-5 text-text-dim">{step.description}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function VolunteerTutorials({ onClose, onStartRequest }: VolunteerTutorialsProps) {
  return (
    <section
      aria-labelledby="volunteer-tutorials-title"
      className="animate-in fade-in slide-in-from-top-1 border-y border-border bg-dark2/60 py-5 duration-200 motion-reduce:animate-none sm:rounded-xl sm:border sm:p-5"
    >
      <div className="flex items-start justify-between gap-4 px-1 sm:px-0">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#4d7cfe]">Ayuda rápida</p>
          <h2 id="volunteer-tutorials-title" className="mt-1 text-lg font-black tracking-tight text-text">
            Aprende desde esta página
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-text-dim">
            Abre cada tutorial y sigue los pasos desde tu celular o computadora. No necesitas salir del portal.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar tutoriales"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text-dim transition-colors duration-200 hover:bg-dark3 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4d7cfe]"
        >
          <span className="material-symbols-outlined text-[20px]">close</span>
        </button>
      </div>

      <div className="mt-5 divide-y divide-border overflow-hidden rounded-xl border border-border bg-dark2">
        <details className="group">
          <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 px-4 py-3 text-left transition-colors duration-200 hover:bg-dark3/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#4d7cfe] [&::-webkit-details-marker]:hidden">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/12 text-emerald-500 ring-1 ring-inset ring-emerald-500/25">
              <span className="material-symbols-outlined text-[21px]">chat</span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-extrabold text-text">Cómo usar el bot de WhatsApp</span>
              <span className="mt-0.5 block text-[11px] text-text-dim">4 pasos · menú, turnos, PIN, QR y más</span>
            </span>
            <span className="material-symbols-outlined text-[20px] text-text-dim transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none">
              expand_more
            </span>
          </summary>
          <div className="border-t border-border bg-dark3/20 px-4 py-5 sm:px-5">
            <div className="mb-5 flex items-center gap-3 border-l-2 border-emerald-500 pl-3">
              <span className="text-xs font-bold text-text-dim">Para comenzar, escribe</span>
              <code className="rounded-md bg-emerald-500/12 px-2.5 py-1 text-xs font-black text-emerald-500 ring-1 ring-inset ring-emerald-500/25">
                Hola
              </code>
            </div>
            <StepList steps={WHATSAPP_STEPS} />
            <div className="mt-5 border-t border-border pt-4">
              <p className="mb-2 text-[10px] font-extrabold uppercase tracking-wider text-text-dim">Opciones principales</p>
              <div className="flex flex-wrap gap-2">
                {[
                  "Confirmar asistencia",
                  "Consultar mis turnos",
                  "Consultar mis áreas",
                  "Solicitar un cambio",
                  "Recuperar PIN",
                ].map(option => (
                  <span key={option} className="rounded-md border border-border bg-dark2 px-2.5 py-1.5 text-[11px] font-semibold text-text-dim">
                    {option}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </details>

        <details className="group">
          <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 px-4 py-3 text-left transition-colors duration-200 hover:bg-dark3/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#4d7cfe] [&::-webkit-details-marker]:hidden">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#4d7cfe]/12 text-[#4d7cfe] ring-1 ring-inset ring-[#4d7cfe]/25">
              <span className="material-symbols-outlined text-[21px]">published_with_changes</span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-extrabold text-text">Cómo solicitar un cambio de turno</span>
              <span className="mt-0.5 block text-[11px] text-text-dim">Desde este portal o desde WhatsApp</span>
            </span>
            <span className="material-symbols-outlined text-[20px] text-text-dim transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none">
              expand_more
            </span>
          </summary>
          <div className="border-t border-border bg-dark3/20">
            <div className="px-4 py-5 sm:px-5">
              <div className="mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-[19px] text-[#4d7cfe]">language</span>
                <h3 className="text-sm font-extrabold text-text">Desde este portal</h3>
              </div>
              <StepList steps={PORTAL_REQUEST_STEPS} />
              <Button
                type="button"
                onClick={onStartRequest}
                className="mt-5 h-11 w-full rounded-full bg-[#4d7cfe] text-xs font-extrabold text-white hover:bg-[#3b66e0] sm:w-auto sm:px-5"
              >
                <span className="material-symbols-outlined mr-2 text-[18px]">add_task</span>
                Crear solicitud ahora
              </Button>
            </div>

            <div className="border-t border-border px-4 py-5 sm:px-5">
              <div className="mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-[19px] text-emerald-500">chat</span>
                <h3 className="text-sm font-extrabold text-text">Desde WhatsApp</h3>
              </div>
              <StepList steps={WHATSAPP_REQUEST_STEPS} />
            </div>

            <div className="border-t border-amber-500/25 bg-amber-500/8 px-4 py-4 sm:px-5">
              <div className="flex gap-3">
                <span className="material-symbols-outlined shrink-0 text-[19px] text-amber-500">info</span>
                <p className="text-xs leading-5 text-text-dim">
                  En ambos casos, enviar la solicitud <strong className="font-bold text-text">no cambia tu turno de inmediato</strong>. Continúa con tu asignación actual hasta recibir la aprobación.
                </p>
              </div>
            </div>
          </div>
        </details>
      </div>
    </section>
  );
}
