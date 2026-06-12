const fs = require('fs');
let content = fs.readFileSync('app/(coordinator)/dashboard/page.tsx', 'utf8');

// The exact string to remove for the index:
const indexString = '                        <span className="text-[10px] font-bold text-slate-300 w-4">0{idx + 1}</span>\n';
content = content.replace(indexString, '');

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
content = content.replace(faltanBlock, ''); // Just in case, replace it everywhere

fs.writeFileSync('app/(coordinator)/dashboard/page.tsx', content);
console.log('Removed specific blocks directly.');
