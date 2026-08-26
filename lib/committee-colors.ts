export function getCommitteeColor(committee: string): string {
  if (!committee) return 'bg-dark3 text-text-dim border-border';

  const normalizedCommittee = committee.toLowerCase();
  if (normalizedCommittee.includes('seguridad')) return 'border-[#fe4d97]/25 bg-[#fe4d97]/10 text-[#b31558] dark:bg-[#fe4d97]/15 dark:text-[#fe75aa]';
  if (normalizedCommittee.includes('guía') || normalizedCommittee.includes('guia')) return 'border-[#6dd230]/30 bg-[#6dd230]/12 text-[#357a13] dark:bg-[#6dd230]/15 dark:text-[#8be35a]';
  if (normalizedCommittee.includes('historia')) return 'border-[#4d7cfe]/25 bg-[#4d7cfe]/10 text-[#355ed7] dark:bg-[#4d7cfe]/15 dark:text-[#7da0ff]';
  if (normalizedCommittee.includes('traducción') || normalizedCommittee.includes('traduccion')) return 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/15 dark:text-amber-300';
  if (normalizedCommittee.includes('transporte')) return 'border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-500/20 dark:bg-purple-500/15 dark:text-purple-300';
  if (normalizedCommittee.includes('auxilios') || normalizedCommittee.includes('médico') || normalizedCommittee.includes('medico')) return 'border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-500/20 dark:bg-teal-500/15 dark:text-teal-300';

  const fallbackColors = [
    'border-[#4d7cfe]/25 bg-[#4d7cfe]/10 text-[#355ed7] dark:bg-[#4d7cfe]/15 dark:text-[#7da0ff]',
    'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/15 dark:text-emerald-300',
    'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/15 dark:text-indigo-300',
    'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/15 dark:text-rose-300',
    'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-500/20 dark:bg-orange-500/15 dark:text-orange-300',
    'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/15 dark:text-sky-300',
  ];
  let hash = 0;
  for (let index = 0; index < committee.length; index += 1) {
    hash = committee.charCodeAt(index) + ((hash << 5) - hash);
  }

  return fallbackColors[Math.abs(hash) % fallbackColors.length];
}
