const fs = require('fs');
let content = fs.readFileSync('app/(coordinator)/dashboard/page.tsx', 'utf8');

const chartStartMarker = '      {/* Daily Volunteer Distribution Chart */}';
const chartStartIndex = content.indexOf(chartStartMarker);
const chartInnerStart = content.indexOf('<Card className="border-none', chartStartIndex);
const chartInnerEnd = content.indexOf('        </Card>', chartInnerStart) + '        </Card>'.length;

let chartCardHtml = content.substring(chartInnerStart, chartInnerEnd);
chartCardHtml = chartCardHtml.replace('rounded-sm overflow-hidden">', 'rounded-sm overflow-hidden h-full flex flex-col min-w-0">');
chartCardHtml = chartCardHtml.replace('<CardContent className="p-7">', '<CardContent className="p-7 flex-1 flex flex-col justify-end min-w-0">');

const commStartMarker = '        {/* Left: Committee Status Ranking */}';
const commStartIndex = content.indexOf(commStartMarker);
const commInnerStart = content.indexOf('<Card className="', commStartIndex);

// Comm ends right before Cuellos de Botella
const rightStartMarker = '        {/* Right: Critical Bottlenecks */}';
const rightMarkerIndex = content.indexOf(rightStartMarker);
const commInnerEnd = content.lastIndexOf('        </Card>', rightMarkerIndex) + '        </Card>'.length;

let commCardHtml = content.substring(commInnerStart, commInnerEnd).trim();
commCardHtml = commCardHtml.replace('rounded-sm overflow-hidden">', 'rounded-sm overflow-hidden h-full flex flex-col min-w-0">');
commCardHtml = commCardHtml.replace(/className="px-8 py-5/g, 'className="px-6 py-4');
commCardHtml = commCardHtml.replace(/<span className="text-\[10px\] font-bold text-slate-300 w-4">0{idx \+ 1}<\/span>\n\s*/g, '');
commCardHtml = commCardHtml.replace(/<div className="pl-8 text-right shrink-0">[\s\S]*?<\/div>\n\s*<\/div>/g, '</div>');
commCardHtml = commCardHtml.replace(/<div className="flex-1 max-w-md">/g, '<div className="flex-1 w-full min-w-0">');

// Heatmap Matrix UI
const heatmapUI = `          <Card className="border-none bg-slate-50/50 shadow-inner rounded-sm overflow-hidden h-full flex flex-col border border-slate-200/60 min-w-0">
            <div className="px-8 py-7 flex items-center justify-between">
              <div className="space-y-1">
                <h3 className="text-slate-800 tracking-tight leading-none">Mapa de Calor Operativo</h3>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Cobertura por Día y Turno</p>
              </div>
              <div className="w-10 h-10 bg-[#4d7cfe]/10 rounded-sm flex items-center justify-center shadow-sm">
                <span className="material-symbols-outlined text-[20px] text-[#4d7cfe]">grid_view</span>
              </div>
            </div>
            <CardContent className="p-0 flex-1 min-h-[350px] min-w-0">
              <div className="overflow-x-auto w-full">
                <div className="min-w-[600px] flex">
                  <div className="w-24 shrink-0 bg-white/50 border-r border-slate-200/60 flex flex-col pt-8">
                    {['T1', 'T2', 'T3', 'T4'].map((shiftId) => (
                      <div key={shiftId} className="flex-1 min-h-[60px] flex items-center justify-center border-b border-slate-100/50 last:border-0">
                        <span className="text-[10px] font-bold text-slate-500">{shiftId}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex-1 grid grid-cols-8">
                    {heatmapMatrix.map((dayData, idx) => (
                      <div key={dayData.day} className="flex flex-col border-r border-slate-100/50 last:border-0 min-w-0">
                        <div className="h-8 flex flex-col items-center justify-center bg-white/30 border-b border-slate-200/60">
                          <span className="text-[10px] font-bold text-slate-800">{dayData.shortLabel}</span>
                        </div>
                        {dayData.shifts.map((shift) => (
                          <div 
                            key={shift.shift}
                            className="flex-1 min-h-[60px] flex flex-col items-center justify-center border-b border-white border-r border-white last:border-b-0 p-1 transition-all duration-300 relative group"
                            style={{
                              backgroundColor: shift.required === 0 ? 'rgba(248, 250, 252, 0.5)' : 
                                shift.coverage >= 1 ? 'rgba(20, 184, 166, 0.15)' :
                                shift.coverage >= 0.7 ? 'rgba(251, 191, 36, 0.15)' :
                                'rgba(248, 113, 113, 0.15)'
                            }}
                          >
                            {shift.required > 0 ? (
                              <>
                                <span className="text-[11px] font-bold text-slate-700">{Math.round(shift.coverage * 100)}%</span>
                                <span className="text-[8px] font-bold text-slate-400 mt-0.5">{shift.assigned}/{shift.required}</span>
                              </>
                            ) : (
                              <span className="text-[10px] text-slate-300">-</span>
                            )}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-center gap-4 sm:gap-6 mt-8 flex-wrap shrink-0 pb-8">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm bg-red-400" />
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Crítico</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm bg-amber-400" />
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Riesgo</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm bg-teal-500" />
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Óptimo</span>
                </div>
              </div>
            </CardContent>
          </Card>`;

const newLayout = `      {/* Middle Row: Chart & Committee Status */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 mb-8 min-w-0">
        {/* Left: Daily Volunteer Distribution Chart */}
        <motion.div variants={itemVariants} className="lg:col-span-3 min-w-0">
          ${chartCardHtml}
        </motion.div>

        {/* Right: Committee Status Ranking */}
        <motion.div variants={itemVariants} className="lg:col-span-2 min-w-0">
          ${commCardHtml}
        </motion.div>
      </div>

      {/* Bottom Row: Mapa de Calor Operativo */}
      <motion.div variants={itemVariants} className="w-full min-w-0">
${heatmapUI}
      </motion.div>

    </motion.div>
  );
}
`;

content = content.substring(0, chartStartIndex) + newLayout;
fs.writeFileSync('app/(coordinator)/dashboard/page.tsx', content);
