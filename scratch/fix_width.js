const fs = require('fs');
let content = fs.readFileSync('app/(coordinator)/dashboard/page.tsx', 'utf8');

// 1. Change grid layout to make right section less wide
// Replace lg:grid-cols-5 with lg:grid-cols-4
content = content.replace('className="grid grid-cols-1 lg:grid-cols-5 gap-8 mb-8 min-w-0"', 'className="grid grid-cols-1 lg:grid-cols-4 gap-8 mb-8 min-w-0"');

// Left was lg:col-span-3 (which is 3/5). Now it will be 3/4 (which is wider, making right side smaller)
// Right was lg:col-span-2 (2/5 = 40%). Now it needs to be lg:col-span-1 (1/4 = 25%).
const rightSectionMarker = '        {/* Right: Committee Status Ranking */}\n        <motion.div variants={itemVariants} className="lg:col-span-2 min-w-0">';
const newRightSection = '        {/* Right: Committee Status Ranking */}\n        <motion.div variants={itemVariants} className="lg:col-span-1 min-w-0">';
content = content.replace(rightSectionMarker, newRightSection);

fs.writeFileSync('app/(coordinator)/dashboard/page.tsx', content);
console.log('Layout widths adjusted.');
