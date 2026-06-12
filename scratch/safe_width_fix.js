const fs = require('fs');

let content = fs.readFileSync('app/(coordinator)/dashboard/page.tsx', 'utf8');

// 1. Full width layout
content = content.replace(
  'className="space-y-12 max-w-6xl mx-auto pb-20"',
  'className="w-full mx-auto px-4 sm:px-6 lg:px-8 space-y-12 pb-20"'
);

// 2. Responsive Header Actions
content = content.replace(
  '<div className="flex items-center gap-4 shrink-0 relative z-10">',
  '<div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 shrink-0 relative z-10 w-full lg:w-auto">'
);
content = content.replace(
  '<Link href="/settings">',
  '<Link href="/settings" className="w-full sm:w-auto">'
);
content = content.replace(
  '<Button variant="outline" size="lg" className="rounded-sm',
  '<Button variant="outline" size="lg" className="w-full sm:w-auto rounded-sm'
);
content = content.replace(
  '<Link href="/shifts">',
  '<Link href="/shifts" className="w-full sm:w-auto">'
);
content = content.replace(
  '<Button size="lg" className="bg-[#0084d1]',
  '<Button size="lg" className="w-full sm:w-auto bg-[#0084d1]'
);

// 3. Responsive Chart Header
content = content.replace(
  '<div className="flex items-start justify-between mb-8">',
  '<div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 sm:gap-0 mb-8">'
);

// 4. Responsive Chart Bars container
content = content.replace(
  '<div className="relative flex-1 flex flex-col">',
  '<div className="relative flex-1 flex flex-col overflow-x-auto w-full pb-2">'
);
content = content.replace(
  '<div className="flex-1 flex items-end gap-1.5 min-h-[100px] mt-4">',
  '<div className="min-w-[400px] flex flex-col h-full"><div className="flex-1 flex items-end gap-1.5 min-h-[100px] mt-4">'
);
content = content.replace(
  '<div className="mt-1.5">',
  '</div><div className="mt-1.5">'
);

// 5. Truncate Committee Names
content = content.replace(
  '<p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider group-hover:text-slate-600 transition-colors">{committee.name}</p>',
  '<p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider group-hover:text-slate-600 transition-colors truncate" title={committee.name}>{committee.name}</p>'
);

// 6. Reduce padding on mobile
content = content.replace(
  '<CardContent className="p-7 flex-1 flex flex-col justify-between min-w-0">',
  '<CardContent className="p-5 sm:p-7 flex-1 flex flex-col justify-between min-w-0">'
);
content = content.replace(
  '<div className="px-8 py-7 flex items-center justify-between">',
  '<div className="px-5 sm:px-8 py-5 sm:py-7 flex flex-col sm:flex-row sm:items-center justify-between gap-4">'
);
content = content.replace(
  '<div className="space-y-1">',
  '<div className="space-y-1 pr-4 sm:pr-0">'
);

// We replace any other remaining `p-7` to be `p-5 sm:p-7` for standard cards
let previousContent;
do {
  previousContent = content;
  content = content.replace('CardContent className="p-7"', 'CardContent className="p-5 sm:p-7"');
} while (content !== previousContent);

fs.writeFileSync('app/(coordinator)/dashboard/page.tsx', content);
console.log('Applied full width and responsive fixes successfully.');
