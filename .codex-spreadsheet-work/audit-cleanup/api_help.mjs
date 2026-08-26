import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load("C:/Users/Kendyr/Downloads/Comparativa_Auditoria_Seguridad_Final.xlsx"));
console.log(workbook.help("*", { search: "rename|worksheet.*name|name.*worksheet|position|move", include: "index,examples,notes", maxChars: 7000 }).ndjson);
