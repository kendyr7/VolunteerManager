# Etapa 1: prototipo técnico de Excel

Estado: completada técnicamente el 7 de septiembre de 2026. La siguiente etapa requiere revisar la experiencia del prototipo y aprobar sus decisiones de producto.

## Entrega

Se generó `outputs/excel-etapa-1/Prototipo-reportes-Microsoft365.xlsx` con datos estrictamente ficticios. Es un prototipo independiente y no modifica todavía el botón de exportación de la aplicación.

El libro contiene cinco hojas:

- **Panel**: controles con listas desplegables, seis indicadores, gráfico de columnas nativo y mapa de cobertura por fecha y turno.
- **Selecciones**: inclusión Sí/No de varios comités y fechas.
- **Detalle**: filas coincidentes con los controles del panel, mediante `FILTER`.
- **Turnos** y **Metas**: bases de prueba con filtros de tabla para inspección local.

El control global alterna entre **Al exportar** y **Personalizados**. Las listas de las tablas sirven para examinar las bases; no cambian los indicadores del panel. Esto evita que dos mecanismos de filtro produzcan cifras contradictorias.

## Decisiones cerradas

- Microsoft 365 es la plataforma objetivo. El detalle dinámico usa `FILTER`; no se promete compatibilidad con versiones anteriores de Excel.
- El panel funciona sin macros, conexiones externas ni pasos manuales de actualización. El archivo contiene un corte de datos y no consulta el sistema.
- Todas las hojas desactivan las cuadrículas de vista e impresión. Aptos Narrow se aplica a celdas y al gráfico. Los encabezados usan azul institucional, hay logo en el panel y las tablas no usan bordes en cada celda del cuerpo.
- Las metas se calculan por comité, fecha y turno. Un filtro de estado reduce asignaciones y asistencias, pero no reduce la meta operativa ni oculta faltantes.
- El gráfico de columnas es nativo y se alimenta de fórmulas. Cambia junto con los controles, igual que los indicadores, el mapa y el detalle.

## Evidencia

La generación tardó 3.55 s con 18 asignaciones ficticias, produjo un archivo de 93,230 bytes y usó hasta 548,628 KiB en el proceso de generación. Esta medición es solo una línea base del generador de prueba; no establece todavía un límite de rendimiento para datos reales.

Se ejecutaron seis escenarios de fórmula y se comprobaron sus métricas:

| Caso | Turnos | Asistencias | Horas | Requeridos | Faltantes | Cobertura |
|---|---:|---:|---:|---:|---:|---:|
| Filtros originales: Guías y Seguridad, 7 y 10 sep. | 8 | 4 | 8:00 | 16 | 8 | 50% |
| Todos los comités y fechas | 18 | 9 | 18:00 | 36 | 18 | 50% |
| Solo Seguridad | 6 | 3 | 6:00 | 12 | 6 | 50% |
| Seguridad, solo Asistió | 3 | 3 | 6:00 | 12 | 9 | 25% |
| Selección múltiple original | 8 | 4 | 8:00 | 16 | 8 | 50% |
| Sin comité seleccionado | 0 | 0 | 0:00 | 0 | 0 | N/A |

La verificación del archivo guardado confirmó cinco hojas, gridlines apagadas, fuente Aptos Narrow, seis listas desplegables, dos tablas con autofiltros, una fórmula dinámica `FILTER`, un gráfico nativo enlazado a las celdas de cálculo, una imagen, ausencia de macros, enlaces externos y errores de fórmula.

También se abrió en Excel Microsoft 365 para Windows sin aviso de reparación. Al cambiar el control a **Personalizados**, elegir Seguridad y luego Todas las fechas, el panel mostró 6 turnos, 3 asistencias, 6:00 horas, 12 requeridos, 6 faltantes y 50%; el gráfico y Detalle se actualizaron al mismo tiempo. La herramienta de vista previa usada para las imágenes no dibuja el logo ni respeta la ocultación de cuadrículas, por eso esas dos propiedades se revisaron en Excel y en la estructura del archivo.

## Límites antes de integrar

El prototipo cubre comité, fecha y estado. La etapa 2 debe conectarlo a los filtros reales de Reportes: búsqueda, barrios o ramas, estacas, simulación y permisos, además de incorporar voluntarios sin turno y requerimientos reales. La etapa 3 construirá las cinco pestañas actuales del reporte a partir de la misma instantánea de datos. No se debe usar esta hoja ficticia como exportación de producción.

## Revisión solicitada

Antes de avanzar, revisar el archivo en Microsoft 365 con esta secuencia: en **Panel**, cambiar C7 a `Personalizados`; escoger `Seguridad` en C8 y `Todas` en C9; después probar `Selección múltiple` y editar los Sí/No de **Selecciones**. Validar que el aspecto, los nombres de controles, el nivel de detalle y el comportamiento de los filtros sean los deseados. Con esa revisión, la etapa 2 podrá fijar el contrato de datos real.
