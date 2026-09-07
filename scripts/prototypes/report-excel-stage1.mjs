import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Workbook, SpreadsheetFile } from '@oai/artifact-tool';

// Standalone technical prototype; run with the bundled spreadsheet runtime.
const root = fileURLToPath(new URL('../../', import.meta.url));
const out = `${root}/outputs/excel-etapa-1`;
const started = performance.now();
const wb = Workbook.create();
const names = ['Panel', 'Selecciones', 'Detalle', 'Turnos', 'Metas'];
const [panel, selections, detail, shifts, targets] = names.map(n => wb.worksheets.add(n));
const color = { blue: '#2853B8', accent: '#4D7CFE', ink: '#252631', muted: '#566477', light: '#EDF3FF' };
const committees = ['Guías', 'Seguridad', 'Traducción'];
const dates = [46272, 46273, 46275]; // 7, 8 y 10 de septiembre de 2026.
const rows = [];
for (let c=0;c<3;c++) for (let d=0;d<3;d++) for (let s=1;s<=2;s++) rows.push([
  `${c+1}-${d+1}-${s}`, `V${c+1}${s}`, `${['Ana','Luis'][s-1]} ${['Ejemplo','Muestra','Demo'][c]}`,
  committees[c], dates[d], `T${s}`, s===1?'Asistió':d===1?'Ausente':'Pendiente', s===1?120:0,
]);
const end=5+rows.length;
const range=(sh,a)=>sh.getRange(a);
function value(sh,addr,v){range(sh,addr).values=[[v]];}
function formula(sh,addr,f){range(sh,addr).formulas=[[f]];}
function header(sh,addr){range(sh,addr).format={fill:color.blue,font:{name:'Aptos Narrow',size:11,bold:true,color:'#FFFFFF'},rowHeight:27};}
function title(sh,t,sub,last='J',rows=34){
  sh.showGridLines=false;
  range(sh,`A1:${last}${rows}`).format={font:{name:'Aptos Narrow',size:11,color:color.ink},rowHeight:23,verticalAlignment:'center',fill:'#FFFFFF'};
  range(sh,`A1:A${rows}`).format.columnWidth=3;
  range(sh,`B1:${last}${rows}`).format.columnWidth=17;
  value(sh,'B2',t); range(sh,'B2').format.font={name:'Aptos Narrow',size:21,bold:true,color:color.ink};
  range(sh,'B2').format.rowHeight=35;
  value(sh,'B3',sub);range(sh,'B3').format.font={name:'Aptos Narrow',size:11,color:color.muted};
  sh.tabColor=color.accent;
}
title(panel,'Reporte de voluntariado','Prototipo · Datos ficticios · Microsoft 365');
range(panel,'B1:B34').format.columnWidth=27;
range(panel,'C1:C34').format.columnWidth=23;
range(panel,'D1:D34').format.columnWidth=14;
range(panel,'E1:E34').format.columnWidth=3;
range(panel,'F1:J34').format.columnWidth=14;
const logo=await fs.readFile(`${root}/public/app-icon-512.png`);
panel.images.add({dataUrl:`data:image/png;base64,${logo.toString('base64')}`,anchor:{from:{row:1,col:9},extent:{widthPx:67,heightPx:67}}});
header(panel,'B5:D5');value(panel,'B5','FILTROS DEL PANEL');
range(panel,'B7:B11').values=[['Usar filtros'],['Comité'],['Fechas'],['Estado'],['Cómo editar']];
value(panel,'C7','Al exportar');value(panel,'C8','Todos');value(panel,'C9','Todas');value(panel,'C10','Todos');
value(panel,'C11','Cambia a Personalizados');
range(panel,'C7:C10').format={fill:color.light,font:{name:'Aptos Narrow',size:11,bold:true,color:color.blue}};
range(panel,'C7').dataValidation={rule:{type:'list',values:['Al exportar','Personalizados']}};
range(panel,'C8').dataValidation={rule:{type:'list',values:['Todos',...committees,'Selección múltiple']}};
range(panel,'C9').dataValidation={rule:{type:'list',values:['Todas','Fechas seleccionadas']}};
range(panel,'C10').dataValidation={rule:{type:'list',values:['Todos','Asistió','Pendiente','Ausente']}};
value(panel,'F5','AL EXPORTAR');range(panel,'F5').format.font={bold:true,color:color.blue};
value(panel,'F7','Guías y Seguridad');value(panel,'F8','7 y 10 de septiembre de 2026');value(panel,'F9','Todos los estados');
value(panel,'F11','Selección múltiple: hoja Selecciones');
value(panel,'B13','DATOS AL CAMBIAR LOS FILTROS');range(panel,'B13').format.font={bold:true,color:color.blue};
header(panel,'B15:D15');range(panel,'B15:D15').values=[['Indicador','Resultado','Unidad']];
const indicators=[['Turnos asignados','turnos'],['Asistencias','turnos'],['Tiempo servido','h:mm'],['Requeridos','plazas'],['Faltantes','plazas'],['Cobertura','asignados / meta']];
for(let i=0;i<indicators.length;i++) {value(panel,`B${16+i}`,indicators[i][0]);value(panel,`D${16+i}`,indicators[i][1]);}
const sr=(col)=>`'Turnos'!$${col}$6:$${col}$${end}`;
const tr=(col)=>`'Metas'!$${col}$6:$${col}$${end}`;
formula(panel,'C16',`=SUM(${sr('K')})`);
formula(panel,'C17',`=SUMIFS(${sr('K')},${sr('G')},"Asistió")`);
formula(panel,'C18',`=SUMPRODUCT(${sr('H')},${sr('K')})/1440`);range(panel,'C18').setNumberFormat('[h]:mm');
formula(panel,'C19',`=SUMPRODUCT(${tr('E')},${tr('H')})`);
formula(panel,'C20','=MAX(C19-C16,0)');formula(panel,'C21','=IF(C19=0,"",C16/C19)');range(panel,'C21').setNumberFormat('0%');
range(panel,'C16:C21').format.font={name:'Aptos Narrow',size:14,bold:true,color:color.blue};
value(panel,'B23','COBERTURA POR DÍA Y TURNO');range(panel,'B23').format.font={bold:true,color:color.blue};
header(panel,'B25:D25');range(panel,'B25:D25').values=[['Fecha','T1','T2']];
for(let i=0;i<3;i++){
  const r=26+i;value(panel,`B${r}`,dates[i]);range(panel,`B${r}`).setNumberFormat('dd mmm yyyy');
  for(const [col,shift] of [['C','T1'],['D','T2']]){
    const den=`SUMIFS(${tr('I')},${tr('C')},B${r},${tr('D')},"${shift}")`;
    formula(panel,`${col}${r}`,`=IF(${den}=0,"",SUMIFS(${sr('K')},${sr('E')},B${r},${sr('F')},"${shift}")/${den})`);
  }
}
range(panel,'C26:D28').setNumberFormat('0%');
for(const [condition,fill,ink] of [['C26<0.7','#FDE5E9','#A72B43'],['AND(C26>=0.7,C26<1)','#FFF0CE','#865508'],['C26>=1','#DCF2E7','#176642']])
  range(panel,'C26:D28').conditionalFormats.addCustom(`AND(ISNUMBER(C26),${condition})`,{fill,font:{color:ink,bold:true}});
value(panel,'B30','Rojo <70% · Ámbar 70–99% · Verde ≥100%');
value(panel,'B32','Las metas dependen del comité y la fecha, no del estado de asistencia.');
value(panel,'B33','El detalle se actualiza en la hoja Detalle. Este archivo no consulta datos en línea.');
range(panel,'B30:J33').format.font={name:'Aptos Narrow',size:10,color:color.muted};

title(selections,'Selecciones múltiples','Edita las celdas azules; después activa Personalizados en el Panel.','G',20);
range(selections,'B1:B20').format.columnWidth=29;
range(selections,'C1:D20').format.columnWidth=20;
header(selections,'B5:D5');range(selections,'B5:D8').values=[['Comité','Original','Incluir'],...committees.map((c,i)=>[c,i<2?'Sí':'No',i<2?'Sí':'No'])];
header(selections,'B11:D11');range(selections,'B11:D14').values=[['Fecha','Original','Incluir'],...dates.map((d,i)=>[d,i!==1?'Sí':'No',i!==1?'Sí':'No'])];
range(selections,'B12:B14').setNumberFormat('dd mmm yyyy');
for(const addr of ['D6:D8','D12:D14']){range(selections,addr).format.fill=color.light;range(selections,addr).dataValidation={rule:{type:'list',values:['Sí','No']}};}
value(selections,'B17','Comité: elige Selección múltiple en Panel!C8.');
value(selections,'B18','Fechas: elige Fechas seleccionadas en Panel!C9.');
value(selections,'B19','Si todos están en No, el resultado de esa selección queda vacío.');

title(shifts,'Base de turnos','18 asignaciones ficticias · 6 personas · 3 comités · 3 fechas','K',end);
range(shifts,'B1:B23').format.columnWidth=11;range(shifts,'C1:C23').format.columnWidth=23;
header(shifts,'A5:K5');range(shifts,`A5:H${end}`).values=[['Registro','Persona ID','Voluntario','Comité','Fecha','Turno','Estado','Minutos'],...rows];
range(shifts,'I5:K5').values=[['Comité coincide','Fecha coincide','Coincide']];
range(shifts,`E6:E${end}`).setNumberFormat('dd mmm yyyy');
const shiftTable = shifts.tables.add(`A5:H${end}`,true,'BaseTurnos');
shiftTable.style='TableStyleMedium2';shiftTable.showFilterButton=true;shifts.freezePanes.freezeRows(5);
range(shifts,'A1:A23').format.columnWidth=13;
range(shifts,'E6:E23').format.horizontalAlignment='center';
function committeeFormula(cell){return `IF('Panel'!$C$7="Al exportar",COUNTIFS('Selecciones'!$B$6:$B$8,${cell},'Selecciones'!$C$6:$C$8,"Sí")>0,IF('Panel'!$C$8="Todos",TRUE,IF('Panel'!$C$8="Selección múltiple",COUNTIFS('Selecciones'!$B$6:$B$8,${cell},'Selecciones'!$D$6:$D$8,"Sí")>0,${cell}='Panel'!$C$8)))`;}
function dateFormula(cell){return `IF('Panel'!$C$7="Al exportar",COUNTIFS('Selecciones'!$B$12:$B$14,${cell},'Selecciones'!$C$12:$C$14,"Sí")>0,IF('Panel'!$C$9="Todas",TRUE,COUNTIFS('Selecciones'!$B$12:$B$14,${cell},'Selecciones'!$D$12:$D$14,"Sí")>0))`;}
for(let r=6;r<=end;r++){
  formula(shifts,`I${r}`,`=--(${committeeFormula(`D${r}`)})`);
  formula(shifts,`J${r}`,`=--(${dateFormula(`E${r}`)})`);
  formula(shifts,`K${r}`,`=I${r}*J${r}*IF('Panel'!$C$7="Al exportar",1,IF('Panel'!$C$10="Todos",1,--(G${r}='Panel'!$C$10)))`);
}
title(targets,'Requerimientos','Dos plazas por comité, fecha y turno · El estado no modifica la meta','I',end);
header(targets,'A5:I5');
range(targets,`A5:E${end}`).values=[['Registro','Comité','Fecha','Turno','Requeridos'],...rows.map(r=>[r[0],r[3],r[4],r[5],2])];
range(targets,'F5:I5').values=[['Comité coincide','Fecha coincide','Coincide','Meta filtrada']];
range(targets,`C6:C${end}`).setNumberFormat('dd mmm yyyy');
const targetTable = targets.tables.add(`A5:E${end}`,true,'BaseMetas');
targetTable.style='TableStyleMedium2';targetTable.showFilterButton=true;targets.freezePanes.freezeRows(5);
range(targets,'A1:A23').format.columnWidth=13;
range(targets,'C6:C23').format.horizontalAlignment='center';
for(let r=6;r<=end;r++){
  formula(targets,`F${r}`,`=--(${committeeFormula(`B${r}`)})`);formula(targets,`G${r}`,`=--(${dateFormula(`C${r}`)})`);
  formula(targets,`H${r}`,`=F${r}*G${r}`);formula(targets,`I${r}`,`=E${r}*H${r}`);
}
title(detail,'Detalle del panel','Filas que cumplen los controles actuales · Datos ficticios','H',24);
range(detail,'C1:C24').format.columnWidth=25;
range(detail,'A1:A24').format.columnWidth=13;
range(detail,'E6:E24').format.horizontalAlignment='center';
header(detail,'A5:H5');range(detail,'A5:H5').values=[['Registro','Persona ID','Voluntario','Comité','Fecha','Turno','Estado','Minutos']];
range(detail,'E6:E24').setNumberFormat('dd mmm yyyy');
formula(detail,'A6',`=FILTER('Turnos'!A6:H${end},'Turnos'!K6:K${end}=1,"Sin registros")`);
detail.freezePanes.freezeRows(5);

// Auditable chart source on the requirements sheet, away from source tables.
header(targets,'K5:L5');range(targets,'K5:L8').values=[['Comité','Asignados'],...committees.map(c=>[c,null])];
range(targets,'K1:L23').format={font:{name:'Aptos Narrow',size:11,color:color.ink},columnWidth:18};
header(targets,'K5:L5');
for(let i=0;i<3;i++)formula(targets,`L${6+i}`,`=SUMIFS(${sr('K')},${sr('D')},K${6+i})`);
const chart=panel.charts.add('bar', [targets.getRange('K5:K8'), targets.getRange('L5:L8')]);
chart.title='Turnos por comité';chart.setPosition('F15','K30');chart.hasLegend=false;
chart.titleTextStyle.typeface='Aptos Narrow';chart.titleTextStyle.fontSize=16;
chart.xAxis={axisType:'textAxis',majorGridlines:null,minorGridlines:null,textStyle:{typeface:'Aptos Narrow',fontSize:12}};
chart.yAxis={majorUnit:1,numberFormatCode:'0',numberFormatSourceLinked:false,textStyle:{typeface:'Aptos Narrow',fontSize:12}};
chart.series.items[0].fill=color.accent;

const scenarios=[];
async function check(label,expected){
  const recalcStarted = performance.now();
  const values=range(panel,'C16:C21').values.flat();
  const recalculationMs = performance.now() - recalcStarted;
  expected.forEach((v,i)=>assert(Math.abs(values[i]-v)<1e-8,`${label} metric ${i}: ${values[i]} != ${v}`));
  scenarios.push({label,actual:values,expected,recalculationMs});
}
await check('Original: dos comités, fechas separadas',[8,4,480/1440,16,8,0.5]);
value(panel,'C7','Personalizados');await check('Todos',[18,9,1080/1440,36,18,0.5]);
value(panel,'C8','Seguridad');await check('Seguridad',[6,3,360/1440,12,6,0.5]);
value(panel,'C10','Asistió');await check('Asistió conserva meta',[3,3,360/1440,12,9,0.25]);
value(panel,'C8','Selección múltiple');value(panel,'C9','Fechas seleccionadas');value(panel,'C10','Todos');
await check('Múltiple y fechas separadas',[8,4,480/1440,16,8,0.5]);
range(selections,'D6:D8').values=[['No'],['No'],['No']];
const empty=range(panel,'C16:C20').values.flat();assert.deepEqual(empty,[0,0,0,0,0]);
assert.equal(range(detail,'A6').values[0][0],'Sin registros');
range(selections,'D6:D8').values=[['Sí'],['Sí'],['No']];value(panel,'C7','Al exportar');
await check('Restaurar original',[8,4,480/1440,16,8,0.5]);
// Clear cached spill cells from previous scenario sizes before the final export.
range(detail,'A6:H24').clear({applyTo:'contents'});
formula(detail,'A6',`=FILTER('Turnos'!A6:H${end},'Turnos'!K6:K${end}=1,"Sin registros")`);
range(panel,'D16:D21').format.horizontalAlignment='center';
range(selections,'B12:B14').format.horizontalAlignment='left';
console.log((await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!',options:{useRegex:true,maxResults:30},summary:'Errores de fórmulas'})).ndjson);
await fs.mkdir(out,{recursive:true});
const rendered={Panel:'A1:K34',Selecciones:'A1:G20',Detalle:'A1:H16',Turnos:'A1:K14',Metas:'A1:L14'};
for(const name of names){
  const preview=await wb.render({sheetName:name,range:rendered[name],scale:1.5,format:'png'});
  await fs.writeFile(`${out}/${name}.png`,new Uint8Array(await preview.arrayBuffer()));
}
const xlsx=await SpreadsheetFile.exportXlsx(wb);await xlsx.save(`${out}/Prototipo-reportes-Microsoft365.xlsx`);
await fs.writeFile(`${out}/validation.json`,JSON.stringify({scenarios,empty,buildSeconds:(performance.now()-started)/1000,fileBytes:(await fs.stat(`${out}/Prototipo-reportes-Microsoft365.xlsx`)).size,maxRssKiB:process.resourceUsage().maxRSS,chart:{formula:chart.series.items[0].formula,categoryFormula:chart.series.items[0].categoryFormula}},null,2));
console.log(JSON.stringify({output:`${out}/Prototipo-reportes-Microsoft365.xlsx`,seconds:(performance.now()-started)/1000,scenarios:scenarios.length}));
