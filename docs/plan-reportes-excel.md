# Plan de reportes Excel y panel interactivo

Estado: etapas 0 a 3 completadas. La etapa 4 queda pendiente de revisión funcional por el usuario.

## Objetivo y alcance

Generar un archivo `.xlsx` profesional desde Reportes, con cinco hojas visibles, filtros fieles a la aplicación y un panel interactivo que permita explorar la información incluida en el archivo. Construir mediante entregas pequeñas, verificables y utilizables.

Requisitos visuales: Aptos Narrow, encabezados con colores consistentes, logotipo existente, cuadrículas desactivadas en vista e impresión y ausencia de bordes innecesarios. Requisitos funcionales: exportar todas las filas, conservar los filtros aplicados, respetar permisos, recalcular resultados del panel y abrir sin reparación ni macros.

Versión objetivo confirmada por el usuario: **Excel Microsoft 365**. Validar el panel en Microsoft 365 para Windows y Excel web. El reporte estático seguirá siendo la alternativa para clientes que no soporten las fórmulas del panel. No anunciar compatibilidad con otras versiones sin probarlas.

## Revisión inicial completada

- `app/(coordinator)/reports/page.tsx` tiene cinco pestañas: Historial, Horas por Voluntario, Totales por Comité, Reclutamiento y Edades, y Cobertura por Día.
- El botón actual descarga CSV. Reclutamiento y Cobertura caen en la exportación del ranking de voluntarios.
- Los filtros actuales incluyen búsqueda aplicada, comités, barrios/ramas, estacas, estados, fechas y simulación. Hay ordenación y paginación.
- Algunos agregados se calculan únicamente cuando su pestaña está activa. La exportación completa debe ser independiente de ese estado.
- Las metas de ciertos resúmenes filtrados se calculan mediante proporciones de días o comités. Hay que sustituir esas aproximaciones por requerimientos reales.
- `app/actions/reports.ts` obtiene información autorizada y usa `fetchAllRows`. Mantener esa cobertura completa y las restricciones del servidor.
- La base actual de `ReportItem` describe turnos/asistencias; por sí sola no representa a todos los voluntarios reclutados sin turno.
- ExcelJS ya es dependencia del proyecto. El script histórico `scripts/generate-volunteer-report.mjs` contiene fechas y criterios particulares; no trasladar esos supuestos al nuevo exportador.
- El logotipo existe en el proyecto; reutilizarlo con un recurso estático apropiado para fondo claro.

## Comportamiento del producto

Un único botón «Exportar Excel» descarga el reporte interactivo con el panel, sus controles, detalle y las bases completas autorizadas necesarias para ampliar el análisis.

Se fija una instantánea al iniciar la exportación: filtros aplicados, ordenación, fecha de corte y datos correspondientes. Si el usuario modifica controles durante la generación, el archivo sigue representando esa instantánea. Deshabilitar la exportación mientras se carga una selección de simulación diferente para evitar mezclar filtros y datos.

«Datos completos» significa todos los registros del evento que el usuario puede consultar. En el modo interactivo, las selecciones de comité, barrio, estaca, estado y fechas se convierten en valores iniciales editables, no en límites de la base exportada. La búsqueda de texto permanece como filtro del reporte fijo y no se replica en el panel. La autorización del servidor sigue siendo un límite absoluto.

El interruptor de simulación determina si esos registros se incluyen físicamente. Si están incluidos, el panel puede ocultarlos o mostrarlos. Si no están incluidos, el panel indica que no están disponibles y no ofrece activarlos. El archivo es un corte de datos; cambiar filtros no consulta el sistema ni incorpora registros posteriores.

## Estructura del libro

| Hoja | Contenido | Comportamiento |
|---|---|---|
| Resumen | Indicadores del corte, filtros originales, fecha local de generación, alcance e índice con enlaces | Corte fijo |
| Historial | Personas, contacto, comité, unidad, fecha, turno, horario, duración y estado | Reporte filtrado completo |
| Horas por voluntario | Personas únicas, turnos, asistencia, ausencias y tiempo servido | Reporte filtrado completo |
| Totales por comité | Personas, turnos, asistencia, horas y promedios | Reporte filtrado completo |
| Reclutamiento y edades | Reclutamiento y distribución etaria en dos secciones con su población indicada | Reporte filtrado completo |
| Cobertura por día | Requeridos, asignados, asistentes, faltantes y desglose por turno | Reporte filtrado completo |
| Panel interactivo | Controles rápidos, métricas, comparaciones y acceso al detalle | Se recalcula; modo interactivo |
| Detalle del panel | Filas que cumplen los controles actuales | Se recalcula; modo interactivo |
| Datos de voluntarios | Una fila por voluntario autorizado, incluyendo personas sin turno | Base del modo interactivo |
| Datos de turnos | Una fila por unidad de reporte definida, con datos legibles y duración atribuida | Base del modo interactivo |
| Requerimientos | Comité, fecha, turno y meta correspondiente | Base del modo interactivo |
| Catálogos | Valores autorizados y claves para los controles | Auxiliar; modo interactivo |
| Cálculos | Máscaras y agregados intermedios auditables | Auxiliar; modo interactivo |

El reporte filtrado siempre incluye las cinco pestañas de análisis y el Resumen, incluso cuando estén vacías. El archivo interactivo contiene únicamente el panel, el detalle, sus bases visibles y dos auxiliares ocultas. Ocultar hojas no se considera una medida de autorización. No incluir columnas internas o personales que no aporten al reporte.

Las hojas del corte llevan el contexto «Filtros al exportar». El panel muestra «Filtros actuales del panel». Un cambio en el panel no altera silenciosamente el corte compartible. Las cinco áreas de análisis estarán representadas también en el panel o su detalle dinámico, sin duplicar cinco reportes completos adicionales.

## Contrato de filtros

- Dentro de una dimensión, varios valores se combinan con OR. Entre dimensiones, con AND.
- Sin selección significa todos los valores disponibles dentro del alcance autorizado.
- Inicializar exactamente con los arrays de la aplicación: no convertir varios comités en uno ni fechas separadas en un intervalo continuo.
- Usar identificadores estables para comités y personas; etiquetas legibles para presentación. Mantener categorías explícitas para datos faltantes.
- Replicar la búsqueda aplicada de la aplicación, incluyendo campos consultados, normalización y tratamiento de palabras. Probar búsquedas con tildes, espacios y signos que Excel podría interpretar como comodines.
- Mantener el orden elegido por pestaña; si no hay orden explícito, definir uno estable con desempate por identificador.
- Exportar resultados anteriores a la paginación; nunca limitar el archivo a las filas visibles.
- Los filtros originales son metadatos inmutables. Los controles editables del panel se calculan separadamente.

### Controles del panel

Cada dimensión categórica tendrá una elección de modo: «Al exportar», «Todos» o «Un valor». Un segundo desplegable permite elegir el valor único cuando corresponda.

Las fechas tendrán los modos «Al exportar», «Todas» e «Intervalo», usando la lista real de fechas del evento.

La búsqueda no forma parte del panel interactivo. Simulación será editable únicamente si el archivo contiene esos registros.

Los filtros de encabezado de las tablas de datos sirven para inspección local. No controlan el panel: sus métricas dependen exclusivamente de los desplegables identificados en Panel.

## Definiciones de datos y métricas

Antes de implementar, registrar para cada métrica: población, numerador, denominador, unidad, estados incluidos y comportamiento ante ausencia de datos.

- **Personas únicas**: contar por ID, no por nombre, número de filas o suma de conteos parciales.
- **Reclutamiento**: incluir voluntarios sin turnos cuando no existen restricciones de fecha/estado/turno que requieran una asignación. Con esas restricciones, identificar la población como «Voluntarios con turnos coincidentes». No presentar esa población como todos los inscritos.
- **Edad**: usar la misma población de personas que el indicador asociado, sin duplicar personas por cada turno. Definir rangos no solapados, por ejemplo 36–50 y 51+, y mantener «Sin edad» explícito.
- **Turnos y asistencia**: conservar las reglas operativas de registro, reemplazo, asistencia confirmada y ausencia. Validar el grano de los registros antes de agregar sesiones inferidas y asignaciones para evitar doble conteo.
- **Horas servidas**: usar duración atribuida al servicio confirmado según las reglas existentes; verificar sesiones extendidas, abiertas y que cruzan turnos. Almacenar duración numérica y mostrar `[h]:mm` para acumulados mayores de 24 horas.
- **Requeridos**: sumar las metas reales de cada comité/fecha/turno disponible, sin repartir por proporciones del número de comités o días.
- **Filtros de personas/estado**: afectan al numerador correspondiente; no reducen las metas operativas. Bajo esos filtros, rotular la cobertura como contribución del grupo seleccionado a la meta operativa.
- **Cobertura por turno**: asignaciones coincidentes / requeridos; puede superar 100%. **Asistencia**: asistencias confirmadas / turnos coincidentes según la definición acordada de estados. No intercambiar ambas tasas.
- **Cobertura agregada**: sumar `mínimo(asignados, requeridos)` de cada comité/fecha/turno y dividirlo entre la suma de requeridos. Mostrar también las asignaciones totales para conservar la sobrecobertura, pero nunca usar el exceso de un turno para ocultar la falta de otro.
- **Faltantes**: calcular `máximo(requeridos - asignados, cero)` en cada comité/fecha/turno y después sumar los resultados.
- **Totales**: recalcular porcentajes desde sus numeradores y denominadores; no promediar tasas de grupos con tamaños diferentes.
- **Sin denominador**: mostrar «No aplica» o celda vacía, sin generar división por cero ni presentar una meta desconocida como cero real.

La pantalla y el Excel deben usar el mismo contrato corregido. Si una cifra actual cambia por corregir una aproximación o duplicación, documentar la causa y verificar ambos resultados.

## Panel interactivo y cálculo

Distribución propuesta: título y corte compacto; controles; indicadores; comparación por comité; cobertura por día/turno; distribución de edades y horas; enlaces al detalle.

Indicadores: voluntarios únicos, turnos asignados, asistencias, ausencias, horas servidas, requeridos, faltantes, tasa de asistencia y cobertura. Mostrar la definición y población pertinente de forma breve, sin llenar el panel de explicaciones técnicas.

Calcular máscaras por fila para cada dimensión, reutilizar una coincidencia final y agregar por comité, día y persona. Emplear fórmulas claras y rangos acotados; evitar referencias a columnas enteras y funciones volátiles. El detalle dinámico puede usar FILTER; los agregados, SUMIFS/COUNTIFS/SUMPRODUCT o equivalentes comprobados. La selección exacta de funciones se cierra con la prueba de compatibilidad.

El panel debe actualizar cifras, etiquetas, detalle y visualizaciones al cambiar controles. No basta con que aparezcan flechas de filtro sobre una tabla estática.

Primero se implementarán visualizaciones nativas mediante formato condicional: mapa de cobertura y barras comparativas ligadas a valores. Los gráficos nativos de barras/líneas forman parte de la etapa de visualización, sujetos a validar la ruta de generación. Las imágenes estáticas no sustituyen gráficos que deben responder a filtros.

ExcelJS se usará para el reporte y las capacidades comprobadas de tablas, fuentes, vistas, imágenes y validaciones. No asumir que la versión instalada genera o preserva gráficos, segmentadores o tablas dinámicas. Probar esa capacidad antes de elegir un adaptador o una plantilla; no pasar una plantilla con objetos no soportados por un ciclo de lectura/escritura que pueda eliminarlos.

No basar el panel inicial en macros, ActiveX, conexiones externas o pasos de actualización manual. Los resultados iniciales deben estar disponibles al abrir el libro. ExcelJS escribe fórmulas, pero la verificación de recálculo debe realizarse en Excel, no únicamente leyendo valores almacenados en el archivo.

## Sistema visual e impresión

- Aptos Narrow como fuente de celdas, estilos y gráficos. Cuerpo 11 pt, encabezados 11–12 pt en negrita y títulos 18–20 pt. Comprobar la fuente efectiva en el entorno de validación; no suponer que se incrusta en el archivo.
- Azul institucional `#4D7CFE` para acentos; azul más oscuro para encabezados con texto blanco; texto principal `#252631`, fondos blancos y bandas de filas muy suaves.
- Colores semánticos consistentes para cobertura y estado, acompañados de números/etiquetas. Evitar que el significado dependa solo del color.
- `showGridLines: false` en todas las vistas de todas las hojas; cuadrículas de impresión desactivadas.
- Sin una malla de bordes en el cuerpo. Usar separadores discretos para cabeceras, cambios de sección y totales.
- Logotipo estático del proyecto, nítido, sin deformación y fuera de los rangos filtrables.
- Títulos y contexto compactos. No combinar celdas dentro de tablas de datos o zonas de derrame de fórmulas.
- Fechas, números, porcentajes y duraciones tipados; teléfonos e identificadores como texto. Datos de usuario escritos como texto, nunca interpretados como fórmulas.
- Anchos calibrados y alturas adecuadas para nombres largos; inmovilizar solo filas/columnas necesarias.
- Totales consistentes; zoom inicial legible; hoja inicial Resumen o Panel según modalidad.
- Impresión: orientación por hoja, una página de ancho y altura libre, márgenes, encabezados repetidos, pie con fecha y página. Área de impresión del reporte limitada a contenido útil; bases auxiliares fuera del recorrido de impresión habitual.

## Arquitectura propuesta

Rutas orientativas; ajustar a las convenciones del repositorio durante implementación:

- `lib/reports/types.ts`: instantánea, filtros, entidades y resultados tipados.
- `lib/reports/filter.ts`: normalización y aplicación de filtros.
- `lib/reports/aggregate.ts`: personas, comités, reclutamiento, edades y cobertura.
- `lib/reports/export/theme.ts`: fuente, paleta, títulos, tablas e impresión.
- `lib/reports/export/workbook.ts`: construcción del reporte estático.
- `lib/reports/export/interactive.ts`: controles, catálogos, fórmulas y visualizaciones.
- `app/actions/reports.ts`: adquisición completa de datos con autorización; ampliar bases y requerimientos granulares cuando sea necesario.
- `app/(coordinator)/reports/page.tsx`: reutilización de cálculos y flujo de exportación.
- `scripts/test-reports-*.mts`: pruebas de comportamiento y archivos generados.

Separar adquisición, cálculo y formato. Cargar el generador bajo demanda. Medir tamaño y memoria en la prueba técnica para decidir generación en navegador, worker o servidor; no introducir infraestructura sin una necesidad medida. Si se genera en servidor, verificar autorización allí y no confiar en un alcance enviado por el cliente.

## Etapas y criterios de aceptación

| Etapa | Trabajo y entrega | Criterio para darla por terminada |
|---|---|---|
| 0. Revisión y especificación | Inventario existente y este plan | Completada como planificación; quedan por ejecutar las pruebas técnicas |
| 1. Prueba técnica y contrato | Libro pequeño con datos ficticios, múltiples comités/fechas, controles, logo, Aptos Narrow, fórmula dinámica y mapa de cobertura; verificar Microsoft 365 y cerrar definiciones | Completada técnicamente. La evidencia y los límites están en `docs/reportes-excel-etapa-1.md`; la revisión de producto por el usuario queda antes de iniciar la etapa 2 |
| 2. Datos y cálculos compartidos | Extraer filtros/agregados, incorporar personas sin turno y metas por fecha/comité/turno; conectar pantalla | Completada. Implementación, decisiones y evidencia en `docs/reportes-excel-etapa-2.md` |
| 3. Reporte Excel profesional | Resumen y cinco pestañas completas con estilos, logo, autofiltros, totales e impresión | Completada. Implementación y evidencia en `docs/reportes-excel-etapa-3.md` |
| 4. Bases y controles del panel | Modalidad interactiva separada, bases completas autorizadas, filtros originales y editables, área asignada y detalle dinámico | Completada. Los desplegables simples actualizan las métricas y el detalle sin macros; evidencia en `docs/reportes-excel-etapa-4.md` |
| 5. Métricas, detalle y visualizaciones | Todos los indicadores, cinco áreas analíticas, detalle dinámico, mapa y comparaciones; gráficos nativos según ruta validada en etapa 1 | Cada cambio de filtro actualiza cifras, detalle y gráficos; no quedan resultados desfasados, errores de fórmula o visualizaciones estáticas presentadas como interactivas |
| 6. Integración y rendimiento | Flujo final de exportación, progreso real, errores/reintento, liberación de memoria y generación adecuada al volumen | Descarga fiable con volumen representativo en escritorio y móvil; exportar no mezcla estados ni bloquea innecesariamente la interfaz |
| 7. Validación y cierre | Revisión visual de todas las hojas y apertura/recálculo en versiones objetivo, impresión y regresiones | Checklist completo, resultados reproducibles, limitaciones documentadas y ninguna entrega pendiente dentro del alcance |

Dependencias: 1 → 2 → 3 → 4 → 5 → 6 → 7. Cada etapa conserva una aplicación funcional. La etapa 3 ya entrega valor de uso real; el modo interactivo se habilita cuando sus cálculos y datos pasan validación, sin exponer controles incompletos.

No es necesario pedir una aprobación nueva entre etapas para trabajo autorizado. Actualizar este documento con resultado, evidencia y siguiente paso; cualquier cambio relevante de alcance o compatibilidad se comunica antes de implementarlo.

## Matriz de validación

- Sin filtros; un comité; varios comités; barrios/estacas; uno o varios estados; fechas consecutivas y separadas; combinaciones y búsqueda con tildes.
- Selección vacía, categorías faltantes, persona sin edad, persona sin turno, cero requeridos, sobrecobertura y nombres largos.
- Voluntario con varios turnos, sesiones extendidas o inferidas y reemplazos: ausencia de doble conteo de personas/horas.
- Simulación incluida/excluida; evitar fechas de simulación disponibles en un libro que no contiene sus datos.
- Exportar desde cada una de las cinco pestañas produce el mismo conjunto de hojas; ordenar y paginar no pierden filas.
- Usuario global frente a usuario restringido a comité. Inspeccionar todas las hojas, incluidos auxiliares y catálogos, para comprobar el alcance.
- Cambiar controles del panel, volver a los filtros originales y probar valores únicos e intervalos de fechas. Comparar contra los mismos casos resueltos por el motor TypeScript.
- Verificar conteos enteros exactamente; minutos con la precisión operativa; tasas con tolerancia acorde al redondeo presentado.
- Abrir el archivo guardado: sin reparación, enlaces externos inesperados, macros ni errores `#REF!`, `#DIV/0!`, `#VALUE!`, `#NAME?`, `#SPILL!` o equivalentes.
- Lectura estructural del archivo para hojas, rangos, estilos, fuentes, gridlines, validaciones, filtros, imágenes y tipos de celda; no confundir esa inspección con una prueba de recálculo.
- Inspección visual de cada hoja a zoom normal: contraste, recortes, logo, tamaños, congelación, formato de horas y vista de impresión.
- Medir generación, tamaño, memoria y tiempo de recálculo con el volumen real observado y un escenario de crecimiento. Fijar umbrales en etapa 1; nunca truncar filas silenciosamente para cumplirlos.
- Pruebas específicas del cambio, lint y build. Solo publicar después de completar la validación y dentro de la autorización de despliegue aplicable.

## Fuentes de compatibilidad consultadas

- Microsoft, FILTER y versiones compatibles: https://support.microsoft.com/en-US/Excel/functions/filter-function
- Microsoft, listas desplegables por validación: https://support.microsoft.com/en-us/excel/get-started/create-a-drop-down-list
- Microsoft, filtros de tablas: https://support.microsoft.com/en-us/excel/get-started/filter-data-in-a-range-or-table-in-excel
- ExcelJS, capacidades y documentación: https://github.com/exceljs/exceljs

## Seguimiento

- [x] Etapa 0: revisión y plan completo.
- [x] Etapa 1: prueba técnica y contrato definitivo. Revisión superada al autorizar el usuario la etapa 2.
- [x] Etapa 2: datos y cálculos compartidos. Revisión funcional aprobada por el usuario.
- [x] Etapa 3: reporte Excel profesional. Revisión aprobada al continuar con la etapa 4.
- [x] Etapa 4: bases y controles interactivos. Implementación y evidencia en `docs/reportes-excel-etapa-4.md`.
- [ ] Etapa 5: métricas, detalle y visualizaciones.
- [ ] Etapa 6: integración y rendimiento.
- [ ] Etapa 7: validación y cierre.
