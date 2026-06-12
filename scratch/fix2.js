const fs = require('fs');
const file = 'app/(coordinator)/dashboard/page.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /<motion\.div variants={itemVariants} className="lg:col-span-2">/g,
  '<motion.div variants={itemVariants} className="order-1 lg:col-span-3">'
);

fs.writeFileSync(file, content);
