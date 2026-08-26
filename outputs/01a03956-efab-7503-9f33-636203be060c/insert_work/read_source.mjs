import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const sourcePath = "C:/Users/Kendyr/Desktop/VolunteerManager/VolunteerManager/outputs/01a03956-efab-7503-9f33-636203be060c/Comparativa_Auditoria_Seguridad_Lista_Importar.xlsx";
const input = await FileBlob.load(sourcePath);
const workbook = await SpreadsheetFile.importXlsx(input);
const sheetName = "✅ Lista Unificada Corregida";
const sheet = workbook.worksheets.getItem(sheetName);
const rows = sheet.getRange("A1:J151").values;

const excludedNames = new Set([
  "Abbylarixa Salinas",
  "Alberto Pilarte",
  "Allison Jazmín Salinas Reyes",
  "Brighit Milagros Munguía Madrigal",
  "Cándida de la Concepción Pérez Vargas",
  "Diana Valeska Mendoza Sánchez",
  "Hna Bonilla",
  "Jaime Bonilla",
  "Josué Isaac Muñiz Chávez",
  "Juan Carlos Ortiz Mercado",
  "Juana Pilarte",
  "Kenia Melissa Hernández Cuadra",
  "María José Hernández",
  "Michelle Molina",
  "Óscar José Aburto Morán",
  "Peter A. Carballo Reyes",
  "Reyna Lucía Ordóñez",
  "Rosa Aburto",
  "Rosalba Ampié de Ortiz",
  "Silvio Enrique Flores",
  "Steven Aldana",
  "Tatiana Alejandra Cuadra",
]);

const candidates = rows.slice(1)
  .filter((row) => row[7] === "Activo (Por Crear)" && !excludedNames.has(row[1]))
  .map((row) => ({
    sourceNo: row[0],
    fullName: row[1],
    age: row[2],
    neighborhood: row[3],
    stake: row[4],
    phone: String(row[5] ?? ""),
  }));

const sqlLiteral = (value) => value === null || value === undefined
  ? "NULL"
  : `'${String(value).replaceAll("'", "''")}'`;
const sqlValues = candidates.map((candidate) => {
  const nameParts = candidate.fullName.trim().split(/\s+/);
  const firstName = nameParts[0];
  const lastName = nameParts.slice(1).join(" ");
  return `(${candidate.sourceNo}, ${sqlLiteral(firstName)}, ${sqlLiteral(lastName)}, ${candidate.age ?? "NULL"}, ${sqlLiteral(candidate.neighborhood)}, ${sqlLiteral(candidate.stake)}, ${sqlLiteral(`+505${candidate.phone}`)})`;
}).join(",\n");

process.stdout.write(JSON.stringify({ sheetName, candidateCount: candidates.length, candidates, sqlValues }));
