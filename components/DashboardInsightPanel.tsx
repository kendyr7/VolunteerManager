'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type {
  DashboardInsight,
  DashboardInsightHighlight,
  DashboardInsightTone,
} from '@/lib/dashboard-insight-types';

interface DashboardInsightPanelProps {
  insight: DashboardInsight | null;
  isLoading: boolean;
  fallbackMessage: string;
  onRegenerate: () => void;
}

type RevealUnit =
  | { kind: 'text'; value: string }
  | { kind: 'highlight'; value: DashboardInsightHighlight };

const toneClasses: Record<DashboardInsightTone, string> = {
  danger: 'bg-red-faint text-red',
  warning: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  info: 'bg-gold-faint text-[#315ee0] dark:text-[#9ab2ff]',
  success: 'bg-accent-faint text-emerald-700 dark:text-accent',
  neutral: 'bg-dark3 text-text',
};
const EMPTY_HIGHLIGHTS: DashboardInsightHighlight[] = [];

function buildRevealUnits(
  template: string,
  highlights: DashboardInsightHighlight[]
): RevealUnit[] {
  const highlightsByToken = new Map(
    highlights.map(highlight => [`{{${highlight.id}}}`, highlight])
  );
  const units: RevealUnit[] = [];
  const placeholderPattern = /\{\{[a-z0-9_]+\}\}/gi;
  let cursor = 0;

  const pushText = (text: string) => {
    const words = text.match(/\S+\s*|\s+/g) || [];
    words.forEach(value => units.push({ kind: 'text', value }));
  };

  for (const match of template.matchAll(placeholderPattern)) {
    const index = match.index ?? cursor;
    if (index > cursor) pushText(template.slice(cursor, index));
    const highlight = highlightsByToken.get(match[0]);
    if (highlight) units.push({ kind: 'highlight', value: highlight });
    cursor = index + match[0].length;
  }

  if (cursor < template.length) pushText(template.slice(cursor));
  return units;
}

function toAccessibleSummary(template: string, highlights: DashboardInsightHighlight[]) {
  return highlights.reduce(
    (summary, highlight) => summary.replaceAll(`{{${highlight.id}}}`, highlight.label),
    template
  );
}

function TypedSummary({
  template,
  highlights,
  reduceMotion,
}: {
  template: string;
  highlights: DashboardInsightHighlight[];
  reduceMotion: boolean;
}) {
  const revealUnits = useMemo(
    () => buildRevealUnits(template, highlights),
    [template, highlights]
  );
  const accessibleSummary = useMemo(
    () => toAccessibleSummary(template, highlights),
    [template, highlights]
  );
  const [animatedVisibleUnits, setAnimatedVisibleUnits] = useState(0);
  const visibleUnits = reduceMotion ? revealUnits.length : animatedVisibleUnits;

  useEffect(() => {
    if (reduceMotion) return;

    let currentUnit = 0;
    const intervalId = window.setInterval(() => {
      currentUnit += 1;
      setAnimatedVisibleUnits(currentUnit);
      if (currentUnit >= revealUnits.length) window.clearInterval(intervalId);
    }, 38);

    return () => window.clearInterval(intervalId);
  }, [reduceMotion, revealUnits.length]);

  const isTyping = visibleUnits < revealUnits.length;

  return (
    <>
      <p
        aria-hidden="true"
        className="max-w-[72ch] text-pretty text-[15px] font-semibold leading-7 text-text [overflow-wrap:anywhere] sm:text-base"
      >
        {revealUnits.slice(0, visibleUnits).map((unit, index) => {
          if (unit.kind === 'text') return <span key={`text-${index}`}>{unit.value}</span>;

          return (
            <span
              key={`highlight-${unit.value.id}`}
              className={cn(
                'mx-0.5 my-0.5 inline-flex max-w-full items-center gap-1.5 rounded-full px-2 py-0.5 align-middle whitespace-nowrap text-[13px] font-extrabold leading-6 sm:text-sm',
                toneClasses[unit.value.tone]
              )}
            >
              <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                {unit.value.icon}
              </span>
              {unit.value.label}
            </span>
          );
        })}
        {isTyping && (
          <span className="ml-0.5 inline-block h-[1em] w-px animate-pulse bg-gold align-middle motion-reduce:animate-none" />
        )}
      </p>
      <p className="sr-only" aria-live="polite">{accessibleSummary}</p>
    </>
  );
}

export function DashboardInsightPanel({
  insight,
  isLoading,
  fallbackMessage,
  onRegenerate,
}: DashboardInsightPanelProps) {
  const shouldReduceMotion = useReducedMotion();
  const [isExpanded, setIsExpanded] = useState(true);
  const template = insight?.template || fallbackMessage;
  const highlights = insight?.highlights || EMPTY_HIGHLIGHTS;
  const generatedAt = insight?.generatedAt;
  const updatedLabel = useMemo(() => {
    if (!generatedAt) return null;
    const generatedDate = new Date(generatedAt);
    if (Number.isNaN(generatedDate.getTime())) return null;
    return new Intl.DateTimeFormat('es-GT', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(generatedDate);
  }, [generatedAt]);

  return (
    <section
      className="mt-3 w-full border-t border-border/70 pt-3"
      aria-busy={isLoading}
    >
      <div className="flex w-full flex-nowrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-2">
          <button
            type="button"
            onClick={() => setIsExpanded(current => !current)}
            aria-expanded={isExpanded}
            aria-controls="dashboard-intelligent-analysis"
            className="inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-dark3 px-2.5 text-[11px] font-bold text-text transition-colors duration-200 hover:bg-gold-faint hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold sm:gap-2 sm:px-3 sm:text-xs"
          >
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
              auto_awesome
            </span>
            Análisis inteligente
            <span
              className={cn(
                'material-symbols-outlined text-[16px] transition-transform duration-200 motion-reduce:transition-none',
                isExpanded ? 'rotate-180' : 'rotate-0'
              )}
              aria-hidden="true"
            >
              expand_more
            </span>
          </button>

          {updatedLabel && (
            <time
              dateTime={generatedAt}
              title={updatedLabel ? `Actualizado ${updatedLabel}` : undefined}
              className="inline-flex min-w-0 shrink items-center gap-1 overflow-hidden whitespace-nowrap text-[10px] font-medium text-text-dim sm:text-[11px]"
            >
              <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
                schedule
              </span>
              <span>Actualizado</span>
              <span className="hidden truncate sm:inline">{updatedLabel}</span>
            </time>
          )}
        </div>

        <button
          type="button"
          onClick={onRegenerate}
          disabled={isLoading}
          aria-label={isLoading ? 'Generando un nuevo análisis' : 'Volver a generar el análisis'}
          title={isLoading ? 'Generando análisis' : 'Volver a generar'}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-dark3 text-text-dim transition-colors duration-200 hover:bg-gold-faint hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:cursor-wait disabled:opacity-60"
        >
          <span
            className={cn(
              'material-symbols-outlined text-[19px]',
              isLoading && 'animate-spin motion-reduce:animate-none'
            )}
            aria-hidden="true"
          >
            refresh
          </span>
        </button>
      </div>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            id="dashboard-intelligent-analysis"
            key="analysis-content"
            initial={shouldReduceMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="min-h-[4.75rem] max-w-[72ch] pt-3">
              {isLoading && !insight ? (
                <div
                  className="flex items-center gap-2 text-sm font-semibold text-text-dim"
                  role="status"
                  aria-live="polite"
                >
                  <motion.span
                    className="material-symbols-outlined text-[19px] text-gold"
                    aria-hidden="true"
                    animate={shouldReduceMotion ? undefined : { opacity: [0.35, 1, 0.35] }}
                    transition={shouldReduceMotion ? undefined : { duration: 1.1, repeat: Infinity }}
                  >
                    auto_awesome
                  </motion.span>
                  <span>Analizando la información más reciente</span>
                  <span className="inline-block h-4 w-px animate-pulse bg-gold motion-reduce:animate-none" aria-hidden="true" />
                </div>
              ) : (
                <TypedSummary
                  key={insight?.generatedAt || template}
                  template={template}
                  highlights={highlights}
                  reduceMotion={Boolean(shouldReduceMotion)}
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
