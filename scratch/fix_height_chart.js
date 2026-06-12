const fs = require('fs');
let content = fs.readFileSync('app/(coordinator)/dashboard/page.tsx', 'utf8');

const targetStrCard = 'className="border-none bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05),0_8px_20px_-6px_rgba(0,0,0,0.03)] rounded-sm overflow-hidden h-full flex flex-col min-w-0"';
const newStrCard = 'className="border-none bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05),0_8px_20px_-6px_rgba(0,0,0,0.03)] rounded-sm overflow-hidden h-fit min-w-0"';

content = content.replace(targetStrCard, newStrCard);

// Also let's clean up the CardContent which was relying on flex-1 to push the chart to the bottom of the card
const targetStrCardContent = 'className="p-7 flex-1 flex flex-col justify-end min-w-0"';
const newStrCardContent = 'className="p-7 flex flex-col justify-end min-w-0"';

content = content.replace(targetStrCardContent, newStrCardContent);

fs.writeFileSync('app/(coordinator)/dashboard/page.tsx', content);
console.log('Removed h-full from the Chart card to prevent empty vertical space.');
