const fs = require('fs');
let content = fs.readFileSync('app/(coordinator)/dashboard/page.tsx', 'utf8');

const targetStr = 'className="border-none bg-white shadow-xl shadow-slate-200/50 rounded-sm overflow-hidden border border-slate-100 h-full flex flex-col"';
const newStr = 'className="border-none bg-white shadow-xl shadow-slate-200/50 rounded-sm overflow-hidden border border-slate-100 h-fit"';

content = content.replace(targetStr, newStr);

fs.writeFileSync('app/(coordinator)/dashboard/page.tsx', content);
console.log('Removed h-full from the Committee card to prevent empty vertical space.');
