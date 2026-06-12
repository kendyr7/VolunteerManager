const fs = require('fs');
let content = fs.readFileSync('app/(coordinator)/dashboard/page.tsx', 'utf8');

const titleMarker = 'Estado por Comité';
const titleIndex = content.indexOf(titleMarker);

const startIndex = content.lastIndexOf('<Card', titleIndex);
const endIndex = content.indexOf('        </motion.div>', titleIndex);

let commCardHtml = content.substring(startIndex, endIndex);

// 1. Reduce padding
commCardHtml = commCardHtml.replace('px-8 py-7', 'px-6 py-5');
commCardHtml = commCardHtml.replace('px-6 py-4', 'px-6 py-3');

// 2. Remove the "0{idx + 1}" number
commCardHtml = commCardHtml.replace(/<span className="text-\[10px\] font-bold text-slate-300 w-4">0\{idx \+ 1\}<\/span>\n\s*/g, '');

// 3. Remove "Faltan" count
commCardHtml = commCardHtml.replace(/<div className="pl-8 text-right shrink-0">[\s\S]*?<\/div>\n\s*<\/div>/g, '</div>');

// 4. Update the committee name typography and adjust gaps
commCardHtml = commCardHtml.replace('text-sm font-bold text-slate-700 group-hover:text-slate-900', 'text-xs font-bold text-slate-400 uppercase tracking-wider group-hover:text-slate-600');
commCardHtml = commCardHtml.replace('flex items-center gap-3 mb-2.5', 'flex items-center gap-2 mb-1.5');

content = content.substring(0, startIndex) + commCardHtml + content.substring(endIndex);
fs.writeFileSync('app/(coordinator)/dashboard/page.tsx', content);
console.log('Typography and padding updated.');
