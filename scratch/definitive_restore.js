const { execSync } = require('child_process');
const fs = require('fs');

console.log('Restoring from git HEAD...');
execSync('git restore "app/(coordinator)/dashboard/page.tsx"');

let content = fs.readFileSync('app/(coordinator)/dashboard/page.tsx', 'utf8');

// 1. Rename Top KPI
content = content.replace(/'Cuellos de Botella'/g, "'Turnos Críticos'");
content = content.replace(/>Cuellos de Botella</g, ">Turnos Críticos<");
content = content.replace(/>Subtítulo del KPI</g, ">Riesgo Operativo<");

// 2. Add Heatmap Logic
const depsLine = "  }, [volunteers, committeesList, globalShifts, committeeRequirements]);";
const depsIndex = content.lastIndexOf(depsLine);
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
content = content.substring(0, depsIndex + depsLine.length) + heatmapLogic + content.substring(depsIndex + depsLine.length);

// Update Top KPI value
content = content.replace(/value: criticalBottlenecks\.length/g, "value: heatmapMatrix.flatMap(d => d.shifts).filter(s => s.required > 0 && s.coverage < 0.5).length");

// 3. Rebuild the Main Grid
const gridStartMarker = '      {/* Daily Volunteer Distribution Chart */}';
const gridStartIndex = content.indexOf(gridStartMarker);

const finalClosing = '    </motion.div>\n  );\n}';
const closingIndex = content.lastIndexOf(finalClosing);

const layoutStr = content.substring(gridStartIndex, closingIndex);

// We manually craft the new layout instead of relying on regex replacements of the old layout
const newLayout = `      {/* Middle Row: Chart & Committee Status */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 mb-8 min-w-0">
        {/* Left: Daily Volunteer Distribution Chart */}
        <motion.div variants={itemVariants} className="lg:col-span-3 min-w-0">
          <Card className="border-none bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05),0_8px_20px_-6px_rgba(0,0,0,0.03)] rounded-sm overflow-hidden h-full flex flex-col min-w-0">
            <CardContent className="p-7 flex-1 flex flex-col justify-between min-w-0">
              <div className="flex items-start justify-between mb-8">
                <div>
                  <p className="text-4xl font-bold text-slate-900 tracking-tighter leading-none tabular-nums">
                    {totalVolsWithShifts.toLocaleString()}
                  </p>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-2">Voluntarios con turnos asignados</p>
                </div>
                <div className="flex items-center gap-2 px-3 py-2 rounded-sm border border-slate-200 bg-slate-50 text-xs font-bold text-slate-500">
                  10 – 26 Sep 2026
                </div>
              </div>

              <div className="relative flex-1 flex flex-col">
                <div className="flex-1 flex items-end gap-1.5 min-h-[100px] mt-4">
                  {(() => {
                    const maxCount = Math.max(...Object.values(volsPerDay), 1);
                    return EVENT_DAYS.map((day, idx) => {
                      const count = volsPerDay[day.key] || 0;
                      const heightPct = maxCount > 0 ? Math.max((count / maxCount) * 100, count > 0 ? 5 : 2) : 2;
                      const isHovered = hoveredDay === day.key;
                      return (
                        <div
                          key={day.key}
                          className="flex-1 flex flex-col items-center justify-end h-full relative group cursor-pointer"
                          onMouseEnter={() => setHoveredDay(day.key)}
                          onMouseLeave={() => setHoveredDay(null)}
                        >
                          {isHovered && (
                            <div className="absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[11px] font-bold px-2.5 py-1.5 rounded-sm whitespace-nowrap z-20 shadow-lg pointer-events-none">
                              {count} voluntarios
                              <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-4 border-transparent border-t-slate-900" />
                            </div>
                          )}
                          <motion.div
                            initial={{ height: 0 }}
                            animate={{ height: \`\${heightPct}%\` }}
                            transition={{ duration: 0.7, delay: idx * 0.025, ease: "circOut" }}
                            className={\`w-full rounded-[3px] transition-colors duration-150 \${
                              isHovered
                                ? 'bg-[#0084d1]'
                                : 'bg-slate-200 hover:bg-[#0084d1]/50'
                            }\`}
                          />
                        </div>
                      );
                    });
                  })()}
                </div>

                <div className="flex gap-1.5 mt-2">
                  {EVENT_DAYS.map(day => (
                    <div key={day.key} className="flex-1 text-center">
                      <span className={\`text-[10px] font-bold transition-colors \${
                        hoveredDay === day.key ? 'text-[#0084d1]' : 'text-slate-400'
                      }\`}>{day.dateNum}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-1.5">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Septiembre 2026</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Right: Committee Status Ranking */}
        <motion.div variants={itemVariants} className="lg:col-span-1 min-w-0">
          <Card className="border-none bg-white shadow-xl shadow-slate-200/50 rounded-sm overflow-hidden border border-slate-100 h-full flex flex-col">
            <CardContent className="p-0 flex-1 flex flex-col">
              <div className="divide-y divide-slate-50 flex-1 flex flex-col justify-evenly h-full">
                {committeeStatus.map((committee, idx) => (
                  <motion.div 
                    key={committee.id} 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 + idx * 0.05 }}
                    className="px-6 py-1.5 flex items-center justify-between hover:bg-slate-50/50 transition-colors group cursor-default"
                  >
                    <div className="flex-1 w-full min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider group-hover:text-slate-600 transition-colors">{committee.name}</p>
                        {committee.status === 'high_risk' && (
                          <div className="w-1.5 h-1.5 rounded-full bg-red animate-ping" />
                        )}
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex-1 h-1.5 bg-slate-50 rounded-full overflow-hidden border border-slate-100">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: \`\${committee.coverage}%\` }}
                            transition={{ duration: 1, delay: 0.5 + idx * 0.05 }}
                            className={\`h-full rounded-full \${
                              committee.status === 'success' ? 'bg-accent' :
                              committee.status === 'warning' ? 'bg-amber-400' : 'bg-red'
                            }\`}
                          />
                        </div>
                        <span className="text-[11px] font-bold text-slate-500 w-10 tabular-nums">{committee.coverage}%</span>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Bottom Row: Mapa de Calor Operativo */}
      <motion.div variants={itemVariants} className="w-full min-w-0">
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
      </motion.div>
`;

content = content.substring(0, gridStartIndex) + newLayout + '\n' + finalClosing;

fs.writeFileSync('app/(coordinator)/dashboard/page.tsx', content);
console.log('Absolutely perfectly restored the state and wiped Cuellos de Botella permanently.');
