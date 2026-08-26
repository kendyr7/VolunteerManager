import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const workbookPath = "C:/Users/Kendyr/Desktop/VolunteerManager/VolunteerManager/outputs/01a03956-efab-7503-9f33-636203be060c/Comparativa_Auditoria_Seguridad_Lista_Importar.xlsx";
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(workbookPath));
const values = workbook.worksheets.getItemAt(0).getUsedRange().values;
const headers = values[0].map((value) => String(value ?? "").trim().toLowerCase());

const indexes = {
  sequence: headers.findIndex((header) => header === "#"),
  fullName: headers.findIndex((header) => header.includes("nombre")),
  age: headers.findIndex((header) => header.includes("edad")),
  neighborhood: headers.findIndex((header) => header.includes("rama") || header.includes("localidad")),
  stake: headers.findIndex((header) => header.includes("distrito") || header.includes("stake")),
  phone: headers.findIndex((header) => header.includes("tel")),
  committee: headers.findIndex((header) => header.includes("comit")),
  state: headers.findIndex((header) => header.includes("estado")),
  origin: headers.findIndex((header) => header.includes("origen")),
  notes: headers.findIndex((header) => header.includes("observ")),
};

const sqlText = (value) => value === null || value === undefined || String(value).trim() === ""
  ? "null"
  : `'${String(value).replaceAll("'", "''")}'`;
const sqlInt = (value) => Number.isInteger(Number(value)) && String(value ?? "").trim() !== ""
  ? String(Number(value))
  : "null";

const rows = values.slice(1).filter((row) => String(row[indexes.fullName] ?? "").trim());
const tuples = rows.map((row, offset) => `(
  ${sqlInt(row[indexes.sequence] ?? offset + 1)},
  ${sqlText(row[indexes.fullName])},
  ${sqlInt(row[indexes.age])},
  ${sqlText(row[indexes.neighborhood])},
  ${sqlText(row[indexes.stake])},
  ${sqlText(row[indexes.phone])},
  ${sqlText(row[indexes.committee])},
  ${sqlText(row[indexes.state])},
  ${sqlText(row[indexes.origin])},
  ${sqlText(row[indexes.notes])}
)`).join(",\n");

console.log(`with incoming_raw(
  source_no,
  full_name,
  age,
  neighborhood,
  stake,
  phone_local8,
  committee_name,
  desired_state,
  origin,
  notes
) as (
  values
${tuples}
)`);

