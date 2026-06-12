const fs = require('fs');
let content = fs.readFileSync('app/(coordinator)/dashboard/page.tsx', 'utf8');

const startMarker = '  const heatmapMatrix = useMemo(() => {';
const endMarker = '  }, [committeeRequirements, volunteers, globalShifts]);';

const startIndex = content.indexOf(startMarker);
const endIndex = content.indexOf(endMarker, startIndex) + endMarker.length;

const newHeatmap = `  const heatmapMatrix = useMemo(() => {
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

content = content.substring(0, startIndex) + newHeatmap + content.substring(endIndex);
fs.writeFileSync('app/(coordinator)/dashboard/page.tsx', content);
