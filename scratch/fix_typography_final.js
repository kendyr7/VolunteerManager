const fs = require('fs');
let content = fs.readFileSync('app/(coordinator)/dashboard/page.tsx', 'utf8');

// The exact line currently in the file:
const oldTag = '<h4 className="text-[0.75rem] font-bold text-slate-400 uppercase tracking-wider mt-2 group-hover:text-slate-600 transition-colors" style={{ fontSize: "0.75rem" }}>{committee.name}</h4>';
const newTag = '<h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider group-hover:text-slate-600 transition-colors">{committee.name}</h4>';

content = content.replace(oldTag, newTag);

// Also let's tighten the gap from 'gap-2 mb-1.5' to just 'gap-2 mb-1' to reduce space further
content = content.replace('className="flex items-center gap-2 mb-1.5"', 'className="flex items-center gap-2 mb-1"');

fs.writeFileSync('app/(coordinator)/dashboard/page.tsx', content);
console.log('Fixed typography and removed mt-2 extra margin.');
