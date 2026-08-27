'use client'

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface VolunteerTutorialsProps {
  onClose: () => void;
  onStartRequest: () => void;
}

const TUTORIALS = [
  {
    id: "whatsapp",
    title: "Cómo usar el bot de WhatsApp",
    shortTitle: "Bot de WhatsApp",
    description: "Aprende a iniciar la conversación, identificar tu perfil y abrir las opciones del bot.",
    duration: "00:20",
    icon: "chat",
    accent: "green" as const,
    src: "/tutorials/whatsapp-bot.mp4",
    poster: "/tutorials/whatsapp-bot.png",
    captions: "/tutorials/whatsapp-bot.vtt",
  },
  {
    id: "request",
    title: "Cómo solicitar un cambio de turno",
    shortTitle: "Cambio de turno",
    description: "Mira cómo enviar una solicitud desde el portal o desde el bot y qué sucede después.",
    duration: "00:24",
    icon: "published_with_changes",
    accent: "blue" as const,
    src: "/tutorials/shift-request.mp4",
    poster: "/tutorials/shift-request.png",
    captions: "/tutorials/shift-request.vtt",
  },
];

export function VolunteerTutorials({ onClose, onStartRequest }: VolunteerTutorialsProps) {
  const [activeId, setActiveId] = useState(TUTORIALS[0].id);
  const activeTutorial = TUTORIALS.find(tutorial => tutorial.id === activeId) || TUTORIALS[0];

  return (
    <section
      aria-labelledby="volunteer-tutorials-title"
      className="animate-in fade-in slide-in-from-top-1 overflow-hidden border-y border-border bg-dark2/60 duration-200 motion-reduce:animate-none sm:rounded-xl sm:border"
    >
      <div className="flex items-start justify-between gap-4 px-4 py-5 sm:px-5">
        <div>
          <h2 id="volunteer-tutorials-title" className="text-lg font-black tracking-tight text-text">
            Tutoriales en video
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-text-dim">
            Reprodúcelos aquí mismo desde tu celular o computadora. Las instrucciones aparecen dentro de cada video.
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

      <div className="border-t border-border lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
        <div
          role="tablist"
          aria-label="Seleccionar tutorial en video"
          className="grid grid-cols-2 gap-2 border-b border-border p-3 lg:block lg:space-y-1 lg:border-b-0 lg:border-r lg:p-3"
        >
          {TUTORIALS.map(tutorial => {
            const isActive = tutorial.id === activeTutorial.id;
            const isWhatsApp = tutorial.accent === "green";

            return (
              <button
                key={tutorial.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls="tutorial-video-panel"
                onClick={() => setActiveId(tutorial.id)}
                className={`min-h-[72px] rounded-lg px-3 py-2.5 text-left transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4d7cfe] lg:flex lg:w-full lg:items-center lg:gap-3 ${
                  isActive
                    ? "bg-dark3 text-text ring-1 ring-inset ring-border"
                    : "text-text-dim hover:bg-dark3/60 hover:text-text"
                }`}
              >
                <span
                  className={`mb-2 flex h-9 w-9 items-center justify-center rounded-lg ring-1 ring-inset lg:mb-0 lg:shrink-0 ${
                    isWhatsApp
                      ? "bg-emerald-500/12 text-emerald-500 ring-emerald-500/25"
                      : "bg-[#4d7cfe]/12 text-[#4d7cfe] ring-[#4d7cfe]/25"
                  }`}
                >
                  <span className="material-symbols-outlined text-[20px]">{tutorial.icon}</span>
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-extrabold leading-4">{tutorial.shortTitle}</span>
                  <span className="mt-1 block font-mono text-[10px] text-text-dim">{tutorial.duration}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div id="tutorial-video-panel" role="tabpanel" className="min-w-0 p-3 sm:p-5">
          <div className="overflow-hidden rounded-xl bg-black ring-1 ring-inset ring-white/10">
            <video
              key={activeTutorial.id}
              controls
              playsInline
              preload="metadata"
              poster={activeTutorial.poster}
              aria-label={activeTutorial.title}
              className="aspect-video w-full bg-black object-contain"
            >
              <source src={activeTutorial.src} type="video/mp4" />
              <track
                src={activeTutorial.captions}
                kind="captions"
                srcLang="es"
                label="Español"
              />
              Tu navegador no admite la reproducción de video.
            </video>
          </div>

          <div className="flex flex-col gap-4 pt-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-xl">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-extrabold text-text">{activeTutorial.title}</h3>
                <span className="shrink-0 rounded-full border border-border px-2 py-0.5 font-mono text-[10px] text-text-dim">
                  {activeTutorial.duration}
                </span>
              </div>
              <p className="mt-1 text-xs leading-5 text-text-dim">{activeTutorial.description}</p>
              <p className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-text-dim">
                <span className="material-symbols-outlined text-[16px]">subtitles</span>
                Video sin audio, con instrucciones visibles y subtítulos disponibles.
              </p>
            </div>

            {activeTutorial.id === "request" && (
              <Button
                type="button"
                onClick={onStartRequest}
                className="h-11 w-full shrink-0 rounded-full bg-[#4d7cfe] px-5 text-xs font-extrabold text-white hover:bg-[#3b66e0] sm:w-auto"
              >
                <span className="material-symbols-outlined mr-2 text-[18px]">add_task</span>
                Crear solicitud ahora
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
