import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const workbookPath = "C:/Users/Kendyr/Desktop/VolunteerManager/VolunteerManager/outputs/01a03956-efab-7503-9f33-636203be060c/Comparativa_Auditoria_Seguridad_Lista_Importar.xlsx";
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(workbookPath));
const values = workbook.worksheets.getItemAt(0).getUsedRange().values;
const headers = values[0].map((value) => String(value ?? "").trim().toLowerCase());

const find = (...terms) => headers.findIndex((header) => terms.some((term) => header.includes(term)));
const indexes = {
  sequence: headers.findIndex((header) => header === "#"),
  fullName: find("nombre"),
  age: find("edad"),
  neighborhood: find("rama", "localidad"),
  stake: find("distrito", "stake"),
  phone: find("tel"),
  committee: find("comit"),
  state: find("estado"),
  origin: find("origen"),
};

const rows = values.slice(1)
  .filter((row) => String(row[indexes.fullName] ?? "").trim())
  .map((row, offset) => ({
    sourceNo: Number(row[indexes.sequence] ?? offset + 1),
    fullName: String(row[indexes.fullName] ?? "").trim(),
    age: row[indexes.age] === null || row[indexes.age] === undefined || String(row[indexes.age]).trim() === "" ? null : Number(row[indexes.age]),
    neighborhood: String(row[indexes.neighborhood] ?? "").trim(),
    stake: String(row[indexes.stake] ?? "").trim(),
    phone: String(row[indexes.phone] ?? "").replace(/\D/g, "").slice(-8),
    committee: String(row[indexes.committee] ?? "").trim(),
    desiredState: String(row[indexes.state] ?? "").trim(),
    origin: String(row[indexes.origin] ?? "").trim(),
  }));

console.log(JSON.stringify(rows));

