# Reportes Excel — Etapa 2: datos y cálculos compartidos

Estado: implementación y validación técnica completadas el 7 de septiembre de 2026. Revisión funcional del usuario pendiente antes de iniciar la etapa 3.

## Resultado

La pantalla de Reportes ahora obtiene una instantánea autorizada de las bases necesarias y aplica un solo motor de filtros y agregados para las cinco pestañas. Este mismo motor será la fuente del reporte Excel en la etapa 3.

- `lib/reports/types.ts` define el contrato de turnos, voluntarios, metas, filtros y resultados.
- `lib/reports/filter.ts` aplica búsqueda normalizada, selecciones múltiples y la combinación OR dentro de una dimensión / AND entre dimensiones.
- `lib/reports/aggregate.ts` calcula historial, horas por voluntario, totales por comité, reclutamiento, edades y cobertura diaria sin depender de la pestaña visible.
- `app/actions/reports.ts` entrega las bases completas dentro del permiso del usuario, incluye voluntarios sin turno y expande las metas configuradas a filas explícitas de comité, fecha y turno disponible.
- `app/(coordinator)/reports/page.tsx` consume el motor compartido y dejó de estimar metas por proporciones de comités o fechas.

## Reglas cerradas

- Las metas se suman desde la configuración real de cada comité y turno. Una combinación sin configuración vale cero; no se inventa la meta anterior de cuatro personas.
- Los filtros de comité y fecha seleccionan exactamente las filas de meta correspondientes. Búsqueda, barrio, estaca y estado afectan las asignaciones o personas, pero no reducen la meta operativa.
- Reclutamiento y edades incluyen voluntarios activos sin turno cuando no hay filtro de fecha o estado. Con alguno de esos filtros, la población cambia a «Voluntarios con turnos coincidentes» y la pantalla lo indica.
- Las personas se cuentan por ID. La distribución etaria usa rangos no solapados: `< 18`, `18 - 25`, `26 - 35`, `36 - 50`, `51+` y `Sin edad`.
- La cobertura de cada turno usa asignados entre requeridos y puede superar 100%. En totales se usa la capacidad cubierta de cada turno, `mínimo(asignados, requeridos)`, para impedir que la sobrecobertura de un turno oculte el faltante de otro.
- Faltantes se calcula con `máximo(requeridos - asignados, 0)` en cada comité, fecha y turno antes de sumar. Asistencia se calcula por separado.
- Los datos se paginan en bloques estables ordenados por ID. Un error o más de 30,000 filas produce un error explícito en vez de devolver un reporte parcial.
- Se conserva `view_reports`; solo quienes tienen `view_global_reports` reciben todos los comités. Los demás quedan limitados a su comité también cuando existe una clave de servicio en el servidor.

## Evidencia

La consulta de solo lectura al proyecto activo `VolunteerManager` encontró 1,007 voluntarios activos, de los cuales 44 no tienen turnos. También encontró 6,074 turnos, 92 sesiones de asistencia y 40 filas de metas: 10 comités por 4 turnos, sin claves duplicadas. Esto confirma que la población sin turno y la granularidad de metas corregidas se presentan en datos reales.

Durante la revisión funcional se confirmó el caso Historia del jueves 10: T1 tiene 4/6 y T2, T3 y T4 tienen 7/6. El total correcto conserva 2 cupos faltantes, 22/24 cupos de meta cubiertos y 25 asignaciones totales. El exceso de los otros turnos ya no oculta el faltante de T1.

`scripts/test-reports-data.mts` cubre:

- voluntario sin turno incluido en reclutamiento y edades;
- meta exacta al seleccionar un comité y una fecha;
- suma exacta con varios comités;
- filtro de estado que no reduce la meta;
- faltantes basados en asignaciones;
- búsqueda sin sensibilidad a tildes;
- confiabilidad neutral para una persona con turnos todavía pendientes.
- sobrecobertura de tres turnos que no compensa dos cupos faltantes en T1.

Validaciones ejecutadas:

- `npm run test:reports`: aprobado.
- `npx tsc --noEmit`: aprobado.
- ESLint sobre los archivos de la etapa: sin errores. La pantalla conserva advertencias anteriores que no bloquean la compilación.
- `npm run build`: aprobado con Next.js 16.2.7.

## Revisión funcional solicitada

Antes de la etapa 3, revisar en Reportes:

1. Sin filtros, abrir «Reclutamiento y Edades» y comprobar que el total contemple también a quienes aún no tienen turnos.
2. Elegir una fecha o un estado y confirmar que la población se identifique como «Voluntarios con turnos coincidentes».
3. Elegir un comité y una fecha; comparar Requeridos y Faltantes contra la configuración de metas de ese comité y turno.
4. Mantener los mismos filtros al cambiar entre las cinco pestañas y confirmar que todos los resultados correspondan a la misma selección.

La etapa 3 sustituirá el CSV por el libro profesional con Resumen y las cinco hojas. Todavía no se ha cambiado el flujo de descarga en esta etapa.
