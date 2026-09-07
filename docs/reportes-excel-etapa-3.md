# Reportes Excel — Etapa 3: reporte profesional

Estado: implementación y validación técnica completadas el 7 de septiembre de 2026. Revisión del archivo descargado por el usuario pendiente antes de iniciar la etapa 4.

## Resultado

El botón de Reportes ahora descarga un archivo `.xlsx` con una instantánea de los filtros aplicados. La pestaña activa y la paginación de la pantalla no limitan el contenido: el libro siempre contiene Resumen y los cinco reportes completos.

Hojas incluidas:

1. **Resumen**: indicadores, filtros originales, fecha de corte e índice con enlaces.
2. **Historial**: todos los turnos y asistencias filtrados.
3. **Horas por voluntario**: personas únicas con turnos, asistencias, ausencias, fiabilidad y tiempo.
4. **Totales por comité**: conteos, asistencia, tiempo y promedios.
5. **Reclutamiento y edades**: voluntarios, metas, asignaciones, cupos cubiertos, faltantes y distribución etaria.
6. **Cobertura por día**: metas, asignaciones, cupos cubiertos, faltantes y detalle T1–T4.

## Presentación y comportamiento

- Aptos Narrow en títulos, encabezados, datos y totales.
- Azul institucional y bandas suaves; sin bordes en cada celda del cuerpo.
- Cuadrículas ocultas en vista y en impresión.
- Logotipo del proyecto en el libro.
- Autofiltros en las cinco hojas de datos.
- Encabezados inmovilizados y repetidos al imprimir.
- Orientación por hoja, una página de ancho, márgenes compactos y pie con página y fecha.
- Fechas, conteos, porcentajes y duraciones almacenados como valores numéricos. Los acumulados usan `[h]:mm`.
- Teléfonos y contenido ingresado por usuarios se escriben como texto, sin fórmulas generadas desde sus valores.
- Estado de generación visible en el botón; evita una segunda descarga simultánea y muestra un error recuperable si falla.
- El logo es opcional ante un fallo aislado de carga para no impedir la descarga del reporte.

La línea de filtros de cada reporte usa un resumen compacto para no recortarse cuando existen selecciones múltiples. Resumen conserva la lista completa de los filtros originales.

## Validación

La muestra `outputs/excel-etapa-3/Muestra-reporte-profesional.xlsx` contiene seis hojas y un escenario que supera las 30 filas visibles de la pantalla. Se verificó:

- estructura ZIP/XLSX válida;
- orden y nombres de las seis hojas;
- Aptos Narrow presente en todas las hojas;
- cuadrículas ocultas;
- autofiltros en las cinco hojas de datos;
- configuración de impresión;
- imagen incluida;
- ausencia de macros y enlaces externos;
- ausencia de errores de fórmula;
- render visual de las seis hojas, sin encabezados o valores recortados en el escenario probado.

El escenario de Historia del jueves 10 se conserva como una fila diaria en la muestra: 25 asignaciones, 24 cupos requeridos, 22 cubiertos, 2 faltantes y 92% de cobertura; T1 aparece 4/6 y T2–T4 aparecen 7/6. Un segundo día confirma que Historial exporta más filas que la página visible.

Validaciones automatizadas:

- `npm run test:reports`.
- `npm run test:report-excel`.
- `scripts/verify-report-excel-stage3.py`.
- inspección, búsqueda de errores y render de las seis hojas con la herramienta de hojas de cálculo.
- `npx tsc --noEmit`.

## Revisión solicitada

En Reportes, aplicar cualquier combinación conocida de comité y fecha y pulsar **Exportar Excel**. Abrir el archivo en Microsoft Excel 365 y comprobar:

1. que abre sin aviso de reparación;
2. que aparecen Resumen y los cinco reportes;
3. que los filtros de encabezado funcionan;
4. que Historial contiene más de las 30 filas visibles en pantalla cuando corresponde;
5. que las cifras coinciden con la pantalla, especialmente cupos faltantes y cobertura.

La etapa 4 añadirá la modalidad interactiva con bases autorizadas y controles editables dentro de Excel. El archivo de esta etapa es un corte estático y profesional.
