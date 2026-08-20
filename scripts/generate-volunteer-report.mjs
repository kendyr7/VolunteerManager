import ExcelJS from 'exceljs';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Faltan variables de entorno de Supabase en .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Paleta de Colores de la Aplicación (extraída de DESIGN.md y Tailwind)
const COLORS = {
  primary: '4D7CFE',        // Azul principal (#4D7CFE)
  primaryDark: '2A5BD7',    // Azul oscuro institucional
  primaryLight: 'EBF1FF',   // Azul tenue para acentos y chips (rgba(77, 124, 254, 0.15))
  primaryBorder: 'C2D6FF',  // Borde azul tenue
  darkText: '252631',       // Texto principal oscuro (#252631)
  secondaryText: '778CA2',  // Texto secundario gris (#778CA2)
  success: '6DD230',        // Verde de éxito (#6DD230)
  successLight: 'F0F9EB',   // Fondo verde suave
  successText: '2E7D32',    // Texto verde oscuro
  bgApp: 'F8FAFB',          // Fondo principal de la app (#F8FAFB)
  bgMuted: 'F2F4F6',        // Fondo de filas alternas (#F2F4F6)
  border: 'E8ECEF',         // Borde estándar (#E8ECEF)
  borderDark: 'D0D7DE',     // Borde marcado
  white: 'FFFFFF',
  danger: 'FE4D97',         // Rosa alerta (#FE4D97)
  dangerLight: 'FFEBF3',
  dangerText: 'C2185B',
};

const FONT_FAMILY = 'Lexend';

const thinBorder = {
  top: { style: 'thin', color: { argb: 'FFE8ECEF' } },
  left: { style: 'thin', color: { argb: 'FFE8ECEF' } },
  bottom: { style: 'thin', color: { argb: 'FFE8ECEF' } },
  right: { style: 'thin', color: { argb: 'FFE8ECEF' } },
};

const totalBorder = {
  top: { style: 'thin', color: { argb: 'FF252631' } },
  bottom: { style: 'double', color: { argb: 'FF252631' } },
  left: { style: 'thin', color: { argb: 'FFE8ECEF' } },
  right: { style: 'thin', color: { argb: 'FFE8ECEF' } },
};

async function generateReport() {
  console.log('Obteniendo datos de Supabase...');

  // 1. Obtener Comités
  const { data: committees, error: commError } = await supabase
    .from('committees')
    .select('*')
    .order('name');

  if (commError) {
    console.error('Error al obtener comités:', commError);
    return;
  }

  const committeeMap = new Map();
  committees.forEach(c => committeeMap.set(c.id, c.name));

  // 2. Obtener Voluntarios
  const { data: volunteers, error: volError } = await supabase
    .from('volunteers')
    .select('*')
    .order('created_at', { ascending: true });

  if (volError) {
    console.error('Error al obtener voluntarios:', volError);
    return;
  }

  console.log(`Total de voluntarios recuperados: ${volunteers.length}`);

  const YESTERDAY_STR = '2026-08-16';

  const committeeOrder = [
    'Guía',
    'Facilidades Físicas',
    'Seguridad',
    'Parqueo y Transporte',
    'Tecnología',
    'Historia',
    'Recepción',
    'Traducción',
    'Sin Comité',
  ];

  // Estructuras de conteo
  const statsDB = {};
  const statsReclassified = {};
  committeeOrder.forEach(name => {
    statsDB[name] = { before: 0, yesterday: 0, today: 0, total: 0 };
    statsReclassified[name] = { before: 0, yesterday: 0, today: 0, total: 0 };
  });

  const yesterdayVolunteers = [];
  const historyByDate = {};

  for (const v of volunteers) {
    const rawComName = committeeMap.get(v.committee_id) || 'Sin Comité';
    const isTransName = (v.first_name || '').includes('Traducción') || (v.last_name || '').includes('Traducción');
    const cleanFirstName = (v.first_name || '').replace(/^\(Traducción\)\s*/i, '').trim();

    const d = new Date(v.created_at);
    const localDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Managua' }).format(d);
    const localTimeStr = new Intl.DateTimeFormat('es-NI', {
      timeZone: 'America/Managua',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }).format(d);

    historyByDate[localDateStr] = (historyByDate[localDateStr] || 0) + 1;

    // Asignación BD directa
    const comDB = statsDB[rawComName] ? rawComName : 'Sin Comité';
    statsDB[comDB].total++;

    // Asignación Reclasificada
    const comReclass = isTransName ? 'Traducción' : comDB;
    statsReclassified[comReclass].total++;

    if (localDateStr < YESTERDAY_STR) {
      statsDB[comDB].before++;
      statsReclassified[comReclass].before++;
    } else if (localDateStr === YESTERDAY_STR) {
      statsDB[comDB].yesterday++;
      statsReclassified[comReclass].yesterday++;

      yesterdayVolunteers.push({
        ...v,
        cleanFullName: `${cleanFirstName} ${v.last_name || ''}`.trim(),
        originalFullName: `${v.first_name || ''} ${v.last_name || ''}`.trim(),
        committeeDB: comDB,
        committeeReclass: comReclass,
        isTranslationTag: isTransName,
        localDateStr,
        localTimeStr,
      });
    } else {
      statsDB[comDB].today++;
      statsReclassified[comReclass].today++;
    }
  }

  const totalBefore = Object.values(statsDB).reduce((acc, s) => acc + s.before, 0);
  const totalYesterday = Object.values(statsDB).reduce((acc, s) => acc + s.yesterday, 0);
  const totalToday = Object.values(statsDB).reduce((acc, s) => acc + s.today, 0);
  const totalCumYesterday = totalBefore + totalYesterday;
  const totalAll = totalBefore + totalYesterday + totalToday;
  const globalPct = totalBefore > 0 ? totalYesterday / totalBefore : 0;

  // Crear Workbook
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Volunteer Manager';
  workbook.lastModifiedBy = 'Volunteer Manager';
  workbook.created = new Date();
  workbook.modified = new Date();

  // =========================================================================
  // HOJA 1: RESUMEN EJECUTIVO POR COMITÉ
  // =========================================================================
  const wsSummary = workbook.addWorksheet('Resumen por Comité', {
    views: [{ showGridLines: true }],
    properties: { defaultRowHeight: 22 },
  });

  wsSummary.columns = [
    { key: 'colA', width: 4 },   // Margen
    { key: 'colB', width: 6 },   // N°
    { key: 'colC', width: 28 },  // Comité
    { key: 'colD', width: 25 },  // Antes de Ayer
    { key: 'colE', width: 22 },  // Nuevos Ayer
    { key: 'colF', width: 25 },  // Total Hasta Ayer
    { key: 'colG', width: 22 },  // % Crecimiento
    { key: 'colH', width: 22 },  // % Participación
    { key: 'colI', width: 20 },  // Total Actual
    { key: 'colJ', width: 4 },   // Margen
  ];

  // Header Banner
  wsSummary.mergeCells('B2:I2');
  const bannerCell = wsSummary.getCell('B2');
  bannerCell.value = 'INFORME COMPLETO DE INGRESOS - VOLUNTEER MANAGER';
  bannerCell.font = { name: FONT_FAMILY, size: 16, bold: true, color: { argb: 'FF' + COLORS.darkText } };
  bannerCell.alignment = { vertical: 'middle', horizontal: 'left' };
  wsSummary.getRow(2).height = 28;

  wsSummary.mergeCells('B3:I3');
  const subBanner = wsSummary.getCell('B3');
  subBanner.value = 'Corte de Nuevos Ingresos: Domingo, 16 de Agosto de 2026 (Día de Ayer) • Zona Horaria: America/Managua (UTC-6)';
  subBanner.font = { name: FONT_FAMILY, size: 10, color: { argb: 'FF' + COLORS.secondaryText } };
  subBanner.alignment = { vertical: 'middle', horizontal: 'left' };
  wsSummary.getRow(3).height = 18;

  // KPI CARDS
  const kpis = [
    { startCol: 'B', endCol: 'C', label: 'VOLUNTARIOS ANTES DE AYER', val: totalBefore, format: '#,##0', note: 'Base al 15 de Agosto', bg: COLORS.bgMuted, textCol: COLORS.darkText },
    { startCol: 'D', endCol: 'E', label: 'NUEVOS INGRESOS AYER', val: totalYesterday, format: '+#,##0', note: 'Domingo 16 de Agosto', bg: COLORS.primaryLight, textCol: COLORS.primaryDark },
    { startCol: 'F', endCol: 'G', label: 'CRECIMIENTO PORCENTUAL', val: globalPct, format: '+0.00%', note: 'Aumento neto sobre la base', bg: COLORS.successLight, textCol: COLORS.successText },
    { startCol: 'H', endCol: 'I', label: 'TOTAL HASTA AYER', val: totalCumYesterday, format: '#,##0', note: '826 con registros de hoy', bg: 'FFFFFF', textCol: COLORS.darkText, borderHigh: true },
  ];

  const kRow1 = 5;
  const kRow2 = 6;
  const kRow3 = 7;

  kpis.forEach(kpi => {
    wsSummary.mergeCells(`${kpi.startCol}${kRow1}:${kpi.endCol}${kRow1}`);
    wsSummary.mergeCells(`${kpi.startCol}${kRow2}:${kpi.endCol}${kRow2}`);
    wsSummary.mergeCells(`${kpi.startCol}${kRow3}:${kpi.endCol}${kRow3}`);

    const cH = wsSummary.getCell(`${kpi.startCol}${kRow1}`);
    cH.value = kpi.label;
    cH.font = { name: FONT_FAMILY, size: 8.5, bold: true, color: { argb: 'FF' + COLORS.secondaryText } };
    cH.alignment = { horizontal: 'center', vertical: 'middle' };

    const cV = wsSummary.getCell(`${kpi.startCol}${kRow2}`);
    cV.value = kpi.val;
    cV.numFmt = kpi.format;
    cV.font = { name: FONT_FAMILY, size: 18, bold: true, color: { argb: 'FF' + kpi.textCol } };
    cV.alignment = { horizontal: 'center', vertical: 'middle' };

    const cF = wsSummary.getCell(`${kpi.startCol}${kRow3}`);
    cF.value = kpi.note;
    cF.font = { name: FONT_FAMILY, size: 8, color: { argb: 'FF' + COLORS.secondaryText }, italic: true };
    cF.alignment = { horizontal: 'center', vertical: 'middle' };

    const cols = [kpi.startCol, kpi.endCol];
    for (let r = kRow1; r <= kRow3; r++) {
      for (const c of cols) {
        const cell = wsSummary.getCell(`${c}${r}`);
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + kpi.bg } };
        cell.border = {
          top: r === kRow1 ? { style: 'thin', color: { argb: 'FF' + (kpi.borderHigh ? COLORS.primary : COLORS.borderDark) } } : undefined,
          bottom: r === kRow3 ? { style: 'thin', color: { argb: 'FF' + (kpi.borderHigh ? COLORS.primary : COLORS.borderDark) } } : undefined,
          left: c === kpi.startCol ? { style: 'thin', color: { argb: 'FF' + (kpi.borderHigh ? COLORS.primary : COLORS.borderDark) } } : undefined,
          right: c === kpi.endCol ? { style: 'thin', color: { argb: 'FF' + (kpi.borderHigh ? COLORS.primary : COLORS.borderDark) } } : undefined,
        };
      }
    }
  });

  wsSummary.getRow(kRow1).height = 18;
  wsSummary.getRow(kRow2).height = 26;
  wsSummary.getRow(kRow3).height = 16;

  // ================= TABLA 1: SEGÚN COMITÉ ASIGNADO EN BASE DE DATOS =================
  const sectionTitle1Row = 9;
  wsSummary.mergeCells(`B${sectionTitle1Row}:I${sectionTitle1Row}`);
  const sec1 = wsSummary.getCell(`B${sectionTitle1Row}`);
  sec1.value = '1. RESUMEN POR COMITÉ (ASIGNACIÓN DIRECTA EN BASE DE DATOS)';
  sec1.font = { name: FONT_FAMILY, size: 11, bold: true, color: { argb: 'FF' + COLORS.primaryDark } };
  wsSummary.getRow(sectionTitle1Row).height = 24;

  const hRow1 = 10;
  wsSummary.getRow(hRow1).height = 26;
  const headers = [
    { col: 'B', title: 'N°', align: 'center' },
    { col: 'C', title: 'Comité', align: 'left' },
    { col: 'D', title: 'Antes de Ayer (< 16 Ago)', align: 'right' },
    { col: 'E', title: 'Nuevos Ayer (16 Ago)', align: 'right' },
    { col: 'F', title: 'Total Hasta Ayer', align: 'right' },
    { col: 'G', title: '% Incremento', align: 'right' },
    { col: 'H', title: '% Participación', align: 'right' },
    { col: 'I', title: 'Total Actual (+Hoy)', align: 'right' },
  ];

  headers.forEach(h => {
    const cell = wsSummary.getCell(`${h.col}${hRow1}`);
    cell.value = h.title;
    cell.font = { name: FONT_FAMILY, size: 9.5, bold: true, color: { argb: 'FF' + COLORS.white } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + COLORS.primary } };
    cell.alignment = { horizontal: h.align, vertical: 'middle', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF' + COLORS.primaryDark } },
      bottom: { style: 'thin', color: { argb: 'FF' + COLORS.primaryDark } },
      left: { style: 'thin', color: { argb: 'FF' + COLORS.primaryDark } },
      right: { style: 'thin', color: { argb: 'FF' + COLORS.primaryDark } },
    };
  });

  let curRow = hRow1 + 1;
  let rowIdx = 1;
  const startDataRow1 = curRow;

  committeeOrder.forEach(name => {
    const s = statsDB[name];
    const isEven = rowIdx % 2 === 0;
    const rowBg = isEven ? COLORS.bgMuted : COLORS.white;

    wsSummary.getRow(curRow).height = 22;

    const cB = wsSummary.getCell(`B${curRow}`);
    cB.value = rowIdx++;
    cB.font = { name: FONT_FAMILY, size: 9, color: { argb: 'FF' + COLORS.secondaryText } };
    cB.alignment = { horizontal: 'center', vertical: 'middle' };
    cB.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + rowBg } };
    cB.border = thinBorder;

    const cC = wsSummary.getCell(`C${curRow}`);
    cC.value = name + (name === 'Guía' ? ' (Incluye 11 con tag Traducción)' : '');
    cC.font = { name: FONT_FAMILY, size: 9.5, bold: true, color: { argb: 'FF' + COLORS.darkText } };
    cC.alignment = { horizontal: 'left', vertical: 'middle' };
    cC.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + rowBg } };
    cC.border = thinBorder;

    const cD = wsSummary.getCell(`D${curRow}`);
    cD.value = s.before;
    cD.numFmt = '#,##0';
    cD.font = { name: FONT_FAMILY, size: 9.5, color: { argb: 'FF' + COLORS.darkText } };
    cD.alignment = { horizontal: 'right', vertical: 'middle' };
    cD.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + rowBg } };
    cD.border = thinBorder;

    const cE = wsSummary.getCell(`E${curRow}`);
    cE.value = s.yesterday;
    cE.numFmt = '#,##0';
    cE.font = {
      name: FONT_FAMILY,
      size: 9.5,
      bold: s.yesterday > 0,
      color: { argb: s.yesterday > 0 ? 'FF' + COLORS.primaryDark : 'FF' + COLORS.secondaryText },
    };
    cE.alignment = { horizontal: 'right', vertical: 'middle' };
    cE.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: s.yesterday > 0 ? 'FF' + COLORS.primaryLight : 'FF' + rowBg },
    };
    cE.border = thinBorder;

    const cF = wsSummary.getCell(`F${curRow}`);
    cF.value = { formula: `D${curRow}+E${curRow}`, result: s.before + s.yesterday };
    cF.numFmt = '#,##0';
    cF.font = { name: FONT_FAMILY, size: 9.5, bold: true, color: { argb: 'FF' + COLORS.darkText } };
    cF.alignment = { horizontal: 'right', vertical: 'middle' };
    cF.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + rowBg } };
    cF.border = thinBorder;

    const cG = wsSummary.getCell(`G${curRow}`);
    const pct = s.before > 0 ? s.yesterday / s.before : (s.yesterday > 0 ? 1 : 0);
    cG.value = { formula: `IF(D${curRow}>0, E${curRow}/D${curRow}, IF(E${curRow}>0, 1, 0))`, result: pct };
    cG.numFmt = '+0.00%;-0.00%;0.00%';
    cG.font = {
      name: FONT_FAMILY,
      size: 9.5,
      bold: s.yesterday > 0,
      color: { argb: s.yesterday > 0 ? 'FF' + COLORS.successText : 'FF' + COLORS.secondaryText },
    };
    cG.alignment = { horizontal: 'right', vertical: 'middle' };
    cG.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: s.yesterday > 0 ? 'FF' + COLORS.successLight : 'FF' + rowBg },
    };
    cG.border = thinBorder;

    const endDataRow1 = hRow1 + committeeOrder.length;
    const totRow1Index = endDataRow1 + 1;
    const cH = wsSummary.getCell(`H${curRow}`);
    const part = totalYesterday > 0 ? s.yesterday / totalYesterday : 0;
    cH.value = { formula: `IF($E$${totRow1Index}>0, E${curRow}/$E$${totRow1Index}, 0)`, result: part };
    cH.numFmt = '0.00%';
    cH.font = { name: FONT_FAMILY, size: 9.5, color: { argb: 'FF' + COLORS.darkText } };
    cH.alignment = { horizontal: 'right', vertical: 'middle' };
    cH.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + rowBg } };
    cH.border = thinBorder;

    const cI = wsSummary.getCell(`I${curRow}`);
    cI.value = s.total;
    cI.numFmt = '#,##0';
    cI.font = { name: FONT_FAMILY, size: 9.5, color: { argb: 'FF' + COLORS.darkText } };
    cI.alignment = { horizontal: 'right', vertical: 'middle' };
    cI.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + rowBg } };
    cI.border = thinBorder;

    curRow++;
  });

  // Total Tabla 1
  const totRow1 = curRow;
  wsSummary.getRow(totRow1).height = 25;

  wsSummary.mergeCells(`B${totRow1}:C${totRow1}`);
  const cTotL1 = wsSummary.getCell(`B${totRow1}`);
  cTotL1.value = 'TOTAL GENERAL (BD)';
  cTotL1.font = { name: FONT_FAMILY, size: 10, bold: true, color: { argb: 'FF' + COLORS.darkText } };
  cTotL1.alignment = { horizontal: 'left', vertical: 'middle' };
  cTotL1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + COLORS.primaryLight } };
  cTotL1.border = totalBorder;

  const cTotD1 = wsSummary.getCell(`D${totRow1}`);
  cTotD1.value = { formula: `SUM(D${startDataRow1}:D${totRow1 - 1})`, result: totalBefore };
  cTotD1.numFmt = '#,##0';
  cTotD1.font = { name: FONT_FAMILY, size: 10, bold: true, color: { argb: 'FF' + COLORS.darkText } };
  cTotD1.alignment = { horizontal: 'right', vertical: 'middle' };
  cTotD1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + COLORS.primaryLight } };
  cTotD1.border = totalBorder;

  const cTotE1 = wsSummary.getCell(`E${totRow1}`);
  cTotE1.value = { formula: `SUM(E${startDataRow1}:E${totRow1 - 1})`, result: totalYesterday };
  cTotE1.numFmt = '+#,##0';
  cTotE1.font = { name: FONT_FAMILY, size: 10, bold: true, color: { argb: 'FF' + COLORS.primaryDark } };
  cTotE1.alignment = { horizontal: 'right', vertical: 'middle' };
  cTotE1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + COLORS.primaryLight } };
  cTotE1.border = totalBorder;

  const cTotF1 = wsSummary.getCell(`F${totRow1}`);
  cTotF1.value = { formula: `SUM(F${startDataRow1}:F${totRow1 - 1})`, result: totalCumYesterday };
  cTotF1.numFmt = '#,##0';
  cTotF1.font = { name: FONT_FAMILY, size: 10, bold: true, color: { argb: 'FF' + COLORS.darkText } };
  cTotF1.alignment = { horizontal: 'right', vertical: 'middle' };
  cTotF1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + COLORS.primaryLight } };
  cTotF1.border = totalBorder;

  const cTotG1 = wsSummary.getCell(`G${totRow1}`);
  cTotG1.value = { formula: `IF(D${totRow1}>0, E${totRow1}/D${totRow1}, 0)`, result: globalPct };
  cTotG1.numFmt = '+0.00%';
  cTotG1.font = { name: FONT_FAMILY, size: 10, bold: true, color: { argb: 'FF' + COLORS.successText } };
  cTotG1.alignment = { horizontal: 'right', vertical: 'middle' };
  cTotG1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + COLORS.primaryLight } };
  cTotG1.border = totalBorder;

  const cTotH1 = wsSummary.getCell(`H${totRow1}`);
  cTotH1.value = { formula: `SUM(H${startDataRow1}:H${totRow1 - 1})`, result: 1 };
  cTotH1.numFmt = '0.00%';
  cTotH1.font = { name: FONT_FAMILY, size: 10, bold: true, color: { argb: 'FF' + COLORS.darkText } };
  cTotH1.alignment = { horizontal: 'right', vertical: 'middle' };
  cTotH1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + COLORS.primaryLight } };
  cTotH1.border = totalBorder;

  const cTotI1 = wsSummary.getCell(`I${totRow1}`);
  cTotI1.value = { formula: `SUM(I${startDataRow1}:I${totRow1 - 1})`, result: totalAll };
  cTotI1.numFmt = '#,##0';
  cTotI1.font = { name: FONT_FAMILY, size: 10, bold: true, color: { argb: 'FF' + COLORS.darkText } };
  cTotI1.alignment = { horizontal: 'right', vertical: 'middle' };
  cTotI1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + COLORS.primaryLight } };
  cTotI1.border = totalBorder;

  // ================= TABLA 2: CON RECLASIFICACIÓN DE TRADUCCIÓN =================
  curRow += 3;
  const sectionTitle2Row = curRow;
  wsSummary.mergeCells(`B${sectionTitle2Row}:I${sectionTitle2Row}`);
  const sec2 = wsSummary.getCell(`B${sectionTitle2Row}`);
  sec2.value = '2. RESUMEN RECLASIFICADO (SEPARANDO VOLUNTARIOS DE TRADUCCIÓN)';
  sec2.font = { name: FONT_FAMILY, size: 11, bold: true, color: { argb: 'FF' + COLORS.primaryDark } };
  wsSummary.getRow(sectionTitle2Row).height = 24;

  curRow++;
  const hRow2 = curRow;
  wsSummary.getRow(hRow2).height = 26;

  headers.forEach(h => {
    const cell = wsSummary.getCell(`${h.col}${hRow2}`);
    cell.value = h.title;
    cell.font = { name: FONT_FAMILY, size: 9.5, bold: true, color: { argb: 'FF' + COLORS.white } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + COLORS.primaryDark } };
    cell.alignment = { horizontal: h.align, vertical: 'middle', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF' + COLORS.darkText } },
      bottom: { style: 'thin', color: { argb: 'FF' + COLORS.darkText } },
      left: { style: 'thin', color: { argb: 'FF' + COLORS.darkText } },
      right: { style: 'thin', color: { argb: 'FF' + COLORS.darkText } },
    };
  });

  curRow++;
  const startDataRow2 = curRow;
  rowIdx = 1;

  committeeOrder.forEach(name => {
    const s = statsReclassified[name];
    const isEven = rowIdx % 2 === 0;
    const rowBg = isEven ? COLORS.bgMuted : COLORS.white;

    wsSummary.getRow(curRow).height = 22;

    const cB = wsSummary.getCell(`B${curRow}`);
    cB.value = rowIdx++;
    cB.font = { name: FONT_FAMILY, size: 9, color: { argb: 'FF' + COLORS.secondaryText } };
    cB.alignment = { horizontal: 'center', vertical: 'middle' };
    cB.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + rowBg } };
    cB.border = thinBorder;

    const cC = wsSummary.getCell(`C${curRow}`);
    cC.value = name;
    cC.font = { name: FONT_FAMILY, size: 9.5, bold: true, color: { argb: 'FF' + COLORS.darkText } };
    cC.alignment = { horizontal: 'left', vertical: 'middle' };
    cC.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + rowBg } };
    cC.border = thinBorder;

    const cD = wsSummary.getCell(`D${curRow}`);
    cD.value = s.before;
    cD.numFmt = '#,##0';
    cD.font = { name: FONT_FAMILY, size: 9.5, color: { argb: 'FF' + COLORS.darkText } };
    cD.alignment = { horizontal: 'right', vertical: 'middle' };
    cD.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + rowBg } };
    cD.border = thinBorder;

    const cE = wsSummary.getCell(`E${curRow}`);
    cE.value = s.yesterday;
    cE.numFmt = '#,##0';
    cE.font = {
      name: FONT_FAMILY,
      size: 9.5,
      bold: s.yesterday > 0,
      color: { argb: s.yesterday > 0 ? 'FF' + COLORS.primaryDark : 'FF' + COLORS.secondaryText },
    };
    cE.alignment = { horizontal: 'right', vertical: 'middle' };
    cE.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: s.yesterday > 0 ? 'FF' + COLORS.primaryLight : 'FF' + rowBg },
    };
    cE.border = thinBorder;

    const cF = wsSummary.getCell(`F${curRow}`);
    cF.value = { formula: `D${curRow}+E${curRow}`, result: s.before + s.yesterday };
    cF.numFmt = '#,##0';
    cF.font = { name: FONT_FAMILY, size: 9.5, bold: true, color: { argb: 'FF' + COLORS.darkText } };
    cF.alignment = { horizontal: 'right', vertical: 'middle' };
    cF.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + rowBg } };
    cF.border = thinBorder;

    const cG = wsSummary.getCell(`G${curRow}`);
    const pct = s.before > 0 ? s.yesterday / s.before : (s.yesterday > 0 ? 1 : 0);
    cG.value = { formula: `IF(D${curRow}>0, E${curRow}/D${curRow}, IF(E${curRow}>0, 1, 0))`, result: pct };
    cG.numFmt = '+0.00%;-0.00%;0.00%';
    cG.font = {
      name: FONT_FAMILY,
      size: 9.5,
      bold: s.yesterday > 0,
      color: { argb: s.yesterday > 0 ? 'FF' + COLORS.successText : 'FF' + COLORS.secondaryText },
    };
    cG.alignment = { horizontal: 'right', vertical: 'middle' };
    cG.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: s.yesterday > 0 ? 'FF' + COLORS.successLight : 'FF' + rowBg },
    };
    cG.border = thinBorder;

    const endDataRow2 = hRow2 + committeeOrder.length;
    const totRow2Index = endDataRow2 + 1;
    const cH = wsSummary.getCell(`H${curRow}`);
    const part = totalYesterday > 0 ? s.yesterday / totalYesterday : 0;
    cH.value = { formula: `IF($E$${totRow2Index}>0, E${curRow}/$E$${totRow2Index}, 0)`, result: part };
    cH.numFmt = '0.00%';
    cH.font = { name: FONT_FAMILY, size: 9.5, color: { argb: 'FF' + COLORS.darkText } };
    cH.alignment = { horizontal: 'right', vertical: 'middle' };
    cH.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + rowBg } };
    cH.border = thinBorder;

    const cI = wsSummary.getCell(`I${curRow}`);
    cI.value = s.total;
    cI.numFmt = '#,##0';
    cI.font = { name: FONT_FAMILY, size: 9.5, color: { argb: 'FF' + COLORS.darkText } };
    cI.alignment = { horizontal: 'right', vertical: 'middle' };
    cI.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + rowBg } };
    cI.border = thinBorder;

    curRow++;
  });

  // Total Tabla 2
  const totRow2 = curRow;
  wsSummary.getRow(totRow2).height = 25;

  wsSummary.mergeCells(`B${totRow2}:C${totRow2}`);
  const cTotL2 = wsSummary.getCell(`B${totRow2}`);
  cTotL2.value = 'TOTAL GENERAL (RECLASIFICADO)';
  cTotL2.font = { name: FONT_FAMILY, size: 10, bold: true, color: { argb: 'FF' + COLORS.darkText } };
  cTotL2.alignment = { horizontal: 'left', vertical: 'middle' };
  cTotL2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + COLORS.primaryLight } };
  cTotL2.border = totalBorder;

  const cTotD2 = wsSummary.getCell(`D${totRow2}`);
  cTotD2.value = { formula: `SUM(D${startDataRow2}:D${totRow2 - 1})`, result: totalBefore };
  cTotD2.numFmt = '#,##0';
  cTotD2.font = { name: FONT_FAMILY, size: 10, bold: true, color: { argb: 'FF' + COLORS.darkText } };
  cTotD2.alignment = { horizontal: 'right', vertical: 'middle' };
  cTotD2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + COLORS.primaryLight } };
  cTotD2.border = totalBorder;

  const cTotE2 = wsSummary.getCell(`E${totRow2}`);
  cTotE2.value = { formula: `SUM(E${startDataRow2}:E${totRow2 - 1})`, result: totalYesterday };
  cTotE2.numFmt = '+#,##0';
  cTotE2.font = { name: FONT_FAMILY, size: 10, bold: true, color: { argb: 'FF' + COLORS.primaryDark } };
  cTotE2.alignment = { horizontal: 'right', vertical: 'middle' };
  cTotE2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + COLORS.primaryLight } };
  cTotE2.border = totalBorder;

  const cTotF2 = wsSummary.getCell(`F${totRow2}`);
  cTotF2.value = { formula: `SUM(F${startDataRow2}:F${totRow2 - 1})`, result: totalCumYesterday };
  cTotF2.numFmt = '#,##0';
  cTotF2.font = { name: FONT_FAMILY, size: 10, bold: true, color: { argb: 'FF' + COLORS.darkText } };
  cTotF2.alignment = { horizontal: 'right', vertical: 'middle' };
  cTotF2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + COLORS.primaryLight } };
  cTotF2.border = totalBorder;

  const cTotG2 = wsSummary.getCell(`G${totRow2}`);
  cTotG2.value = { formula: `IF(D${totRow2}>0, E${totRow2}/D${totRow2}, 0)`, result: globalPct };
  cTotG2.numFmt = '+0.00%';
  cTotG2.font = { name: FONT_FAMILY, size: 10, bold: true, color: { argb: 'FF' + COLORS.successText } };
  cTotG2.alignment = { horizontal: 'right', vertical: 'middle' };
  cTotG2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + COLORS.primaryLight } };
  cTotG2.border = totalBorder;

  const cTotH2 = wsSummary.getCell(`H${totRow2}`);
  cTotH2.value = { formula: `SUM(H${startDataRow2}:H${totRow2 - 1})`, result: 1 };
  cTotH2.numFmt = '0.00%';
  cTotH2.font = { name: FONT_FAMILY, size: 10, bold: true, color: { argb: 'FF' + COLORS.darkText } };
  cTotH2.alignment = { horizontal: 'right', vertical: 'middle' };
  cTotH2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + COLORS.primaryLight } };
  cTotH2.border = totalBorder;

  const cTotI2 = wsSummary.getCell(`I${totRow2}`);
  cTotI2.value = { formula: `SUM(I${startDataRow2}:I${totRow2 - 1})`, result: totalAll };
  cTotI2.numFmt = '#,##0';
  cTotI2.font = { name: FONT_FAMILY, size: 10, bold: true, color: { argb: 'FF' + COLORS.darkText } };
  cTotI2.alignment = { horizontal: 'right', vertical: 'middle' };
  cTotI2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + COLORS.primaryLight } };
  cTotI2.border = totalBorder;

  // ================= NOTAS FINALES =================
  curRow += 2;
  wsSummary.mergeCells(`B${curRow}:I${curRow}`);
  const noteH = wsSummary.getCell(`B${curRow}`);
  noteH.value = '💡 RESUMEN CLAVE DE INTERPRETACIÓN';
  noteH.font = { name: FONT_FAMILY, size: 10, bold: true, color: { argb: 'FF' + COLORS.primaryDark } };

  const notesList = [
    '• Incremento global del día: Se registraron 88 nuevos voluntarios ayer, representando un crecimiento del +11.96% con respecto a la base previa (736 voluntarios).',
    '• Facilidades Físicas: Fue el comité con mayor volumen y aceleración, sumando 23 personas (+25.84%).',
    '• Recepción: Sumó 6 personas (+23.08%), consolidando su capacidad operativa.',
    '• Guía y Traducción: En la BD están registrados 28 voluntarios bajo Guía, pero 11 de ellos corresponden al equipo de Traducción identificado con la etiqueta "(Traducción)".',
  ];

  notesList.forEach(txt => {
    curRow++;
    wsSummary.mergeCells(`B${curRow}:I${curRow}`);
    const nCell = wsSummary.getCell(`B${curRow}`);
    nCell.value = txt;
    nCell.font = { name: FONT_FAMILY, size: 9, color: { argb: 'FF' + COLORS.darkText } };
  });

  // =========================================================================
  // HOJA 2: DETALLE DE VOLUNTARIOS INGRESADOS AYER
  // =========================================================================
  const wsDetail = workbook.addWorksheet('Voluntarios Ingresados Ayer', {
    views: [{ showGridLines: true, state: 'frozen', ySplit: 4 }],
    properties: { defaultRowHeight: 22 },
  });

  wsDetail.columns = [
    { key: 'colA', width: 4 },
    { key: 'colB', width: 6 },   // N°
    { key: 'colC', width: 34 },  // Nombre Completo
    { key: 'colD', width: 24 },  // Comité BD
    { key: 'colE', width: 20 },  // Comité Reclasificado
    { key: 'colF', width: 22 },  // Estaca
    { key: 'colG', width: 24 },  // Barrio / Congregación
    { key: 'colH', width: 18 },  // Teléfono
    { key: 'colI', width: 10 },  // Edad
    { key: 'colJ', width: 20 },  // Hora de Registro
    { key: 'colK', width: 14 },  // Estado
    { key: 'colL', width: 4 },
  ];

  wsDetail.mergeCells('B2:K2');
  const dTitle = wsDetail.getCell('B2');
  dTitle.value = `LISTADO NOMINAL DE NUEVOS VOLUNTARIOS REGISTRADOS AYER (16 DE AGOSTO) — ${yesterdayVolunteers.length} PERSONAS`;
  dTitle.font = { name: FONT_FAMILY, size: 13, bold: true, color: { argb: 'FF' + COLORS.darkText } };
  dTitle.alignment = { vertical: 'middle', horizontal: 'left' };
  wsDetail.getRow(2).height = 26;

  const detHRow = 4;
  wsDetail.getRow(detHRow).height = 24;

  const detHeaders = [
    { col: 'B', title: 'N°', align: 'center' },
    { col: 'C', title: 'Nombre Completo', align: 'left' },
    { col: 'D', title: 'Comité (BD)', align: 'left' },
    { col: 'E', title: 'Comité (Efectivo)', align: 'left' },
    { col: 'F', title: 'Estaca', align: 'left' },
    { col: 'G', title: 'Barrio / Congregación', align: 'left' },
    { col: 'H', title: 'Teléfono', align: 'center' },
    { col: 'I', title: 'Edad', align: 'center' },
    { col: 'J', title: 'Hora Registro (Local)', align: 'center' },
    { col: 'K', title: 'Estado', align: 'center' },
  ];

  detHeaders.forEach(h => {
    const cell = wsDetail.getCell(`${h.col}${detHRow}`);
    cell.value = h.title;
    cell.font = { name: FONT_FAMILY, size: 9.5, bold: true, color: { argb: 'FF' + COLORS.white } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + COLORS.primary } };
    cell.alignment = { horizontal: h.align, vertical: 'middle' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF' + COLORS.primaryDark } },
      bottom: { style: 'thin', color: { argb: 'FF' + COLORS.primaryDark } },
      left: { style: 'thin', color: { argb: 'FF' + COLORS.primaryDark } },
      right: { style: 'thin', color: { argb: 'FF' + COLORS.primaryDark } },
    };
  });

  let dCurRow = detHRow + 1;
  let dIdx = 1;

  yesterdayVolunteers.forEach(v => {
    const isEven = dIdx % 2 === 0;
    const rowBg = isEven ? COLORS.bgMuted : COLORS.white;

    wsDetail.getRow(dCurRow).height = 20;

    // B: N°
    const cB = wsDetail.getCell(`B${dCurRow}`);
    cB.value = dIdx++;
    cB.font = { name: FONT_FAMILY, size: 9, color: { argb: 'FF' + COLORS.secondaryText } };
    cB.alignment = { horizontal: 'center', vertical: 'middle' };
    cB.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + rowBg } };
    cB.border = thinBorder;

    // C: Nombre
    const cC = wsDetail.getCell(`C${dCurRow}`);
    cC.value = v.cleanFullName;
    cC.font = { name: FONT_FAMILY, size: 9.5, bold: v.isTranslationTag, color: { argb: 'FF' + COLORS.darkText } };
    cC.alignment = { horizontal: 'left', vertical: 'middle' };
    cC.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: v.isTranslationTag ? 'FF' + COLORS.primaryLight : 'FF' + rowBg } };
    cC.border = thinBorder;

    // D: Comité BD
    const cD = wsDetail.getCell(`D${dCurRow}`);
    cD.value = v.committeeDB;
    cD.font = { name: FONT_FAMILY, size: 9, color: { argb: 'FF' + COLORS.darkText } };
    cD.alignment = { horizontal: 'left', vertical: 'middle' };
    cD.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + rowBg } };
    cD.border = thinBorder;

    // E: Comité Efectivo
    const cE = wsDetail.getCell(`E${dCurRow}`);
    cE.value = v.committeeReclass;
    cE.font = { name: FONT_FAMILY, size: 9, bold: v.isTranslationTag, color: { argb: v.isTranslationTag ? 'FF' + COLORS.primaryDark : 'FF' + COLORS.darkText } };
    cE.alignment = { horizontal: 'left', vertical: 'middle' };
    cE.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: v.isTranslationTag ? 'FF' + COLORS.primaryLight : 'FF' + rowBg } };
    cE.border = thinBorder;

    // F: Estaca
    const cF = wsDetail.getCell(`F${dCurRow}`);
    cF.value = v.stake || 'No especificada';
    cF.font = { name: FONT_FAMILY, size: 9, color: { argb: 'FF' + COLORS.darkText } };
    cF.alignment = { horizontal: 'left', vertical: 'middle' };
    cF.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + rowBg } };
    cF.border = thinBorder;

    // G: Barrio
    const cG = wsDetail.getCell(`G${dCurRow}`);
    cG.value = v.neighborhood || 'No especificado';
    cG.font = { name: FONT_FAMILY, size: 9, color: { argb: 'FF' + COLORS.darkText } };
    cG.alignment = { horizontal: 'left', vertical: 'middle' };
    cG.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + rowBg } };
    cG.border = thinBorder;

    // H: Teléfono
    const cH = wsDetail.getCell(`H${dCurRow}`);
    cH.value = v.phone || '-';
    cH.font = { name: FONT_FAMILY, size: 9, color: { argb: 'FF' + COLORS.secondaryText } };
    cH.alignment = { horizontal: 'center', vertical: 'middle' };
    cH.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + rowBg } };
    cH.border = thinBorder;

    // I: Edad
    const cI = wsDetail.getCell(`I${dCurRow}`);
    cI.value = v.age || '-';
    cI.font = { name: FONT_FAMILY, size: 9, color: { argb: 'FF' + COLORS.darkText } };
    cI.alignment = { horizontal: 'center', vertical: 'middle' };
    cI.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + rowBg } };
    cI.border = thinBorder;

    // J: Hora Registro
    const cJ = wsDetail.getCell(`J${dCurRow}`);
    cJ.value = v.localTimeStr;
    cJ.font = { name: FONT_FAMILY, size: 9, color: { argb: 'FF' + COLORS.darkText } };
    cJ.alignment = { horizontal: 'center', vertical: 'middle' };
    cJ.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + rowBg } };
    cJ.border = thinBorder;

    // K: Estado
    const cK = wsDetail.getCell(`K${dCurRow}`);
    cK.value = v.status === 'active' ? 'Activo' : (v.status || 'Activo');
    cK.font = { name: FONT_FAMILY, size: 8.5, bold: true, color: { argb: 'FF' + COLORS.successText } };
    cK.alignment = { horizontal: 'center', vertical: 'middle' };
    cK.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + COLORS.successLight } };
    cK.border = thinBorder;

    dCurRow++;
  });

  // =========================================================================
  // HOJA 3: HISTÓRICO DIARIO
  // =========================================================================
  const wsHistory = workbook.addWorksheet('Histórico Diario', {
    views: [{ showGridLines: true }],
    properties: { defaultRowHeight: 20 },
  });

  wsHistory.columns = [
    { key: 'colA', width: 4 },
    { key: 'colB', width: 6 },
    { key: 'colC', width: 24 },
    { key: 'colD', width: 24 },
    { key: 'colE', width: 24 },
    { key: 'colF', width: 22 },
    { key: 'colG', width: 4 },
  ];

  wsHistory.mergeCells('B2:F2');
  const hTitle = wsHistory.getCell('B2');
  hTitle.value = 'EVOLUCIÓN HISTÓRICA DE INGRESOS DIARIOS DE VOLUNTARIOS';
  hTitle.font = { name: FONT_FAMILY, size: 13, bold: true, color: { argb: 'FF' + COLORS.darkText } };
  hTitle.alignment = { vertical: 'middle', horizontal: 'left' };
  wsHistory.getRow(2).height = 26;

  const hHRow = 4;
  wsHistory.getRow(hHRow).height = 24;

  const hHeaders = [
    { col: 'B', title: 'N°', align: 'center' },
    { col: 'C', title: 'Fecha (Año-Mes-Día)', align: 'left' },
    { col: 'D', title: 'Nuevos Voluntarios', align: 'right' },
    { col: 'E', title: 'Total Acumulado', align: 'right' },
    { col: 'F', title: '% del Total Global', align: 'right' },
  ];

  hHeaders.forEach(h => {
    const cell = wsHistory.getCell(`${h.col}${hHRow}`);
    cell.value = h.title;
    cell.font = { name: FONT_FAMILY, size: 9.5, bold: true, color: { argb: 'FF' + COLORS.white } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + COLORS.primary } };
    cell.alignment = { horizontal: h.align, vertical: 'middle' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF' + COLORS.primaryDark } },
      bottom: { style: 'thin', color: { argb: 'FF' + COLORS.primaryDark } },
      left: { style: 'thin', color: { argb: 'FF' + COLORS.primaryDark } },
      right: { style: 'thin', color: { argb: 'FF' + COLORS.primaryDark } },
    };
  });

  const sortedDates = Object.keys(historyByDate).sort();
  let hCurRow = hHRow + 1;
  let hIndex = 1;
  let hRunningTotal = 0;

  sortedDates.forEach(dateStr => {
    const count = historyByDate[dateStr];
    hRunningTotal += count;
    const isYesterday = dateStr === YESTERDAY_STR;
    const isEven = hIndex % 2 === 0;
    const rowBg = isYesterday ? COLORS.primaryLight : (isEven ? COLORS.bgMuted : COLORS.white);

    wsHistory.getRow(hCurRow).height = 20;

    const cB = wsHistory.getCell(`B${hCurRow}`);
    cB.value = hIndex++;
    cB.font = { name: FONT_FAMILY, size: 9, color: { argb: 'FF' + COLORS.secondaryText } };
    cB.alignment = { horizontal: 'center', vertical: 'middle' };
    cB.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + rowBg } };
    cB.border = thinBorder;

    const cC = wsHistory.getCell(`C${hCurRow}`);
    cC.value = isYesterday ? `${dateStr} (Ayer ⭐)` : dateStr;
    cC.font = { name: FONT_FAMILY, size: 9.5, bold: isYesterday, color: { argb: isYesterday ? 'FF' + COLORS.primaryDark : 'FF' + COLORS.darkText } };
    cC.alignment = { horizontal: 'left', vertical: 'middle' };
    cC.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + rowBg } };
    cC.border = thinBorder;

    const cD = wsHistory.getCell(`D${hCurRow}`);
    cD.value = count;
    cD.numFmt = '#,##0';
    cD.font = { name: FONT_FAMILY, size: 9.5, bold: isYesterday, color: { argb: isYesterday ? 'FF' + COLORS.primaryDark : 'FF' + COLORS.darkText } };
    cD.alignment = { horizontal: 'right', vertical: 'middle' };
    cD.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + rowBg } };
    cD.border = thinBorder;

    const cE = wsHistory.getCell(`E${hCurRow}`);
    cE.value = hRunningTotal;
    cE.numFmt = '#,##0';
    cE.font = { name: FONT_FAMILY, size: 9.5, bold: true, color: { argb: 'FF' + COLORS.darkText } };
    cE.alignment = { horizontal: 'right', vertical: 'middle' };
    cE.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + rowBg } };
    cE.border = thinBorder;

    const cF = wsHistory.getCell(`F${hCurRow}`);
    cF.value = count / totalAll;
    cF.numFmt = '0.00%';
    cF.font = { name: FONT_FAMILY, size: 9.5, color: { argb: 'FF' + COLORS.darkText } };
    cF.alignment = { horizontal: 'right', vertical: 'middle' };
    cF.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + rowBg } };
    cF.border = thinBorder;

    hCurRow++;
  });

  // Total Histórico
  const histTotRow = hCurRow;
  wsHistory.getRow(histTotRow).height = 24;

  wsHistory.mergeCells(`B${histTotRow}:C${histTotRow}`);
  const cHTotL = wsHistory.getCell(`B${histTotRow}`);
  cHTotL.value = 'TOTAL REGISTRADOS';
  cHTotL.font = { name: FONT_FAMILY, size: 10, bold: true, color: { argb: 'FF' + COLORS.darkText } };
  cHTotL.alignment = { horizontal: 'left', vertical: 'middle' };
  cHTotL.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + COLORS.primaryLight } };
  cHTotL.border = totalBorder;

  const cHTotD = wsHistory.getCell(`D${histTotRow}`);
  cHTotD.value = { formula: `SUM(D${hHRow + 1}:D${histTotRow - 1})`, result: totalAll };
  cHTotD.numFmt = '#,##0';
  cHTotD.font = { name: FONT_FAMILY, size: 10, bold: true, color: { argb: 'FF' + COLORS.darkText } };
  cHTotD.alignment = { horizontal: 'right', vertical: 'middle' };
  cHTotD.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + COLORS.primaryLight } };
  cHTotD.border = totalBorder;

  const cHTotE = wsHistory.getCell(`E${histTotRow}`);
  cHTotE.value = totalAll;
  cHTotE.numFmt = '#,##0';
  cHTotE.font = { name: FONT_FAMILY, size: 10, bold: true, color: { argb: 'FF' + COLORS.darkText } };
  cHTotE.alignment = { horizontal: 'right', vertical: 'middle' };
  cHTotE.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + COLORS.primaryLight } };
  cHTotE.border = totalBorder;

  const cHTotF = wsHistory.getCell(`F${histTotRow}`);
  cHTotF.value = 1;
  cHTotF.numFmt = '0.00%';
  cHTotF.font = { name: FONT_FAMILY, size: 10, bold: true, color: { argb: 'FF' + COLORS.darkText } };
  cHTotF.alignment = { horizontal: 'right', vertical: 'middle' };
  cHTotF.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + COLORS.primaryLight } };
  cHTotF.border = totalBorder;

  // Guardar archivo
  const outputPath = './Informe_Nuevos_Voluntarios_Ayer.xlsx';
  await workbook.xlsx.writeFile(outputPath);
  console.log(`\n🎉 Archivo actualizado exitosamente en: ${outputPath}`);
}

generateReport().catch(console.error);
