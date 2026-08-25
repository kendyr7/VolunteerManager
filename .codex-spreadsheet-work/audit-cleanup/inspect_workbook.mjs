import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = "C:/Users/Kendyr/Downloads/Comparativa_Auditoria_Seguridad_Final.xlsx";
const previewDir = "C:/Users/Kendyr/Desktop/VolunteerManager/VolunteerManager/.codex-spreadsheet-work/audit-cleanup/previews-before";

await fs.mkdir(previewDir, { recursive: true });
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(inputPath));

const overview = await workbook.inspect({
  kind: "workbook,sheet,table,drawing",
  maxChars: 12000,
  tableMaxRows: 8,
  tableMaxCols: 16,
  tableMaxCellChars: 100,
});
console.log("WORKBOOK_OVERVIEW");
console.log(overview.ndjson);

const summaries = [];
for (const sheet of workbook.worksheets.items) {
  const used = sheet.getUsedRange();
  const values = used?.values ?? [];
  const formulas = used?.formulas ?? [];
  const rowCount = values.length;
  const columnCount = values.reduce((max, row) => Math.max(max, row?.length ?? 0), 0);
  const formulaCount = formulas.flat().filter((value) => typeof value === "string" && value.startsWith("=")).length;
  summaries.push({
    name: sheet.name,
    rowCount,
    columnCount,
    formulaCount,
    sample: values.slice(0, 12).map((row) => row.slice(0, 20)),
  });

  const preview = await workbook.render({
    sheetName: sheet.name,
    autoCrop: "all",
    scale: 1,
    format: "png",
  });
  const safeName = sheet.name.replace(/[<>:"/\\|?*]/g, "_");
  await fs.writeFile(path.join(previewDir, `${safeName}.png`), new Uint8Array(await preview.arrayBuffer()));
}

console.log("SHEET_SUMMARIES");
console.log(JSON.stringify(summaries, null, 2));

