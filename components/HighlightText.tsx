import React, { useMemo } from 'react';

interface HighlightTextProps {
  text: string;
  terms?: string[];
  term?: string;
  className?: string;
}

export const HighlightText = React.memo(function HighlightText({
  text,
  terms,
  term,
  className,
}: HighlightTextProps) {
  const activeTerms = useMemo(() => {
    if (terms && terms.length > 0) return terms.filter(t => t.trim().length > 0);
    if (term && term.trim().length > 0) return [term.trim()];
    return [];
  }, [terms, term]);

  const regex = useMemo(() => {
    if (activeTerms.length === 0) return null;
    const escaped = activeTerms
      .map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|');
    return new RegExp(`(${escaped})`, 'gi');
  }, [activeTerms]);

  const parts = useMemo(() => {
    if (!text || !regex) return [text || ''];
    return text.split(regex);
  }, [text, regex]);

  if (!text) return null;
  if (activeTerms.length === 0 || !regex) return <span className={className}>{text}</span>;

  return (
    <span className={className}>
      {parts.map((part, i) =>
        activeTerms.some(t => t.toLowerCase() === part.toLowerCase()) ? (
          <span
            key={i}
            style={{
              backgroundColor: '#fde047',
              color: '#111827',
              borderRadius: '6px',
              padding: '0 4px',
              display: 'inline',
              WebkitBoxDecorationBreak: 'clone',
              boxDecorationBreak: 'clone',
            }}
          >
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  );
});
