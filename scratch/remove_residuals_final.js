const fs = require('fs');
let content = fs.readFileSync('app/(coordinator)/dashboard/page.tsx', 'utf8');

// 1. Remove ranking number `<span className="text-[10px] font-bold text-slate-300 w-4">0{idx + 1}</span>`
const numStart = '<span className="text-[10px] font-bold text-slate-300 w-4">';
const numEnd = '</span>';

while (content.indexOf(numStart) !== -1) {
    let sIdx = content.indexOf(numStart);
    let eIdx = content.indexOf(numEnd, sIdx) + numEnd.length;
    // Remove the trailing newline and whitespace if it exists
    while (content[eIdx] === '\\n' || content[eIdx] === '\\r' || content[eIdx] === ' ') {
        eIdx++;
    }
    content = content.substring(0, sIdx) + content.substring(eIdx);
}

// 2. Remove Faltan block
const faltanStartText = '<div className="pl-8 text-right shrink-0">';
const faltanEndTextMarker = 'Faltan</p>';

while (content.indexOf(faltanStartText) !== -1) {
    let sIdx = content.indexOf(faltanStartText);
    
    // Find where "Faltan</p>" ends
    let innerIdx = content.indexOf(faltanEndTextMarker, sIdx);
    
    // We need to jump over two closing `</div>` after `Faltan</p>`
    let firstDiv = content.indexOf('</div>', innerIdx);
    let secondDiv = content.indexOf('</div>', firstDiv + 1);
    
    let eIdx = secondDiv + 6; // 6 is length of '</div>'
    
    // Remove the trailing newline and whitespace
    while (eIdx < content.length && (content[eIdx] === '\\n' || content[eIdx] === '\\r' || content[eIdx] === ' ')) {
        eIdx++;
    }
    
    content = content.substring(0, sIdx) + content.substring(eIdx);
}

fs.writeFileSync('app/(coordinator)/dashboard/page.tsx', content);
console.log('Successfully removed strings using iterative index matching.');
