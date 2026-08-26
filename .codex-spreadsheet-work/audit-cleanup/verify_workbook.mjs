import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const outputPath = "C:/Users/Kendyr/Desktop/VolunteerManager/VolunteerManager/outputs/01a03956-efab-7503-9f33-636203be060c/Comparativa_Auditoria_Seguridad_Lista_Importar.xlsx";
const previewDir = "C:/Users/Kendyr/Desktop/VolunteerManager/VolunteerManager/.codex-spreadsheet-work/audit-cleanup/previews-after";

await fs.mkdir(previewDir, { recursive: true });
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(outputPath));
const verification = [];

for (const sheet of workbook.worksheets.items) {
  const values = sheet.getUsedRange().values;
  const headers = values[0].map((value) => String(value ?? "").trim().toLowerCase());
  const rows = values.slice(1);
  const wardIdx = headers.findIndex((header) => header.includes("barrio") || header.includes("ward") || header.includes("colonia") || header.includes("vecindario") || header.includes("localidad") || header.includes("direc"));
  const stakeIdx = headers.findIndex((header) => header.includes("estaca") || header.includes("stake"));
  const phoneIdx = headers.findIndex((header) => header.includes("tel") || header.includes("cel") || header.includes("phone") || header.includes("contacto") || header.includes("móvil") || header.includes("movil"));
  const nameIdx = headers.findIndex((header) => header.includes("nombre") || header.includes("voluntario") || header.includes("apellido") || header.includes("full name"));

  const occurrences = values.flatMap((row, rowIndex) => row.map((value, colIndex) => ({ row: rowIndex + 1, col: colIndex + 1, value })).filter(({ value }) => /\b(?:barrio|estaca)\b/i.test(String(value ?? ""))));
  const invalidPhones = rows.map((row, offset) => ({ excelRow: offset + 2, name: row[nameIdx], phone: String(row[phoneIdx] ?? "").trim() })).filter((item) => item.phone && !/^\d{8}$/.test(item.phone));
  const missingPhones = rows.map((row, offset) => ({ excelRow: offset + 2, name: row[nameIdx] })).filter((item, offset) => !String(rows[offset][phoneIdx] ?? "").trim());
  const invalidLocationPrefixes = rows.map((row, offset) => ({ excelRow: offset + 2, rama: row[wardIdx], distrito: row[stakeIdx] })).filter((item) => /^(?:barrio|rama)\b/i.test(String(item.rama ?? "").trim()) || /^(?:estaca|distrito)\b/i.test(String(item.distrito ?? "").trim()));
  const duplicatePhones = new Map();
  rows.forEach((row, offset) => {
    const phone = String(row[phoneIdx] ?? "").trim();
    if (!phone) return;
    const entries = duplicatePhones.get(phone) ?? [];
    entries.push({ excelRow: offset + 2, name: row[nameIdx] });
    duplicatePhones.set(phone, entries);
  });

  const topCheck = await workbook.inspect({
    kind: "table",
    range: `${sheet.name}!A1:J12`,
    include: "values,formulas",
    tableMaxRows: 12,
    tableMaxCols: 10,
    maxChars: 8000,
  });

  const formulaErrors = await workbook.inspect({
    kind: "match",
    searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
    options: { useRegex: true, maxResults: 300 },
    summary: "final formula error scan",
  });

  const preview = await workbook.render({
    sheetName: sheet.name,
    autoCrop: "all",
    scale: 1,
    format: "png",
  });
  const safeName = sheet.name.replace(/[<>:"/\\|?*]/g, "_");
  const previewPath = path.join(previewDir, `${safeName}.png`);
  await fs.writeFile(previewPath, new Uint8Array(await preview.arrayBuffer()));

  verification.push({
    sheet: sheet.name,
    rows: rows.length,
    columns: values[0].length,
    headerIndexes: { nameIdx, wardIdx, stakeIdx, phoneIdx },
    forbiddenTermOccurrences: occurrences,
    invalidPhones,
    missingPhones,
    invalidLocationPrefixes,
    duplicatePhoneGroups: [...duplicatePhones.entries()].filter(([, entries]) => entries.length > 1).map(([phone, entries]) => ({ phone, entries })),
    topCheck: topCheck.ndjson,
    formulaErrors: formulaErrors.ndjson,
    previewPath,
  });
}

console.log(JSON.stringify(verification, null, 2));

