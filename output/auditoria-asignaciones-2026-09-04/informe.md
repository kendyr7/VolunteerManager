# Auditoría de asignaciones — 4 de septiembre de 2026

Revisión de solo lectura de VolunteerManager. Corte del inventario: **04/09/2026 00:27:50, UTC−06:00** (2026-09-04T06:27:50.097807+00:00).
No se modificaron asignaciones, áreas, voluntarios, auditoría, código de la aplicación ni despliegues. Los únicos archivos creados son este informe y sus anexos locales.

## Resultado

Se revisaron **5925 asignaciones de 987 personas**, los ocho comités activos, las 32 áreas y el historial disponible de 14634 entradas. También se incluyeron los dos comités archivados (Parqueo y Sin Comité), que no tienen asignaciones actuales.

Las **4,041 asignaciones actuales con área coinciden con su último registro individual de área**, incluyendo voluntario, día y turno. No se encontraron áreas huérfanas, referencias a voluntarios inexistentes, áreas de otro comité, áreas archivadas asignadas ni turnos duplicados para la misma persona/día/turno.

Hay **1,884 turnos actuales sin área**. No son automáticamente errores: incluyen turnos nunca distribuidos por área, turnos nuevos, personas archivadas y reprogramaciones. No existe evidencia suficiente para inventar un área para todos ellos.

La consulta usada por Áreas → Asignaciones devuelve **5,626 turnos**, de los cuales **4,035 tienen área**. Los 299 restantes del inventario se explican por 298 turnos de personas archivadas y un registro fuera del calendario.

Durante la revisión el total pasó de 5,924 a 5,925 por actividad concurrente de la aplicación. El anexo de inventario usa un único corte consistente en una transacción PostgreSQL de solo lectura y aislamiento repeatable read.

## Caso de Nahomi

La persona figura como **Nahomi Paola Ampie Somarriba**, comité Guía.

- Viernes 11, T4: **BAUTISTERIO**.
- ID del turno: `5a15d8bb-662f-47b8-84ab-b00871b41d02`.
- ID del área: `ff4e8ba3-4a40-4563-b263-2e6d8303acf6`.
- ID del cambio auditado: `5f362a1a-3b1e-454a-9d36-5d8f535b9860`.
- Cambio de área: **04/09/2026 00:00:02.961, UTC−06:00**, de Sin área a BAUTISTERIO.
- `shifts.updated_at` coincide exactamente con el momento de ese cambio auditado.
- El turno se creó el **03/09/2026 22:58:21.972, UTC−06:00**.
- Voluntaria y área están activas y pertenecen al mismo comité.
- Sus 13 turnos actuales tienen BAUTISTERIO. El viernes 11 tiene T3 y T4.

Se comprobó tanto con SQL como con la API de Supabase: la consulta individual devuelve BAUTISTERIO y la consulta paginada utilizada por Áreas incluye el T4. No hay evidencia de pérdida de esta asignación en la base de datos.

No se reprodujo la sesión visual donde el usuario observa el fallo; no había una pestaña autenticada accesible a la herramienta de navegador. Por ello, la causa exacta en esa sesión queda sin confirmar. El código sí contiene mecanismos capaces de mostrar datos antiguos, descritos abajo.

## Resultado por comité

“Incluidos en Áreas” significa incluidos por la consulta del servidor antes de filtros de día, turno, estado y búsqueda; no significa que se inspeccionara visualmente cada fila del navegador.

| Comité | Turnos en BD | Con área | Sin área | Incluidos en Áreas | Ocultos por archivo | Fuera del calendario |
| --- | --- | --- | --- | --- | --- | --- |
| Facilidades Físicas | 769 | 19 | 750 | 733 | 36 | 0 |
| Guía | 2261 | 2064 | 197 | 2156 | 105 | 0 |
| Historia | 465 | 402 | 63 | 402 | 63 | 0 |
| Parqueo y Transporte | 742 | 692 | 50 | 692 | 50 | 0 |
| Recepción | 264 | 0 | 264 | 264 | 0 | 0 |
| Seguridad | 878 | 856 | 22 | 858 | 20 | 0 |
| Tecnología | 543 | 8 | 535 | 521 | 21 | 1 |
| Traducción | 3 | 0 | 3 | 0 | 3 | 0 |

Los comités archivados Parqueo y Sin Comité tienen cero turnos. Traducción sigue activo como comité, pero sus tres turnos pertenecen a una persona archivada.

## Historial de asignaciones que ya no existen con su ID original

Se localizaron **230 IDs históricos**, de 59 personas, que aparecen en cambios de área y ya no existen como turno actual. Se contrastaron con eliminaciones y solicitudes aprobadas:

| Situación | Cantidad |
| --- | --- |
| Eliminación auditada posterior, sin turno actual en el mismo día/turno | 208 |
| Eliminación auditada posterior, turno recreado y actualmente con área | 4 |
| Eliminación auditada posterior, turno recreado y actualmente sin área | 3 |
| Reprogramación aprobada posterior | 15 |
| Sin explicación documental entre los 230 IDs revisados | 0 |

Las 15 reprogramaciones están respaldadas por solicitudes aprobadas; no basta leer únicamente los cambios de área para reconstruir el estado actual. Los diez aparentes desacuerdos al comparar únicamente la última alta/baja individual de un turno también se explicaron por solicitudes aprobadas posteriores.

Se comprobaron las 23 solicitudes aprobadas: 21 tienen turno de destino actual; los otros dos destinos fueron retirados posteriormente y cuentan con registro de eliminación. Esto no prueba que toda decisión de horario sea correcta para la operación, pero sí explica documentalmente estas diferencias.

## Casos concretos que necesitan revisar el área del turno actual

En los siguientes **seis turnos de cuatro personas** hay un área histórica conocida, pero el turno actual está sin área después de una eliminación/recreación o reprogramación. No son el mismo caso que Nahomi y no deben restaurarse automáticamente: el nuevo día o turno puede requerir un área diferente.

| Persona | Comité | Turno actual sin área | Área histórica | Explicación |
| --- | --- | --- | --- | --- |
| Marlon Alessandro Ramos Lopez | Guía | vie 11 T3 | ENTRADA CUBRE ZAPATOS | Eliminado y creado nuevamente; nuevo turno sin área. |
| Heyzel Noelia Escobar de Ferrufino | Guía | jue 10 T3 | GUIAS TOURS | Eliminado y creado nuevamente; nuevo turno sin área. |
| Heyzel Noelia Escobar de Ferrufino | Guía | vie 11 T3 | GUIAS TOURS | Eliminado y creado nuevamente; nuevo turno sin área. |
| Arlen Maria Alonzo de Menocal | Parqueo y Transporte | mié 16 T1 | Parqueo Externo | Reprogramado desde mié 16 T2; destino sin área. |
| Isaac Antonio Zapata Cerda | Guía | sáb 26 T3 | BAUTISTERIO | Reprogramado desde sáb 26 T2; destino sin área. |
| Arlen Maria Alonzo de Menocal | Parqueo y Transporte | vie 11 T1 | Parqueo Externo | Reprogramado desde vie 11 T4; destino sin área. |

También hay dos destinos de solicitudes aprobadas actualmente sin área para los que no se estableció aquí un área anterior: Ryder Jose Garache Miranda (mié 16, T1) y Heyssel Vanessa López Rocha (vie 11, T1). Se incluyen en el inventario como pendientes, sin atribuirles una asignación perdida.

## Personas archivadas

Hay **298 turnos de 51 personas archivadas**. Áreas → Asignaciones los excluye expresamente al cargar voluntarios. Seis de esos turnos aún conservan un área:

| Persona | Comité | Día | Turno | Área |
| --- | --- | --- | --- | --- |
| Jose Raul Pereira | Guía | lun 14 | T1 | ENTRADA CUBRE ZAPATOS |
| Nubia Yuleybi Selva Jaenscthke | Historia | jue 10 | T1 | Entrevistas |
| Wendy Nicole Lovo Casaya | Historia | jue 10 | T1 | Entrevistas |
| Carolina Mercedes Tellez | Parqueo y Transporte | jue 10 | T2 | Parqueo Templo |
| Denis Antonio Hernandez Robleto | Parqueo y Transporte | mié 16 | T3 | Responsable de turno parqueo externo |
| Denis Antonio Hernandez Robleto | Parqueo y Transporte | mié 23 | T3 | Responsable de turno parqueo externo |

Esta exclusión explica diferencias entre una consulta de todas las filas y la pantalla operativa. No demuestra que archivar esas personas haya sido incorrecto.

## Registro fuera del calendario

Existe un turno de **Inés de los Angeles Ubeda**, comité Tecnología, con día `TEST_INSERT_RT`, T1, ID `78f941e4-1eee-4c18-bc04-4191e6f25ade`. No forma parte del calendario operativo y la pantalla lo excluye. Su clave parece corresponder a una prueba; su procedencia no se confirmó. No se eliminó.

## Hallazgos del código de Áreas → Asignaciones

1. **Los cambios locales pueden prevalecer sobre datos más recientes.** `areaOverrides` se guarda en estado React y reemplaza siempre `data.assignments`. Tras guardar se llama a `router.refresh()`, pero no se limpian las entradas ya confirmadas del mapa. Si otra sesión cambia después el área, un valor local anterior puede seguir ocultando el valor nuevo del servidor. Next.js documenta que refresh conserva el estado React no afectado.
   - [CommitteeAreasClient.tsx:1342](../../app/(coordinator)/shifts/areas/CommitteeAreasClient.tsx)
   - Líneas relevantes: 1342–1350, 1510–1514, 1574.

2. **La pantalla no mantiene una suscripción propia a cambios de asignaciones.** Consume la carga inicial del servidor y refrescos provocados por sus propias acciones; no utiliza el estado de asignaciones en tiempo real del contexto de coordinación. Una pantalla abierta puede quedar desactualizada cuando otra sesión asigna, elimina o reprograma un turno.
   - [CommitteeAreasClient.tsx](../../app/(coordinator)/shifts/areas/CommitteeAreasClient.tsx)
   - [Consulta de datos](../../lib/services/committee-area-query.service.ts)

3. **Los filtros pueden ocultar correctamente una asignación existente.** “Sin área” excluye a Nahomi una vez asignado BAUTISTERIO. La búsqueda exige que todos los términos estén presentes y no corrige errores ortográficos: “Paila” no coincide con “Paola”. Al cambiar de día el turno vuelve a T1. Estos comportamientos están comprobados en el código, pero no se sabe cuál filtro estaba activo en la sesión reportada.
   - Líneas relevantes de CommitteeAreasClient.tsx: 380–411, 540–546.

4. **La paginación de turnos no define un orden estable.** Se usa rango de 1,000 filas sin `order` para turnos. Puede producir resultados inconsistentes entre páginas cuando cambian las filas o el plan de consulta. En esta revisión la carga original y otra ordenada por ID devolvieron exactamente los mismos IDs para los ocho comités: **cero omisiones y cero duplicados reproducidos**. Es un riesgo de implementación, no la causa confirmada de Nahomi.
   - [committee-area-query.service.ts:178](../../lib/services/committee-area-query.service.ts)
   - [supabase-helpers.ts](../../lib/supabase-helpers.ts)

5. **Recrear un horario no conserva automáticamente áreas.** `saveShifts` elimina todas las filas del voluntario y las inserta nuevamente sin `area_id`. El flujo de aprobar una reprogramación tampoco copia el área al destino nuevo. El guardado completo además usa operaciones separadas de eliminación/inserción. Son vías capaces de dejar nuevos turnos sin área; no se atribuye a saveShifts ninguno de los casos sin evidencia de ejecución.
   - [volunteer-mutation.service.ts:2119](../../lib/services/volunteer-mutation.service.ts)
   - [shift-change-actions.ts:229](../../app/actions/shift-change-actions.ts)

El guardado específico de áreas sí usa una función transaccional que actualiza los turnos y escribe sus entradas de auditoría conjuntamente. Los datos actuales auditados no muestran un desacuerdo entre ese historial y el área persistida.

## Desglose de las 32 áreas

| Comité | Área | Turnos en BD | Turnos de personas no archivadas |
| --- | --- | --- | --- |
| Facilidades Físicas | Entrada | 19 | 19 |
| Guía | ASISTENCIA | 58 | 58 |
| Guía | BAUTISTERIO | 201 | 201 |
| Guía | ENTRADA CUBRE ZAPATOS | 560 | 559 |
| Guía | GUIAS SALÒN | 132 | 132 |
| Guía | GUIAS TOURS | 296 | 296 |
| Guía | MOSTRADOR DE BIENVENIDA | 82 | 82 |
| Guía | RESPONSABLE DE TURNO - GUIAS TOUR | 111 | 111 |
| Guía | SALA DE INSTRUCCIÒN | 52 | 52 |
| Guía | SALA DE INVESTIDURA | 120 | 120 |
| Guía | SALA DE LA NOVIA | 73 | 73 |
| Guía | SALA DE SELLAMIENTO | 86 | 86 |
| Guía | SALIDA CUBRE ZAPATOS | 202 | 202 |
| Guía | SALON CELESTIAL | 91 | 91 |
| Historia | Archivo | 29 | 29 |
| Historia | Entrevistas | 137 | 135 |
| Historia | Fotografia | 53 | 53 |
| Historia | Redaccion | 70 | 70 |
| Historia | Responsable de turno | 57 | 57 |
| Historia | Transcripción | 56 | 56 |
| Parqueo y Transporte | Parqueo Externo | 380 | 380 |
| Parqueo y Transporte | Parqueo Templo | 216 | 215 |
| Parqueo y Transporte | Responsable de turno parqueo externo | 55 | 53 |
| Parqueo y Transporte | Responsable de turno Templo | 41 | 41 |
| Seguridad | Seguridad Centro de Arribo | 66 | 66 |
| Seguridad | Seguridad Entrada Casa de Huéspedes | 57 | 57 |
| Seguridad | Seguridad Entrada Peatonal | 87 | 87 |
| Seguridad | Seguridad Entrada Templo | 192 | 192 |
| Seguridad | Seguridad Entrada Vehicular Principal | 2 | 2 |
| Seguridad | Seguridad Recorrido de Guia | 311 | 311 |
| Seguridad | Seguridad Salida de los Tours | 141 | 141 |
| Tecnología | Escanear QR | 8 | 8 |

## Qué se propone para la siguiente fase

- Corregir la sincronización de Áreas → Asignaciones, reconciliar el estado local después de guardar y refrescar ante cambios externos.
- Aplicar orden estable a la paginación y mostrar errores de carga sin presentar datos parciales como completos.
- Preservar IDs y áreas de los turnos que no cambian al guardar un horario completo.
- Definir expresamente qué hacer con el área al reprogramar: conservarla cuando corresponda o mostrar claramente que queda pendiente.
- Revisar individualmente los seis turnos con área histórica conocida antes de cualquier restauración.
- Revisar el turno de prueba y la política de visibilidad de archivados.

**No se aplicó ninguna corrección.** No se necesita volver a asignar BAUTISTERIO a Nahomi para reparar sus datos actuales; ya está persistido.

## Anexos y límites

- `asignaciones-completas.json`: las 5,925 filas actuales, con nombre, comité, estado, día, turno, área, identificadores, fechas y resultado del contraste de área; formato de columnas más filas.
- `historial-230-turnos.json`: los 230 IDs históricos y su clasificación, con IDs de evidencia y solicitudes cuando corresponde.
- `consultas-solo-lectura.sql`: consultas principales usadas para el inventario y los contrastes.

El inventario no contiene teléfonos, PIN, credenciales ni motivos personales de solicitudes. “Sin auditoría individual de área” en el inventario significa que no existe un último cambio individual de área para ese ID actual; todos esos turnos están actualmente sin área y ello por sí solo no constituye error.

Esta revisión verifica integridad, historial y contrato de carga de datos. No confirma visualmente todas las filas en una sesión del usuario, no determina la intención de cada coordinador y no constituye una auditoría general de seguridad. El código revisado es el del espacio de trabajo; no se verificó que sea idéntico al despliegue abierto por el usuario.

