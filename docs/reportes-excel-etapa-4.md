# Reportes Excel — Etapa 4

## Resultado

La pantalla de Reportes ofrece una sola descarga de Excel:

- **Reporte interactivo**: contiene las cinco hojas visibles `Panel interactivo`, `Detalle del panel`, `Datos voluntarios`, `Datos turnos` y `Requerimientos`, además de las auxiliares ocultas `Catálogos` y `Cálculos`.

El panel incluye únicamente los datos que cumplen los filtros activos al generar el archivo. Los filtros de comité, barrio o rama, estaca, estado, fecha y búsqueda limitan físicamente las bases exportadas. La búsqueda de texto no se replica como control editable dentro de Excel.

## Controles implementados

- Comité, barrio o rama, estaca y estado: `Al exportar`, `Todos` y `Un valor`.
- Fechas: `Al exportar`, `Todas` e `Intervalo`.
- Simulación: se puede ocultar o aislar cuando sus registros están físicamente incluidos. Si se exportó sin simulación, el panel muestra que no está disponible.

`Detalle del panel` contiene resultados visibles desde que se abre el archivo y usa fórmulas `INDEX`/`MATCH` para actualizarse automáticamente cuando cambia un desplegable. `Catálogos` alimenta las listas y conserva los filtros originales; `Cálculos` contiene las máscaras que actualizan métricas y detalle. Ambas hojas están ocultas porque son soporte técnico necesario.

Las bases visibles omiten identificadores internos y columnas auxiliares. `Datos voluntarios` muestra nombre, edad, teléfono, barrio o rama, estaca y comité. `Datos turnos` muestra esos datos, área asignada, fecha, turno, estado y minutos servidos. `Requerimientos` muestra comité, fecha, turno y requeridos.

## Área asignada y logotipo

El reporte obtiene el área desde la asignación real de cada turno (`shifts.area_id` y `committee_areas.name`). Se muestra en el Historial del sistema, en el Historial del reporte fijo y en el detalle y base de turnos del panel.

El logotipo del Resumen dejó de depender del tamaño de un rango de celdas. Todas las hojas usan ahora un anclaje con ancho y alto iguales para conservar su proporción cuadrada.

## Verificación

- El estado inicial reproduce los filtros categóricos y de fecha aplicados al exportar.
- Se probaron cuatro escenarios de recálculo: original, todos, un comité e intervalo de fechas.
- El libro interactivo contiene siete hojas, cinco visibles y dos auxiliares ocultas. Es la única modalidad disponible desde la interfaz.
- Las bases contienen los turnos y voluntarios completos autorizados, incluso una persona sin turno en el caso de prueba.
- Las hojas no muestran gridlines, usan Aptos Narrow y no contienen macros ni conexiones externas.
- La inspección del paquete XLSX valida dropdowns, fórmulas `INDEX`, `MATCH` y `COUNTIFS`, hojas auxiliares ocultas y ausencia de errores estructurales.
- TypeScript, las pruebas de cálculo y las pruebas de ambos libros pasan.

La etapa 5 ampliará el panel con todos los indicadores, desglose por comité y fecha, cobertura, edades, horas y visualizaciones que respondan a los mismos controles.
