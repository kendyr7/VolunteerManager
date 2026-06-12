const fs = require('fs');
const file = 'app/(coordinator)/dashboard/page.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Find the start of the chart section.
const chartStartMarker = '      {/* Daily Volunteer Distribution Chart */}\n      <motion.div variants={itemVariants}>';
const chartStartIndex = content.indexOf(chartStartMarker);

// 2. Find the end of the chart section.
const chartEndMarker = '          </CardContent>\n        </Card>\n      </motion.div>\n\n      {/* Detailed Monitoring Section */}';
const chartEndIndex = content.indexOf(chartEndMarker);

// Extract the inner chart content (the Card itself)
const chartInnerStart = content.indexOf('<Card className="border-none bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05),0_8px_20px_-6px_rgba(0,0,0,0.03)] rounded-sm overflow-hidden">', chartStartIndex);
const chartInnerEnd = content.indexOf('        </Card>', chartInnerStart) + '        </Card>'.length;

let chartCardHtml = content.substring(chartInnerStart, chartInnerEnd);
// Modify Chart classes for the new grid layout
chartCardHtml = chartCardHtml.replace(
  'rounded-sm overflow-hidden">', 
  'rounded-sm overflow-hidden h-full flex flex-col">'
);
chartCardHtml = chartCardHtml.replace(
  '<CardContent className="p-7">',
  '<CardContent className="p-7 flex-1 flex flex-col justify-end">'
);

// 3. Find Committee Status section
const commStartMarker = '        {/* Left: Committee Status Ranking */}\n        <motion.div variants={itemVariants} className="order-2 lg:col-span-2">\n          <Card className="border-none bg-white shadow-xl shadow-slate-200/50 rounded-sm overflow-hidden border border-slate-100 h-full flex flex-col">';
const commStartIndex = content.indexOf(commStartMarker);
const commInnerStart = content.indexOf('<Card className="', commStartIndex);
const commInnerEnd = content.indexOf('        </motion.div>', commInnerStart);

let commCardHtml = content.substring(commInnerStart, commInnerEnd).trim();
// Simplify Committee padding and remove the number
commCardHtml = commCardHtml.replace(/className="px-8 py-5/g, 'className="px-6 py-4');
commCardHtml = commCardHtml.replace(/<span className="text-\[10px\] font-bold text-slate-300 w-4">0{idx \+ 1}<\/span>\n\s*/g, '');

// 4. Find Heatmap section
const hmStartMarker = '        {/* Right: Mapa de Calor Operativo */}\n        <motion.div variants={itemVariants} className="order-1 lg:col-span-3">';
const hmStartIndex = content.indexOf(hmStartMarker);
const hmInnerStart = content.indexOf('<Card className="', hmStartIndex);
// Heatmap ends at the grid's closing div before the final `</motion.div>`
const hmInnerEnd = content.indexOf('        </motion.div>', hmInnerStart);

let hmCardHtml = content.substring(hmInnerStart, hmInnerEnd).trim();

// 5. Construct the new layout
const newLayout = `      {/* Middle Row: Chart & Committee Status */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 mb-8">
        {/* Left: Daily Volunteer Distribution Chart */}
        <motion.div variants={itemVariants} className="lg:col-span-3">
          ${chartCardHtml}
        </motion.div>

        {/* Right: Committee Status Ranking */}
        <motion.div variants={itemVariants} className="lg:col-span-2">
          ${commCardHtml}
        </motion.div>
      </div>

      {/* Bottom Row: Mapa de Calor Operativo */}
      <motion.div variants={itemVariants} className="w-full">
        ${hmCardHtml}
      </motion.div>

    </motion.div>
  );
}`;

// Replace everything from the chart start to the end of the file.
const totalEndIndex = content.lastIndexOf('    </motion.div>\n  );\n}');
const newContent = content.substring(0, chartStartIndex) + newLayout + '\n';

fs.writeFileSync(file, newContent);
console.log("Success");
