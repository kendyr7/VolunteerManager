const fs = require('fs');
const file = 'app/(coordinator)/dashboard/page.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Rewrite the grid layout starting from the Chart to the end
// It is easier to extract the 3 raw blocks using regex.

// Extract Chart (from `<motion.div variants={itemVariants}>` after `/* Daily Volunteer Distribution Chart */` up to its `</motion.div>`)
const chartMatch = content.match(/{\/\* Daily Volunteer Distribution Chart \*\/}\n\s*<motion\.div variants={itemVariants}>\n\s*<Card className="([^"]+)">\n([\s\S]*?)\n\s*<\/Card>\n\s*<\/motion\.div>/);

// Extract Committee (from `/* Left: Committee Status Ranking */` up to its `</motion.div>`)
const committeeMatch = content.match(/{\/\* Left: Committee Status Ranking \*\/}\n\s*<motion\.div variants={itemVariants} className="[^"]+">\n\s*<Card className="([^"]+)">\n([\s\S]*?)\n\s*<\/Card>\n\s*<\/motion\.div>/);

// Extract Heatmap (from `/* Right: Mapa de Calor Operativo */` up to its `</motion.div>`)
const heatmapMatch = content.match(/{\/\* Right: Mapa de Calor Operativo \*\/}\n\s*<motion\.div variants={itemVariants} className="[^"]+">\n\s*<Card className="([^"]+)">\n([\s\S]*?)\n\s*<\/Card>\n\s*<\/motion\.div>/);

if (!chartMatch || !committeeMatch || !heatmapMatch) {
  console.log("Failed to match one of the blocks!");
  if (!chartMatch) console.log("Chart failed");
  if (!committeeMatch) console.log("Committee failed");
  if (!heatmapMatch) console.log("Heatmap failed");
  process.exit(1);
}

// Transform Chart Card Class
let newChartCardClass = chartMatch[1];
if (!newChartCardClass.includes('h-full')) {
  newChartCardClass += ' h-full flex flex-col';
}

let chartContent = chartMatch[2];
// Make the chart's content stretch nicely vertically
chartContent = chartContent.replace('className="p-7"', 'className="p-7 flex-1 flex flex-col"');
// Add mt-auto to the bars container so it pushes to the bottom
chartContent = chartContent.replace('className="relative"', 'className="relative mt-auto"');


// Transform Committee Class & Remove numbering & Reduce padding
let newCommitteeCardClass = committeeMatch[1];
let committeeContent = committeeMatch[2];
committeeContent = committeeContent.replace(/className="px-8 py-5/g, 'className="px-6 py-4');
// Remove the `01`, `02` span
committeeContent = committeeContent.replace(/<span className="text-\[10px\] font-bold text-slate-300 w-4">0{idx \+ 1}<\/span>\n\s*/g, '');

// Transform Heatmap
let newHeatmapCardClass = heatmapMatch[1];
let heatmapContent = heatmapMatch[2];

// Reassemble
const newLayout = `      {/* Middle Row: Chart & Committee Status */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 mb-8">
        
        {/* Left: Daily Volunteer Distribution Chart */}
        <motion.div variants={itemVariants} className="lg:col-span-3">
          <Card className="${newChartCardClass}">
${chartContent}
          </Card>
        </motion.div>

        {/* Right: Committee Status Ranking */}
        <motion.div variants={itemVariants} className="lg:col-span-2">
          <Card className="${newCommitteeCardClass}">
${committeeContent}
          </Card>
        </motion.div>

      </div>

      {/* Bottom Row: Mapa de Calor Operativo */}
      <motion.div variants={itemVariants} className="w-full">
        <Card className="${newHeatmapCardClass}">
${heatmapContent}
        </Card>
      </motion.div>`;

// Replace from `/* Daily Volunteer Distribution Chart */` down to the `</div>` before `</motion.div>`
const oldSectionRegex = /{\/\* Daily Volunteer Distribution Chart \*\/}[\s\S]*?{\/\* Right: Mapa de Calor Operativo \*\/}[\s\S]*?<\/motion\.div>\n\s*<\/div>/;

if (!oldSectionRegex.test(content)) {
  console.log("Could not find old section to replace!");
  process.exit(1);
}

content = content.replace(oldSectionRegex, newLayout);

fs.writeFileSync(file, content);
console.log("Successfully reorganized the layout.");
