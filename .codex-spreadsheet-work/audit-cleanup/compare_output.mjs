import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const originalPath = "C:/Users/Kendyr/Downloads/Comparativa_Auditoria_Seguridad_Final.xlsx";
const outputPath = "C:/Users/Kendyr/Desktop/VolunteerManager/VolunteerManager/outputs/01a03956-efab-7503-9f33-636203be060c/Comparativa_Auditoria_Seguridad_Lista_Importar.xlsx";
const original = await SpreadsheetFile.importXlsx(await FileBlob.load(originalPath));
const cleaned = await SpreadsheetFile.importXlsx(await FileBlob.load(outputPath));
const before = original.worksheets.getItemAt(0).getUsedRange().values;
const after = cleaned.worksheets.getItemAt(0).getUsedRange().values;

const changedNames = [];
const changedLocations = [];
for (let index = 1; index < before.length; index += 1) {
  if (String(before[index][1] ?? "") !== String(after[index][1] ?? "")) {
    changedNames.push({ excelRow: index + 1, before: before[index][1], after: after[index][1] });
  }
  if (String(before[index][3] ?? "") !== String(after[index][3] ?? "") || String(before[index][4] ?? "") !== String(after[index][4] ?? "")) {
    changedLocations.push({ excelRow: index + 1, before: [before[index][3], before[index][4]], after: [after[index][3], after[index][4]] });
  }
}

console.log("CHANGED_NAMES");
console.log(JSON.stringify(changedNames, null, 2));
console.log("CHANGED_LOCATIONS");
console.log(JSON.stringify(changedLocations, null, 2));

