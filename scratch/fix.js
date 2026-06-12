const fs = require('fs');
const file = 'app/(coordinator)/dashboard/page.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /<div className="flex-1 max-w-md">/g,
  '<div className="flex-1 w-full">'
);

content = content.replace(
  /<div className="pl-8 text-right shrink-0">[\s\S]*?<\/motion\.div>/g,
  '</motion.div>'
);

fs.writeFileSync(file, content);
