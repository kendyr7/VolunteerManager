const fs = require('fs');
let content = fs.readFileSync('app/(coordinator)/dashboard/page.tsx', 'utf8');

// 1. Remove the title header block
const headerStart = '<div className="px-6 py-5 border-b border-slate-50 flex items-center justify-between">';
const headerEnd = '</Link>\n            </div>';
let sIdx = content.indexOf(headerStart);
if (sIdx !== -1) {
    let eIdx = content.indexOf(headerEnd, sIdx) + headerEnd.length;
    // skip trailing newline
    while (eIdx < content.length && (content[eIdx] === '\\n' || content[eIdx] === '\\r' || content[eIdx] === ' ')) {
        eIdx++;
    }
    content = content.substring(0, sIdx) + content.substring(eIdx);
}

// 2. Reduce the padding between each committee row to reduce margin
content = content.replace(/className="px-6 py-3 flex items-center/g, 'className="px-6 py-1.5 flex items-center');

// 3. Update the committee name classes
content = content.replace(
    'className="text-xs font-bold text-slate-400 uppercase tracking-wider group-hover:text-slate-600 transition-colors">{committee.name}</h4>',
    'className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-2 group-hover:text-slate-600 transition-colors">{committee.name}</h4>'
);

fs.writeFileSync('app/(coordinator)/dashboard/page.tsx', content);
console.log('Removed header and updated spacing/typography.');
