const { execSync } = require('child_process');
const fs = require('fs');

console.log('Restoring...');
execSync('git restore "app/(coordinator)/dashboard/page.tsx"');

let content = fs.readFileSync('app/(coordinator)/dashboard/page.tsx', 'utf8');

// The exact Faltan block:
const faltanBlock = `                    <div className="pl-8 text-right shrink-0">
                      <div className="flex flex-col items-end">
                        <p className={\`text-xl font-bold leading-none tracking-tighter \${committee.missing > 15 ? 'text-red-500' : 'text-slate-800'}\`}>
                          {committee.missing}
                        </p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Faltan</p>
                      </div>
                    </div>`;

content = content.replace(faltanBlock, '');
content = content.replace(faltanBlock, '');

// The exact index string
const indexString = '                        <span className="text-[10px] font-bold text-slate-300 w-4">0{idx + 1}</span>\n';
content = content.replace(indexString, '');

// 1. Remove ranking number securely
const numStart = '<span className="text-[10px] font-bold text-slate-300 w-4">';
const numEnd = '</span>';
while (content.indexOf(numStart) !== -1) {
    let sIdx = content.indexOf(numStart);
    let eIdx = content.indexOf(numEnd, sIdx);
    if (eIdx !== -1) {
        eIdx += numEnd.length;
        while (content[eIdx] === '\\n' || content[eIdx] === '\\r' || content[eIdx] === ' ') { eIdx++; }
        content = content.substring(0, sIdx) + content.substring(eIdx);
    } else break;
}

// 2. Remove Faltan block securely
const faltanStartText = '<div className="pl-8 text-right shrink-0">';
const faltanEndTextMarker = 'Faltan</p>';
while (content.indexOf(faltanStartText) !== -1) {
    let sIdx = content.indexOf(faltanStartText);
    let innerIdx = content.indexOf(faltanEndTextMarker, sIdx);
    if (innerIdx !== -1) {
        let firstDiv = content.indexOf('</div>', innerIdx);
        let secondDiv = content.indexOf('</div>', firstDiv + 1);
        let eIdx = secondDiv + 6;
        while (eIdx < content.length && (content[eIdx] === '\\n' || content[eIdx] === '\\r' || content[eIdx] === ' ')) { eIdx++; }
        content = content.substring(0, sIdx) + content.substring(eIdx);
    } else break;
}

// 3. Remove Title Header Block Securely
const headerStart = '<div className="px-6 py-5 border-b border-slate-50 flex items-center justify-between">';
const headerEndMarker = 'Ver Detalles';
if (content.indexOf(headerStart) !== -1) {
    let sIdx = content.indexOf(headerStart);
    let innerIdx = content.indexOf(headerEndMarker, sIdx);
    if (innerIdx !== -1) {
        let linkEnd = content.indexOf('</Link>', innerIdx);
        let divEnd = content.indexOf('</div>', linkEnd);
        let eIdx = divEnd + 6;
        while (eIdx < content.length && (content[eIdx] === '\\n' || content[eIdx] === '\\r' || content[eIdx] === ' ')) { eIdx++; }
        content = content.substring(0, sIdx) + content.substring(eIdx);
    }
}

// 4. Reduce Padding
content = content.replace(/className="px-6 py-3 flex items-center/g, 'className="px-6 py-1.5 flex items-center');

// 5. Update Typography Classes
const oldClass = 'className="text-xs font-bold text-slate-400 uppercase tracking-wider group-hover:text-slate-600 transition-colors"';
const newClass = 'className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-2 group-hover:text-slate-600 transition-colors"';
content = content.replace(oldClass, newClass);

fs.writeFileSync('app/(coordinator)/dashboard/page.tsx', content);
console.log('Done with all requests.');
