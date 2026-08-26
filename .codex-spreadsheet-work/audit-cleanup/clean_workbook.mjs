import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = "C:/Users/Kendyr/Downloads/Comparativa_Auditoria_Seguridad_Final.xlsx";
const outputDir = "C:/Users/Kendyr/Desktop/VolunteerManager/VolunteerManager/outputs/01a03956-efab-7503-9f33-636203be060c";
const outputPath = `${outputDir}/Comparativa_Auditoria_Seguridad_Lista_Importar.xlsx`;

const stripMarks = (value) => String(value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/\s+/g, " ")
  .trim();

const ramaCanonical = new Map(Object.entries({
  "altagracia": "Altagracia",
  "batahola": "Batahola",
  "bello amanecer": "Bello Amanecer",
  "bello amenecer": "Bello Amanecer",
  "bello horizonte": "Bello Horizonte",
  "ciudad jardin": "Ciudad Jardín",
  "ciudad sandino": "Ciudad Sandino",
  "cuatro esquinas": "Cuatro Esquinas",
  "diriamba": "Diriamba",
  "diriomo": "Diriomo",
  "ducuali": "Ducualí",
  "el rosario": "El Rosario",
  "el viejo": "El Viejo",
  "jinotepe": "Jinotepe",
  "la concepcion": "La Concepción",
  "la trinidad": "La Trinidad",
  "las flores": "Las Flores",
  "las villas": "Las Villas",
  "leon": "León",
  "lezcano": "Lezcano",
  "linda vista": "Linda Vista",
  "loma linda": "Loma Linda",
  "los laureles": "Los Laureles",
  "masatepe": "Masatepe",
  "masaya": "Masaya",
  "maximo jerez": "Máximo Jerez",
  "monimbo": "Monimbó",
  "monserat": "Montserrat",
  "monte fresco": "Monte Fresco",
  "nandaime": "Nandaime",
  "prinzapolka": "Prinzapolka",
  "rama mateare": "Mateare",
  "rama san rafael del sur": "San Rafael del Sur",
  "rama waspan": "Waspán",
  "rene polanco": "René Polanco",
  "rivas": "Rivas",
  "ruben dario": "Rubén Darío",
  "san carlos": "San Carlos",
  "san juan": "San Juan",
  "san juan de oriente": "San Juan de Oriente",
  "san marcos": "San Marcos",
  "trinidad": "Trinidad",
  "veracruz": "Veracruz",
  "villa flor": "Villa Flor",
  "villa venezuela": "Villa Venezuela",
  "waspan": "Waspán"
}));

const distritoCanonical = new Map(Object.entries({
  "bello horizonte": "Bello Horizonte",
  "chinandega oeste": "Chinandega Oeste",
  "jinotepe": "Jinotepe",
  "las americas": "Las Américas",
  "leon": "León",
  "managua": "Managua",
  "managua norte": "Managua Norte",
  "masatepe": "Masatepe",
  "masstepe": "Masatepe",
  "masaya": "Masaya",
  "universitaria": "Universitaria",
  "villa flor": "Villa Flor"
}));

const tokenCorrections = new Map(Object.entries({
  "alvaro": "Álvaro",
  "alvarez": "Álvarez",
  "angel": "Ángel",
  "angeles": "Ángeles",
  "arguello": "Argüello",
  "arroliga": "Arróliga",
  "calderon": "Calderón",
  "castellon": "Castellón",
  "davila": "Dávila",
  "diaz": "Díaz",
  "garcia": "García",
  "gonzalez": "González",
  "gutierrez": "Gutiérrez",
  "hernandez": "Hernández",
  "jarquin": "Jarquín",
  "jimenez": "Jiménez",
  "jose": "José",
  "josias": "Josías",
  "josue": "Josué",
  "lopez": "López",
  "lucia": "Lucía",
  "maria": "María",
  "martin": "Martín",
  "martinez": "Martínez",
  "matias": "Matías",
  "mejia": "Mejía",
  "mendez": "Méndez",
  "montalvan": "Montalván",
  "moran": "Morán",
  "munguia": "Munguía",
  "narvaez": "Narváez",
  "nunez": "Núñez",
  "ordonez": "Ordóñez",
  "oscar": "Óscar",
  "perez": "Pérez",
  "rene": "René",
  "rios": "Ríos",
  "rodriguez": "Rodríguez",
  "salome": "Salomé",
  "sanchez": "Sánchez",
  "solorzano": "Solórzano",
  "velasquez": "Velásquez"
}));

const lowerParticles = new Set(["de", "del", "la", "las", "los", "y"]);

function titleWord(word) {
  return word.split("-").map((part) => {
    if (!part) return part;
    if (/^[a-záéíóúüñ]\.$/i.test(part)) return `${part[0].toUpperCase()}.`;
    const lower = part.toLocaleLowerCase("es-NI");
    return lower.charAt(0).toLocaleUpperCase("es-NI") + lower.slice(1);
  }).join("-");
}

function normalizeName(value) {
  const compact = String(value ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
  const words = compact.split(" ").filter(Boolean);
  const normalized = words.map((word, index) => {
    const key = stripMarks(word.replace(/[.,;:]+$/g, ""));
    if (tokenCorrections.has(key)) return tokenCorrections.get(key);
    if (index > 0 && lowerParticles.has(key)) return key;
    return titleWord(word);
  }).join(" ");

  const fullNameCorrections = new Map([
    ["Karla Teresa Estada Vega", "Karla Teresa Estrada Vega"],
    ["Jimmy Alexander Laiznez Silva", "Jimmy Alexander Laínez Silva"],
    ["Nadieska de los Ángeles García Valvidia", "Nadieska de los Ángeles García Valdivia"]
  ]);
  return fullNameCorrections.get(normalized) ?? normalized;
}

function normalizePhone(value) {
  let digits = String(value ?? "").replace(/\D/g, "");
  if (digits.startsWith("505") && digits.length === 11) digits = digits.slice(3);
  return /^\d{8}$/.test(digits) ? digits : null;
}

function normalizeAge(value) {
  const text = String(value ?? "").trim();
  return /^\d+$/.test(text) ? Number(text) : null;
}

function normalizeTermLabels(value) {
  if (typeof value !== "string") return value;
  return value
    .replace(/\bBarrio\b/gi, "Rama")
    .replace(/\bEstaca\b/gi, "Distrito")
    .replace(/\s+/g, " ")
    .trim();
}

const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(inputPath));
const sheet = workbook.worksheets.getItemAt(0);
const used = sheet.getUsedRange();
const originalValues = used.values;
const cleanedValues = originalValues.map((row) => [...row]);
const changes = [];

cleanedValues[0][3] = "Rama / Localidad";
cleanedValues[0][4] = "Distrito / Stake";

for (let rowIndex = 1; rowIndex < cleanedValues.length; rowIndex += 1) {
  const row = cleanedValues[rowIndex];
  const before = [...row];
  row[1] = normalizeName(row[1]);
  row[2] = normalizeAge(row[2]);
  row[3] = ramaCanonical.get(stripMarks(row[3])) ?? String(row[3] ?? "").replace(/\s+/g, " ").trim();
  row[4] = distritoCanonical.get(stripMarks(row[4])) ?? String(row[4] ?? "").replace(/\s+/g, " ").trim();
  row[5] = normalizePhone(row[5]);
  row[9] = normalizeTermLabels(row[9]);

  if (row[5] === null) {
    const note = String(row[9] ?? "").trim();
    const warning = "Teléfono pendiente de completar antes de importar.";
    row[9] = note ? `${note}. ${warning}`.replace("..", ".") : warning;
  }

  for (let colIndex = 0; colIndex < row.length; colIndex += 1) {
    if (String(before[colIndex] ?? "") !== String(row[colIndex] ?? "")) {
      changes.push({ row: rowIndex + 1, col: colIndex + 1, before: before[colIndex], after: row[colIndex] });
    }
  }
}

used.values = cleanedValues;
sheet.getRange(`C2:C${cleanedValues.length}`).format.numberFormat = "0";
sheet.getRange(`F2:F${cleanedValues.length}`).format.numberFormat = "@";

await fs.mkdir(outputDir, { recursive: true });
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);

const countsByColumn = changes.reduce((acc, change) => {
  acc[change.col] = (acc[change.col] ?? 0) + 1;
  return acc;
}, {});

console.log(JSON.stringify({
  outputPath,
  rowCount: cleanedValues.length - 1,
  changedCells: changes.length + 2,
  countsByColumn,
  missingPhones: cleanedValues.slice(1).filter((row) => !row[5]).map((row, index) => ({ excelRow: index + 2, name: row[1] })),
  changeSample: changes.slice(0, 30)
}, null, 2));
