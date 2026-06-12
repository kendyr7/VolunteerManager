const fs = require('fs');
let content = fs.readFileSync('app/(coordinator)/dashboard/page.tsx', 'utf8');

// Replace text-xs with text-[0.75rem] on the committee names
content = content.replace(
    '<h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-2 group-hover:text-slate-600 transition-colors">{committee.name}</h4>',
    '<h4 className="text-[0.75rem] font-bold text-slate-400 uppercase tracking-wider mt-2 group-hover:text-slate-600 transition-colors" style={{ fontSize: "0.75rem" }}>{committee.name}</h4>'
);

fs.writeFileSync('app/(coordinator)/dashboard/page.tsx', content);
console.log('Font size set to .75rem explicitly.');
