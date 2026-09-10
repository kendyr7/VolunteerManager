'use client';

import { useState, useEffect } from 'react';

interface JournalTourModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const TOUR_STEPS = [
  {
    id: 'welcome',
    badge: 'Nueva función',
    title: 'Mi Diario',
    subtitle: 'Un espacio privado para tus jornadas',
    description:
      'Registra tus impresiones de servicio, organiza tus aprendizajes y conserva los momentos que quieras recordar. Solo tú puedes consultar esta información.',
    icon: 'book_2',
    previewType: 'journal',
  },
  {
    id: 'thoughts',
    badge: 'Escritura',
    title: 'Captura tus impresiones',
    subtitle: 'Escribe con el formato que necesites',
    description:
      'Usa títulos, negrita, cursiva, listas y resaltados para dar estructura a tus reflexiones y encontrar lo más importante de cada jornada.',
    icon: 'history_edu',
    previewType: 'format',
  },
  {
    id: 'shifts',
    badge: 'Organización',
    title: 'Conecta cada nota con tu turno',
    subtitle: 'Encuentra tus recuerdos por fecha',
    description:
      'Asocia una nota a la fecha de tu servicio. La pestaña de cada tarjeta te permite ubicar rápidamente el turno al que pertenece.',
    icon: 'calendar_month',
    previewType: 'folderTab',
  },
  {
    id: 'checklist',
    badge: 'Personalización',
    title: 'Organiza tu libreta',
    subtitle: 'Colores, listas y notas fijadas',
    description:
      'Crea listas de verificación, elige un fondo para cada nota y fija tus entradas importantes. Los cambios se guardan automáticamente.',
    icon: 'checklist_rtl',
    previewType: 'cards',
  },
];

export function JournalTourModal({ isOpen, onClose }: JournalTourModalProps) {
  const [currentStep, setCurrentStep] = useState(0);

  // Handle keyboard navigation (Escape to close, Arrows to step)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowRight') {
        if (currentStep < TOUR_STEPS.length - 1) {
          setCurrentStep(s => s + 1);
        }
      } else if (e.key === 'ArrowLeft') {
        if (currentStep > 0) {
          setCurrentStep(s => s - 1);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentStep, onClose]);

  if (!isOpen) return null;

  const step = TOUR_STEPS[currentStep];
  const isLastStep = currentStep === TOUR_STEPS.length - 1;

  const handleNext = () => {
    if (isLastStep) {
      onClose();
    } else {
      setCurrentStep(s => s + 1);
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(s => s - 1);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[3500] flex items-center justify-center p-3 sm:p-5 bg-black/65 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-modal-title"
    >
      <div
        className="relative w-full max-w-[540px] rounded-2xl border border-border bg-dark2 text-text shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="relative overflow-hidden border-b border-border bg-dark3/45 p-5 pb-4 sm:p-6">
          <div className="flex items-start justify-between gap-3 relative z-10">
            <div className="flex items-center gap-2.5">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-primary">
                  <span className="material-symbols-outlined text-[15px]" aria-hidden="true">{step.icon}</span>
                  {step.badge}
                </span>
                <h2 id="tour-modal-title" className="text-xl sm:text-2xl font-black tracking-tight text-text mt-0.5">
                  {step.title}
                </h2>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-text-dim hover:text-text hover:bg-black/5 dark:hover:bg-white/10 transition-colors shrink-0"
              title="Cerrar"
              aria-label="Cerrar"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>

          <p className="text-xs font-semibold text-text-dim mt-2 relative z-10">
            {step.subtitle}
          </p>

        </div>

        {/* Dynamic Step Content Area */}
        <div className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {/* Main Description */}
          <p className="text-sm leading-relaxed text-text/90">
            {step.description}
          </p>

          {/* Step Visual Preview Card */}
          <div className="rounded-xl border border-border bg-dark3/45 p-4 text-xs">
            {step.previewType === 'journal' && (
              <div className="flex items-center gap-3.5">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
                  <span className="material-symbols-outlined text-[27px]" aria-hidden="true">book_2</span>
                </div>
                <div className="space-y-1">
                  <span className="font-bold text-text block text-xs sm:text-sm">
                    Tu espacio personal
                  </span>
                  <span className="text-text-dim text-[11.5px] leading-snug block">
                    Una libreta para conservar tus impresiones de cada jornada.
                  </span>
                </div>
              </div>
            )}

            {step.previewType === 'format' && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 border-b border-border/70 pb-2">
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-[#fef08a] text-slate-900">
                    A Resaltado
                  </span>
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold underline decoration-primary decoration-2 text-text">
                    U Subrayado
                  </span>
                  <span className="text-[11px] font-extrabold text-text-dim ml-auto">
                    H1 · H2 · H3
                  </span>
                </div>
                <p className="text-[12px] italic leading-normal text-text-dim">
                  «Hoy encontré una forma más clara de acompañar a cada visitante.»
                </p>
              </div>
            )}

            {step.previewType === 'folderTab' && (
                <div className="relative rounded-lg border border-border bg-dark2 p-3 pt-4 shadow-sm">
                <div className="absolute -top-3 right-3 inline-flex items-center gap-1.5 rounded-t-md border border-border border-b-0 bg-dark2 px-2.5 py-0.5 text-[11px] font-bold text-primary shadow-sm">
                  <span className="material-symbols-outlined text-[12px]" aria-hidden="true">calendar_month</span>
                  <span>14 Oct</span>
                </div>
                <span className="font-bold text-text block text-xs">
                  Asistencia en Jardines del Templo
                </span>
                <span className="text-text-dim text-[11px] mt-0.5 block">
                  Nota vinculada a la jornada del sábado por la tarde.
                </span>
              </div>
            )}

            {step.previewType === 'cards' && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px] text-primary" aria-hidden="true">check_box</span>
                  <span className="text-text font-medium line-through opacity-70">Llegar 15 minutos antes con gafete</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px] text-primary" aria-hidden="true">check_box_outline_blank</span>
                  <span className="text-text font-medium">Revisar asignación con el coordinador</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer Navigation & Actions */}
        <div className="flex items-center justify-between gap-3 border-t border-border bg-dark3/35 px-5 py-3.5">
          {/* Progress Indicator Dots */}
          <div className="flex items-center gap-1.5" role="tablist" aria-label="Progreso del tour">
            {TOUR_STEPS.map((s, idx) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setCurrentStep(idx)}
                role="tab"
                aria-selected={idx === currentStep}
                className={`h-1.5 rounded-full transition-all duration-200 ${
                  idx === currentStep
                    ? 'w-6 bg-primary'
                    : 'w-1.5 bg-border hover:bg-text-dim'
                }`}
                title={`Ir al paso ${idx + 1}`}
                aria-label={`Paso ${idx + 1}`}
              />
            ))}
          </div>

          {/* Buttons: Back / Next / Finish */}
          <div className="flex items-center gap-2">
            {currentStep > 0 ? (
              <button
                type="button"
                onClick={handlePrev}
                className="px-3.5 py-1.5 rounded-full text-xs font-bold text-text-dim hover:text-text hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              >
                Anterior
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 rounded-full text-xs font-bold text-text-dim hover:text-text hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              >
                Cerrar
              </button>
            )}

            <button
              type="button"
              onClick={handleNext}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2 text-xs font-extrabold text-white shadow-sm transition-colors hover:bg-primary/90 active:scale-95"
            >
              <span>{isLastStep ? 'Abrir Mi Diario' : 'Siguiente'}</span>
              {!isLastStep && (
                <span className="material-symbols-outlined text-[16px]">chevron_right</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
