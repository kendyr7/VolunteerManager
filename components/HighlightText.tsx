import React, { useMemo } from 'react';
import { normalizeSearch } from '@/lib/utils';

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
    if (term && term.trim().length > 0) {
      return term.split(',').map(value => value.trim()).filter(Boolean);
    }
    return [];
  }, [terms, term]);

  const ranges = useMemo(() => {
    if (!text || activeTerms.length === 0) return [];

    let normalizedText = '';
    const sourceRanges: Array<{ start: number; end: number }> = [];

    for (let sourceIndex = 0; sourceIndex < text.length;) {
      const character = String.fromCodePoint(text.codePointAt(sourceIndex) || 0);
      const normalizedCharacter = normalizeSearch(character);
      for (let index = 0; index < normalizedCharacter.length; index += 1) {
        normalizedText += normalizedCharacter[index];
        sourceRanges.push({ start: sourceIndex, end: sourceIndex + character.length });
      }
      sourceIndex += character.length;
    }

    const matches: Array<{ start: number; end: number }> = [];
    activeTerms.forEach(activeTerm => {
      const normalizedTerm = normalizeSearch(activeTerm);
      if (!normalizedTerm) return;

      let searchFrom = 0;
      while (searchFrom < normalizedText.length) {
        const matchIndex = normalizedText.indexOf(normalizedTerm, searchFrom);
        if (matchIndex === -1) break;
        const firstSource = sourceRanges[matchIndex];
        const lastSource = sourceRanges[matchIndex + normalizedTerm.length - 1];
        if (firstSource && lastSource) {
          matches.push({ start: firstSource.start, end: lastSource.end });
        }
        searchFrom = matchIndex + normalizedTerm.length;
      }
    });

    return matches
      .sort((left, right) => left.start - right.start)
      .reduce<Array<{ start: number; end: number }>>((merged, current) => {
        const previous = merged[merged.length - 1];
        if (previous && current.start <= previous.end) {
          previous.end = Math.max(previous.end, current.end);
        } else {
          merged.push({ ...current });
        }
        return merged;
      }, []);
  }, [activeTerms, text]);

  if (!text) return null;
  if (activeTerms.length === 0 || ranges.length === 0) return <span className={className}>{text}</span>;

  const parts: Array<{ text: string; highlighted: boolean }> = [];
  let cursor = 0;
  ranges.forEach(range => {
    if (range.start > cursor) parts.push({ text: text.slice(cursor, range.start), highlighted: false });
    parts.push({ text: text.slice(range.start, range.end), highlighted: true });
    cursor = range.end;
  });
  if (cursor < text.length) parts.push({ text: text.slice(cursor), highlighted: false });

  return (
    <span className={className}>
      {parts.map((part, i) =>
        part.highlighted ? (
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
            {part.text}
          </span>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </span>
  );
});
