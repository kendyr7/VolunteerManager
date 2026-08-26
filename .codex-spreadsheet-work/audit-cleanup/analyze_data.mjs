import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = "C:/Users/Kendyr/Downloads/Comparativa_Auditoria_Seguridad_Final.xlsx";
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(inputPath));
const sheet = workbook.worksheets.getItemAt(0);
const values = sheet.getUsedRange().values;
const headers = values[0];
const rows = values.slice(1);

const uniqueSorted = (index) => [...new Set(rows.map((row) => String(row[index] ?? "").trim()))]
  .sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));

const phoneDetails = rows.map((row, offset) => {
  const raw = String(row[5] ?? "").trim();
  const digits = raw.replace(/\D/g, "");
  return { excelRow: offset + 2, name: row[1], raw, digits, length: digits.length };
});

console.log("HEADERS");
console.log(JSON.stringify(headers));
console.log("RAMA_VALUES");
console.log(JSON.stringify(uniqueSorted(3), null, 2));
console.log("DISTRITO_VALUES");
console.log(JSON.stringify(uniqueSorted(4), null, 2));
console.log("PHONE_ANOMALIES");
console.log(JSON.stringify(phoneDetails.filter((item) => item.length !== 11 || !item.digits.startsWith("505")), null, 2));
const duplicateGroups = (keyFn) => {
  const groups = new Map();
  rows.forEach((row, offset) => {
    const key = keyFn(row);
    if (!key) return;
    const list = groups.get(key) ?? [];
    list.push({ excelRow: offset + 2, name: row[1], phone: row[5] });
    groups.set(key, list);
  });
  return [...groups.entries()].filter(([, list]) => list.length > 1).map(([key, list]) => ({ key, list }));
};
console.log("DUPLICATE_PHONES");
console.log(JSON.stringify(duplicateGroups((row) => String(row[5] ?? "").replace(/\D/g, "")), null, 2));
console.log("DUPLICATE_NAMES_NORMALIZED");
console.log(JSON.stringify(duplicateGroups((row) => String(row[1] ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase()), null, 2));
console.log("BARRIO_ESTACA_OCCURRENCES");
console.log(JSON.stringify(values.flatMap((row, rowIndex) => row.map((value, colIndex) => ({ row: rowIndex + 1, col: colIndex + 1, value })).filter(({ value }) => /\b(?:barrio|estaca)\b/i.test(String(value ?? "")))), null, 2));
console.log("ALL_NAMES");
console.log(JSON.stringify(rows.map((row, offset) => ({ excelRow: offset + 2, name: row[1] })), null, 2));

const style = await workbook.inspect({
  kind: "computedStyle",
  sheetId: sheet.name,
  range: "A1:J6",
  maxChars: 8000,
});
console.log("STYLE");
console.log(style.ndjson);
