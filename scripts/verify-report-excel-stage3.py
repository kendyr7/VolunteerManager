"""Structural verification for the stage 3 Excel sample."""

from pathlib import Path
from zipfile import ZipFile
import json
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "outputs" / "excel-etapa-3"
FILE = OUTPUT / "Muestra-reporte-profesional.xlsx"
NS = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}

with ZipFile(FILE) as archive:
    assert archive.testzip() is None, "Invalid ZIP member"
    names = archive.namelist()
    xml = lambda name: ET.fromstring(archive.read(name))
    workbook = xml("xl/workbook.xml")
    sheets = workbook.findall("s:sheets/s:sheet", NS)
    assert [sheet.attrib["name"] for sheet in sheets] == [
        "Resumen",
        "Historial",
        "Horas por voluntario",
        "Totales por comité",
        "Reclutamiento y edades",
        "Cobertura por día",
    ]

    for index in range(1, 7):
        sheet = xml(f"xl/worksheets/sheet{index}.xml")
        views = sheet.findall("s:sheetViews/s:sheetView", NS)
        assert views and all(view.get("showGridLines") in ("0", "false") for view in views)
        print_options = sheet.find("s:printOptions", NS)
        assert print_options is None or print_options.get("gridLines", "0") in ("0", "false")
        assert not sheet.findall('.//s:c[@t="e"]', NS), f"Formula errors in sheet {index}"
        assert sheet.find("s:pageSetup", NS) is not None

    for index in range(2, 7):
        sheet = xml(f"xl/worksheets/sheet{index}.xml")
        assert sheet.find("s:autoFilter", NS) is not None, f"Missing autofilter in sheet {index}"

    fonts = xml("xl/styles.xml").findall("s:fonts/s:font/s:name", NS)
    assert any(font.get("val") == "Aptos Narrow" for font in fonts)
    assert any(name.startswith("xl/media/") and name.endswith(".png") for name in names)
    assert not any("vbaProject" in name or name.startswith("xl/externalLinks/") for name in names)

result = {
    "file": str(FILE),
    "bytes": FILE.stat().st_size,
    "sheets": len(sheets),
    "status": "passed",
}
(OUTPUT / "structure-validation.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
print(json.dumps(result, indent=2))
