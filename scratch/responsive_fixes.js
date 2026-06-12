const fs = require('fs');
let content = fs.readFileSync('app/(coordinator)/dashboard/page.tsx', 'utf8');

// 1. Make Top Header Action Buttons Stack/Fill properly on Mobile
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

// 2. Make Chart Header Stack properly on Mobile
content = content.replace(
  '<div className="flex items-start justify-between mb-8">',
  '<div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 sm:gap-0 mb-8">'
);

// 3. Prevent Chart Bars from shrinking too much (wrap in horizontal scroll if needed)
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
); // Close min-w wrapper before the label

// 4. Ensure Committee names truncate and don't push the flex layout
content = content.replace(
  '<p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider group-hover:text-slate-600 transition-colors">{committee.name}</p>',
  '<p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider group-hover:text-slate-600 transition-colors truncate" title={committee.name}>{committee.name}</p>'
);

// 5. Reduce padding on Heatmap and Chart cards for Mobile
content = content.replace(
  '<CardContent className="p-7 flex-1 flex flex-col justify-between min-w-0">',
  '<CardContent className="p-5 sm:p-7 flex-1 flex flex-col justify-between min-w-0">'
);
content = content.replace(
  '<div className="px-8 py-7 flex items-center justify-between">',
  '<div className="px-5 sm:px-8 py-5 sm:py-7 flex items-center justify-between gap-4">'
);
content = content.replace(
  '<div className="space-y-1">',
  '<div className="space-y-1 pr-4 sm:pr-0">'
);

// 6. Reduce top container padding for mobile if applicable (it's mostly in layout, but let's make sure cards have good padding)
// The cards with 'p-7'
content = content.replace(
  /className="p-7"/g,
  'className="p-5 sm:p-7"'
);

fs.writeFileSync('app/(coordinator)/dashboard/page.tsx', content);
console.log('Applied 100% responsiveness fixes to the dashboard');
