const { execSync } = require('child_process');
const fs = require('fs');

// 1. Re-run definitive restore
console.log('Running definitive restore...');
execSync('node scratch/definitive_restore.js', { stdio: 'inherit' });

// 2. Re-run responsive fixes
console.log('Running responsive fixes...');
execSync('node scratch/responsive_fixes.js', { stdio: 'inherit' });

// 3. Apply the full-width fix
console.log('Applying full-width layout...');
let content = fs.readFileSync('app/(coordinator)/dashboard/page.tsx', 'utf8');

content = content.replace(
  'className="space-y-12 max-w-6xl mx-auto pb-20"',
  'className="w-full mx-auto px-4 sm:px-6 lg:px-8 space-y-12 pb-20"'
);

fs.writeFileSync('app/(coordinator)/dashboard/page.tsx', content);
console.log('Done!');
