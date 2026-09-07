"""Read-only checks of the exported stage 1 workbook (Python standard library)."""
from pathlib import Path
from zipfile import ZipFile
import json
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / 'outputs' / 'excel-etapa-1'
FILE = OUTPUT / 'Prototipo-reportes-Microsoft365.xlsx'
NS = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
      'c': 'http://schemas.openxmlformats.org/drawingml/2006/chart'}

with ZipFile(FILE) as archive:
    assert archive.testzip() is None, 'Invalid ZIP member'
    names = archive.namelist()
    xml = lambda name: ET.fromstring(archive.read(name))
    workbook = xml('xl/workbook.xml')
    sheets = workbook.findall('s:sheets/s:sheet', NS)
    assert [s.attrib['name'] for s in sheets] == ['Panel', 'Selecciones', 'Detalle', 'Turnos', 'Metas']
    for index in range(1, 6):
        sheet = xml(f'xl/worksheets/sheet{index}.xml')
        views = sheet.findall('s:sheetViews/s:sheetView', NS)
        assert views and all(v.get('showGridLines') in ('0', 'false') for v in views)
        options = sheet.find('s:printOptions', NS)
        assert options is None or options.get('gridLines', '0') in ('0', 'false')
        assert not sheet.findall('.//s:c[@t="e"]', NS), f'Formula errors in sheet {index}'

    fonts = xml('xl/styles.xml').findall('s:fonts/s:font/s:name', NS)
    assert any(font.get('val') == 'Aptos Narrow' for font in fonts)
    panel = xml('xl/worksheets/sheet1.xml')
    validations = panel.findall('s:dataValidations/s:dataValidation', NS)
    assert {v.get('sqref') for v in validations} == {'C7', 'C8', 'C9', 'C10'}
    assert all(v.get('type') == 'list' for v in validations)
    multiple = xml('xl/worksheets/sheet2.xml').findall('s:dataValidations/s:dataValidation', NS)
    assert {v.get('sqref') for v in multiple} == {'D6:D8', 'D12:D14'}
    detail = xml('xl/worksheets/sheet3.xml')
    formula = detail.find('.//s:c[@r="A6"]/s:f', NS)
    assert formula is not None and 'FILTER(' in formula.text
    assert formula.get('t') == 'array'
    assert 'xl/metadata.xml' in names or 'xl/metadata1.xml' in names
    assert len(detail.findall('.//s:row/s:c[@r="A14"]/s:v', NS)) == 0, 'Stale spill beyond eight rows'
    for number, expected in [(1, 'A5:H23'), (2, 'A5:E23')]:
        table = xml(f'xl/tables/table{number}.xml')
        assert table.get('ref') == expected
        assert table.find('s:autoFilter', NS).get('ref') == expected
    chart_paths = [n for n in names if '/charts/chart' in n and n.endswith('.xml')]
    assert len(chart_paths) == 1
    chart = xml(chart_paths[0])
    references = [node.text for node in chart.findall('.//c:f', NS)]
    assert "'Metas'!$L$6:$L$8" in references and "'Metas'!$K$6:$K$8" in references
    assert any(n.startswith('xl/media/') and n.endswith('.png') for n in names)
    assert not any('vbaProject' in n or n.startswith('xl/externalLinks/') for n in names)

result = {'file': str(FILE), 'bytes': FILE.stat().st_size, 'sheets': len(sheets),
          'charts': len(chart_paths), 'status': 'passed'}
(OUTPUT / 'structure-validation.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
print(json.dumps(result, indent=2))
