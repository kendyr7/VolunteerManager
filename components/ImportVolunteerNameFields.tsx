import { useId } from 'react';

interface ImportVolunteerNameFieldsProps {
  firstName: string;
  lastName: string;
  nameNeedsReview?: boolean;
  onChange: (updates: { firstName?: string; lastName?: string; nameNeedsReview?: boolean }) => void;
}

export function ImportVolunteerNameFields({ firstName, lastName, nameNeedsReview, onChange }: ImportVolunteerNameFieldsProps) {
  const id = useId();
  const inputClass = 'w-full bg-dark3/60 border border-border focus:border-[#4d7cfe] text-text text-xs font-bold rounded-lg px-2.5 py-1.5 outline-none';
  return (
    <div className="space-y-2 min-w-0">
      <label className="block text-xs text-text" htmlFor={`${id}-first`}>
        Nombres
        <input id={`${id}-first`} className={inputClass} value={firstName} placeholder="Juan Carlos"
          onChange={event => onChange({ firstName: event.target.value })} />
      </label>
      <label className="block text-xs text-text" htmlFor={`${id}-last`}>
        Apellidos
        <input id={`${id}-last`} className={inputClass} value={lastName} placeholder="Pérez López"
          onChange={event => onChange({ lastName: event.target.value })} />
      </label>
      {nameNeedsReview && (
        <label className="flex items-start gap-2 text-xs text-text">
          <input type="checkbox" className="mt-0.5" checked={false}
            disabled={!firstName.trim() || !lastName.trim()}
            onChange={() => onChange({ nameNeedsReview: false })} />
          <span>Revisé la separación de nombres y apellidos del archivo anterior.</span>
        </label>
      )}
    </div>
  );
}
