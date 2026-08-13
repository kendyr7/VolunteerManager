'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type TableSortDirection = 'asc' | 'desc';

interface SortableTableHeadProps {
  field: string;
  activeField: string | null;
  direction: TableSortDirection;
  onSort: (field: string) => void;
  children: ReactNode;
  className?: string;
  buttonClassName?: string;
}

export function SortableTableHead({
  field,
  activeField,
  direction,
  onSort,
  children,
  className,
  buttonClassName,
}: SortableTableHeadProps) {
  const isActive = activeField === field;

  return (
    <th
      className={className}
      aria-sort={isActive ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={() => onSort(field)}
        className={cn(
          'group inline-flex w-full items-center gap-1.5 text-left transition-colors hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4d7cfe]/50 rounded-sm',
          isActive && 'text-[#4d7cfe]',
          buttonClassName
        )}
      >
        <span>{children}</span>
        <span
          className={cn(
            'material-symbols-outlined text-[14px] transition-opacity',
            isActive ? 'opacity-100' : 'opacity-40 group-hover:opacity-100'
          )}
          aria-hidden="true"
        >
          {isActive ? (direction === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more'}
        </span>
      </button>
    </th>
  );
}
