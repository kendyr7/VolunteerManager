const fs = require('fs');
let content = fs.readFileSync('app/(coordinator)/dashboard/page.tsx', 'utf8');

// Change from <h4> to <p> and revert the size back to text-xs (.75rem) to perfectly match the KPI
const oldTagStart = '<h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider group-hover:text-slate-600 transition-colors">';
const newTagStart = '<p className="text-xs font-bold text-slate-400 uppercase tracking-wider group-hover:text-slate-600 transition-colors">';

content = content.replace(new RegExp(oldTagStart.replace(/[.*+?^$()|[\]\\]/g, '\\$&'), 'g'), newTagStart);
content = content.replace(/<\/h4>/g, '</p>'); // Safe enough as this is likely the only h4 in this small block, but let's be careful. Actually wait, let's just do a specific replace.

// Let's do it safely
while(content.includes(oldTagStart)) {
    let sIdx = content.indexOf(oldTagStart);
    let endIdx = content.indexOf('</h4>', sIdx);
    let innerText = content.substring(sIdx + oldTagStart.length, endIdx);
    
    let replacement = newTagStart + innerText + '</p>';
    content = content.substring(0, sIdx) + replacement + content.substring(endIdx + 5);
}

fs.writeFileSync('app/(coordinator)/dashboard/page.tsx', content);
console.log('Replaced h4 with p and restored text-xs.');
