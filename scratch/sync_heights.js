const fs = require('fs');
let content = fs.readFileSync('app/(coordinator)/dashboard/page.tsx', 'utf8');

// 1. Restore h-full flex flex-col to the Chart card and CardContent
content = content.replace(
    'className="border-none bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05),0_8px_20px_-6px_rgba(0,0,0,0.03)] rounded-sm overflow-hidden h-fit min-w-0"',
    'className="border-none bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05),0_8px_20px_-6px_rgba(0,0,0,0.03)] rounded-sm overflow-hidden h-full flex flex-col min-w-0"'
);

content = content.replace(
    'className="p-7 flex flex-col justify-end min-w-0"',
    'className="p-7 flex-1 flex flex-col justify-between min-w-0"'
);

// 2. Make the chart bars area flex-1 so it dynamically stretches to fill the height and removes "empty space"
content = content.replace(
    '<div className="flex items-end gap-1.5 h-28">',
    '<div className="flex-1 flex items-end gap-1.5 min-h-[100px] mt-4">'
);

// 3. Restore h-full flex flex-col to the Committee card
content = content.replace(
    'className="border-none bg-white shadow-xl shadow-slate-200/50 rounded-sm overflow-hidden border border-slate-100 h-fit"',
    'className="border-none bg-white shadow-xl shadow-slate-200/50 rounded-sm overflow-hidden border border-slate-100 h-full flex flex-col"'
);

// 4. Make the committee list evenly distribute its space so it fills the card perfectly without a gap at the bottom
content = content.replace(
    '<div className="divide-y divide-slate-50">',
    '<div className="divide-y divide-slate-50 flex-1 flex flex-col justify-evenly h-full">'
);
content = content.replace(
    '<CardContent className="p-0 flex-1">',
    '<CardContent className="p-0 flex-1 flex flex-col">'
);

fs.writeFileSync('app/(coordinator)/dashboard/page.tsx', content);
console.log('Cards synchronized to exactly the same height with dynamic flex stretching.');
