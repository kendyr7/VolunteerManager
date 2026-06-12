const fs = require('fs');
let content = fs.readFileSync('app/(coordinator)/dashboard/page.tsx', 'utf8');

// 1. Rename KPI
content = content.replace(/'Cuellos de Botella'/g, "'Turnos Críticos'");
content = content.replace(/>Cuellos de Botella</g, ">Turnos Críticos<");
content = content.replace(/>Subtítulo del KPI</g, ">Riesgo Operativo<");

// 2. We need to add the heatmap calculation to the top.
const depsLine = "  }, [volunteers, committeesList, globalShifts, committeeRequirements]);";
const heatmapLogic = `\n\n  const heatmapMatrix = useMemo(() => {
    return EVENT_DAYS.map(day => {
      const shiftsData = ['T1', 'T2', 'T3', 'T4'].map(shiftId => {
        let totalReq = 0;
        let totalAssigned = 0;
        Object.keys(committeeRequirements).forEach(commId => {
          const reqs = committeeRequirements[commId];
          if (reqs && reqs[shiftId] > 0) {
            totalReq += reqs[shiftId];
            const assigned = volunteers.filter(v => {
              if (v.committee_id !== commId) return false;
              const vShifts = globalShifts[v.id];
              return vShifts && vShifts[day.key] && vShifts[day.key].includes(shiftId);
            }).length;
            totalAssigned += assigned;
          }
        });
        return { shift: shiftId, required: totalReq, assigned: totalAssigned, coverage: totalReq === 0 ? 1 : totalAssigned / totalReq };
      });
      return { day: day.key, shortLabel: day.label, dayLabel: day.dateNum, shifts: shiftsData };
    });
  }, [committeeRequirements, volunteers, globalShifts]);`;

if (!content.includes('const heatmapMatrix = useMemo')) {
    const depsIndex = content.lastIndexOf(depsLine);
    content = content.substring(0, depsIndex + depsLine.length) + heatmapLogic + content.substring(depsIndex + depsLine.length);
}

// Update KPI value to use heatmapMatrix
content = content.replace(/value: criticalBottlenecks\.length/g, "value: heatmapMatrix.flatMap(d => d.shifts).filter(s => s.required > 0 && s.coverage < 0.5).length");


// 3. Remove "Right: Critical Bottlenecks" block and replace it with Heatmap!
const heatmapUI = `      {/* Bottom Row: Mapa de Calor Operativo */}
      <motion.div variants={itemVariants} className="w-full min-w-0 mt-8">
          <Card className="border-none bg-slate-50/50 shadow-inner rounded-sm overflow-hidden flex flex-col border border-slate-200/60 min-w-0">
            <div className="px-8 py-7 flex items-center justify-between">
              <div className="space-y-1">
                <h3 className="text-slate-800 tracking-tight leading-none">Mapa de Calor Operativo</h3>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Cobertura por Día y Turno</p>
              </div>
              <div className="w-10 h-10 bg-[#4d7cfe]/10 rounded-sm flex items-center justify-center shadow-sm">
                <span className="material-symbols-outlined text-[20px] text-[#4d7cfe]">grid_view</span>
              </div>
            </div>
            <CardContent className="p-0 flex-1 min-w-0">
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
          </Card>
      </motion.div>`;

const rightStartMarker = '        {/* Right: Critical Bottlenecks */}';
const rightStartIndex = content.indexOf(rightStartMarker);
if (rightStartIndex !== -1) {
    // Find the end of the Right column
    const divEnd = content.indexOf('</motion.div>', rightStartIndex);
    const endOfRight = divEnd + '</motion.div>'.length;
    
    // We remove the right column
    content = content.substring(0, rightStartIndex) + content.substring(endOfRight);
}

// Now insert the Heatmap UI right before the very last </div></motion.div> that closes the layout
const finalClosing = '    </motion.div>\n  );\n}';
const closingIndex = content.lastIndexOf(finalClosing);
if (closingIndex !== -1) {
    content = content.substring(0, closingIndex) + heatmapUI + '\n' + content.substring(closingIndex);
}

// Change the grid to NOT have lg:col-span-1 vs lg:col-span-2 anymore, but just what we fixed before
content = content.replace('className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8"', 'className="grid grid-cols-1 lg:grid-cols-4 gap-8 mb-8 min-w-0"');

fs.writeFileSync('app/(coordinator)/dashboard/page.tsx', content);
console.log('Restored Heatmap and removed Cuellos de Botella permanently.');
