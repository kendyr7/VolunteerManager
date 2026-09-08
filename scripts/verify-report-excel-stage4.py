from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET

BOOK = Path('outputs/excel-etapa-4/Muestra-panel-interactivo.xlsx')
NS = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
      'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
REL_NS = {'p': 'http://schemas.openxmlformats.org/package/2006/relationships'}
EXPECTED = [
    'Panel interactivo', 'Detalle del panel', 'Datos voluntarios', 'Datos turnos',
    'Requerimientos', 'Catálogos', 'Cálculos',
]

with ZipFile(BOOK) as archive:
    names = set(archive.namelist())
    workbook = ET.fromstring(archive.read('xl/workbook.xml'))
    sheets = workbook.find('s:sheets', NS)
    assert sheets is not None
    assert [sheet.attrib['name'] for sheet in sheets] == EXPECTED
    states = {sheet.attrib['name']: sheet.attrib.get('state', 'visible') for sheet in sheets}
    assert states['Catálogos'] == 'hidden' and states['Cálculos'] == 'hidden'
    view = workbook.find('s:bookViews/s:workbookView', NS)
    assert view is not None and view.attrib.get('activeTab', '0') == '0'

    relationships = ET.fromstring(archive.read('xl/_rels/workbook.xml.rels'))
    target_by_id = {rel.attrib['Id']: f"xl/{rel.attrib['Target']}" for rel in relationships.findall('p:Relationship', REL_NS)}
    target_by_name = {sheet.attrib['name']: target_by_id[sheet.attrib[f"{{{NS['r']}}}id"]] for sheet in sheets}

    for target in target_by_name.values():
        root = ET.fromstring(archive.read(target))
        sheet_view = root.find('s:sheetViews/s:sheetView', NS)
        assert sheet_view is not None and sheet_view.attrib.get('showGridLines') == '0'

    panel = ET.fromstring(archive.read(target_by_name['Panel interactivo']))
    validations = panel.find('s:dataValidations', NS)
    assert validations is not None and int(validations.attrib['count']) >= 8

    detail = ET.fromstring(archive.read(target_by_name['Detalle del panel']))
    formulas = [node.text or '' for node in detail.findall('.//s:f', NS)]
    assert any('FILTER(' in formula for formula in formulas)
    calculations = ET.fromstring(archive.read(target_by_name['Cálculos']))
    calculation_formulas = [node.text or '' for node in calculations.findall('.//s:f', NS)]
    assert any('COUNTIFS(' in formula for formula in calculation_formulas)

    assert not any(name.startswith('xl/externalLinks/') for name in names)
    assert 'xl/vbaProject.bin' not in names
    styles = archive.read('xl/styles.xml').decode('utf-8')
    assert 'Aptos Narrow' in styles

print({'workbook': str(BOOK), 'sheets': len(EXPECTED), 'status': 'ok'})
