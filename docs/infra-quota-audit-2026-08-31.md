# Auditoría de cuotas — Volunteer Manager

Fecha: 31 de agosto de 2026. Revisión de solo lectura de los paneles autenticados de Supabase y Vercel, contrastada con el repositorio local. No se cambiaron planes, configuración, datos ni código de la aplicación.

## Conclusión

Hay dos límites gratuitos superados: salida de datos (egress) de Supabase y CPU activa de Vercel. El almacenamiento de la base y las cuotas de Realtime tienen margen. Hay evidencia de consultas amplias repetidas y trabajo evitable; no es simplemente una base de datos demasiado grande.

Si el mes operativo comienza ahora y se necesita continuidad, es razonable contratar temporalmente Pro en ambos servicios y optimizar. El pago amplía capacidad, pero no arregla consultas, recargas ni errores funcionales. No se puede garantizar un coste o capacidad futuros sin conocer la concurrencia prevista y medir tras optimizar.

## 1. Cuotas observadas

### Supabase

Organización: invitacionesdigitales505. Plan Free. Ciclo mostrado: **19 agosto–19 septiembre de 2026**. Dos proyectos activos (VolunteerManager e invitaciones-505) y uno pausado.

| Recurso | Organización | Cuota Free | Interpretación |
| --- | ---: | ---: | --- |
| Egress | 6,516 GB | 5 GB | 130,3%; exceso de 1,516 GB |
| Conexiones Realtime, pico | 62 | 200 | 31%; VolunteerManager: 60 |
| Mensajes Realtime | 26.566 | 2.000.000 | 1,33% |
| Base de VolunteerManager | Aproximadamente 47 MB | 500 MB por proyecto | Aproximadamente 9%; detalle del panel: 45,12 MB |
| Storage | 0 GB | 1 GB | No es el problema |
| Egress cacheado | 0 GB | 5 GB | No es el problema |
| Edge Functions | 0 | 500.000 | No es el problema |

Al filtrar por VolunteerManager, el egress sigue siendo 6,516 GB a la precisión del panel: prácticamente todo procede de este proyecto. El panel presenta una advertencia de cuota excedida. Esto no implica que ya esté completamente suspendido: la vista del proyecto mostraba estado Healthy.

El contador de Auth MAU muestra cero; no significa que la aplicación no tenga usuarios. El proyecto utiliza sesiones propias, por lo que ese contador no sirve como medida de concurrencia real de la aplicación.

Fuente: [Usage Supabase](https://supabase.com/dashboard/org/xzfhqwyujmkqsjivygco/usage?projectRef=tjcrgohdkntkixirhilo#egress).

### Vercel

Equipo: kendyr7's projects. Plan Hobby. Período mostrado: **últimos 30 días, 1–31 agosto de 2026**. Estas cifras incluyen todos los proyectos del equipo; no son exclusivas de VolunteerManager.

| Recurso | Consumido | Cuota Hobby | Porcentaje aproximado |
| --- | ---: | ---: | ---: |
| Fluid Active CPU | 4 h 8 min | 4 h | 103,4% |
| Function Invocations | 759.000 | 1.000.000 | 75,9% |
| Edge Requests | 564.000 | 1.000.000 | 56,4% |
| Fast Data Transfer | 31,86 GB | 100 GB | 31,9% |
| Fast Origin Transfer | 2,59 GB | 10 GB | 25,9% |
| Fluid Provisioned Memory | 32,2 GB-h | 360 GB-h | 8,9% |

El desglose de CPU atribuye a **volunteer-manager 3 h 49 min, el 92,6%** del equipo. Los otros proyectos explican el resto. El proyecto por sí solo está cerca del límite; el equipo completo ya lo excede.

Fuente: [Usage Vercel](https://vercel.com/kendyr7s-projects/~/usage).

## 2. Diagnóstico basado en consumo real

### Supabase: el tráfico procede principalmente de consultas, no de Realtime

Muestras del gráfico diario de VolunteerManager:

- 23 agosto: PostgREST 1,303 GB (99,3%); Realtime 10,009 MB (0,7%).
- 31 agosto, parcial al consultar: PostgREST 921,528 MB (99,5%); Realtime 4,27 MB (0,5%).

Son proporciones de esos días concretos, no un desglose exacto de todo el mes. El volumen bajo de mensajes Realtime y el almacenamiento vacío refuerzan la prioridad de reducir consultas y respuestas repetidas.

En Query Performance se observaron:

- 41.635 llamadas a la consulta paginada de `shifts.*` con nombre y descripción de área, sin filtro explícito de comité o fecha en la consulta principal; media de 24 ms.
- 50.257 llamadas a la consulta de turnos por días del evento utilizada por el dashboard; media de 4 ms.
- Otras variantes de lectura completa de turnos también aparecen entre las consultas con más tiempo acumulado.

Los contadores de `pg_stat_statements` son acumulados desde su reinicio, cuya fecha no quedó visible. **No deben interpretarse como llamadas de este ciclo de facturación.** Las filas procesadas de estas consultas representan la respuesta agregada de PostgREST, no necesariamente el número de turnos contenidos en el JSON.

La lectura interna del WAL para Realtime acumula muchas ejecuciones, pero no equivale al número de mensajes facturados ni prueba una fuga del código de aplicación. No es motivo para desactivar Realtime indiscriminadamente.

Fuente: [Query Performance](https://supabase.com/dashboard/project/tjcrgohdkntkixirhilo/observability/query-performance).

### Vercel: dashboard y trabajo periódico

La vista por ruta disponible mostró **las últimas 12 horas**, no todo el mes. El historial de 30 días exigía Observability Plus; no se activó.

| Ruta | Invocaciones | CPU activa |
| --- | ---: | ---: |
| `/dashboard` | 980 | 1 min |
| `/volunteers` | 1.200 aprox. | 37 s |
| `/api/notifications/sync` | 333 | 27 s |
| `/api/notifications` | 408 | 19 s |
| `/areas` | 793 | 18 s |
| `/api/auth/session/refresh` | 1.100 aprox. | 14 s |
| `/replacements` | 198 | 5 s |

En esa ventana había unas 5.600 invocaciones; las tarjetas de errores y timeouts mostraban 0% redondeado. No se observó evidencia de una aplicación globalmente fallando en esa muestra.

**Corrección de prioridad respecto de la revisión inicial:** la consulta cada cinco segundos de solicitudes es mejorable, pero no domina la CPU en esta ventana. Dashboard, cargas compartidas y notificaciones merecen prioridad.

Fuente: [Funciones de Volunteer Manager](https://vercel.com/kendyr7s-projects/volunteer-manager/observability/vercel-functions?environment=all).

## 3. Cambios recomendados, aún no implementados

1. **Reducir la carga compartida de turnos.** `lib/coordinator-data-context.tsx:248` recorre toda la tabla y recupera todas las columnas y detalles de área. Aplicar filtros adecuados en servidor/SQL, seleccionar campos necesarios y cargar conjuntos grandes solo en pantallas que los requieran. Conservar autorización y RLS.
2. **Evitar recálculos completos del dashboard por cada cambio.** `app/(coordinator)/dashboard/page.tsx:401` y `app/actions/dashboard.ts:143` vuelven a descargar varios conjuntos y agregarlos en Vercel. Usar agregaciones en la base, deduplicación y una estrategia explícita de actualización/caché por ámbito autorizado.
3. **Separar lectura de notificaciones del procesamiento global.** `components/NotificationCenter.tsx:156` activa `/sync` periódicamente por navegador; `lib/notifications/worker.ts` ejecuta trabajo de alcance global. Centralizar o limitar globalmente ese trabajo; mantener la lectura de bandeja ligera. El bloqueo actual evita simultaneidad, pero no todas las ejecuciones sucesivas redundantes.
4. **Reducir polling de solicitudes.** `app/(coordinator)/replacements/page.tsx:77` consulta cada 5 segundos. Filtrar pendientes e historial en servidor, paginar y actualizar por evento o con menor frecuencia y pausa cuando no sea visible. No se necesita descargar todo el historial para detectar una solicitud nueva.
5. **Revisar recargas forzadas y renovación al recuperar foco.** Evitar que varios eventos del mismo cambio o pestaña provoquen trabajo repetido. No debilitar autenticación para ahorrar consultas.

La evidencia demuestra que existen lecturas repetidas y señala rutas prioritarias; no permite atribuir cada byte o cada segundo del mes a una única línea de código. Desarrollo, pruebas y versiones anteriores también pueden formar parte del consumo acumulado.

## 4. Proyección y decisión de compra

### Supabase

6,516 GB consumidos desde el 19 de agosto hasta el 31 equivalen a un orden de **15–17 GB por 30 días** si se mantuviera ese promedio. Mantener todos los días el día alto inspeccionado, aproximadamente 1,31 GB/día, daría unos **39 GB por 30 días**. Son escenarios aritméticos, no una previsión de nuevas cargas del evento.

Pro incluye 250 GB de egress: hay margen amplio frente al ritmo observado. La base de datos no requiere comprar almacenamiento adicional por su tamaño actual. Optimizar no resta el egress que ya se consumió; las restricciones por este recurso se levantan al reiniciar el ciclo o mejorar el plan, según las reglas del proveedor.

**Coste importante:** Pro es por organización. US$25/mes incluye US$10 de crédito de cómputo, suficiente para un Nano/Micro. Mantener los dos proyectos activos de esta organización durante todo el mes implica aproximadamente **US$35/mes**, antes de impuestos y extras. El proyecto pausado no consume cómputo mientras siga pausado. No se hizo una contratación ni se obtuvo una factura definitiva.

Si se quisiera que solo VolunteerManager perteneciera a una organización Pro con un único proyecto Nano/Micro, el escenario base sería US$25. Cualquier traslado o cambio de otro proyecto necesita una decisión independiente y no se realizó.

### Vercel

La CPU del equipo ya supera Hobby. Si el uso importante empieza ahora y no se puede arriesgar una restricción, recomiendo **un mes Pro, además de optimizar**. Si hay margen operativo para esperar, puede optimizarse primero y observar cómo cambia la ventana de consumo; no daría por seguro que Hobby alcanza sin medirlo.

Pro tiene una tarifa base de US$20/mes con un puesto de despliegue y US$20 de crédito de consumo. No es una promesa de uso ilimitado. El volumen actual no parece exigir un plan superior a Pro, pero el uso futuro y el resto de proyectos del equipo pueden cambiar la factura.

### Presupuesto orientativo

- Organización Supabase actual con dos proyectos activos + Vercel Pro: **aproximadamente US$55 por mes**, antes de impuestos y extras.
- Un solo proyecto Nano/Micro activo en la organización Supabase Pro + Vercel Pro: **aproximadamente US$45 por mes**, antes de impuestos y extras.

No se recomiendan upgrades de cómputo grandes, almacenamiento adicional, Observability Plus ni otros complementos únicamente por los datos de esta revisión.

## 5. Cómo comprobar que pagar no oculta el problema

- Registrar una línea base por día y por hora activa: egress, llamadas PostgREST, CPU y solicitudes a cada ruta.
- Optimizar primero las cargas de turnos, dashboard y notificaciones; comparar 24–48 horas equivalentes, normalizando por usuarios y actividad.
- Hacer una comprobación controlada con la concurrencia prevista antes del día de mayor uso. No se hicieron pruebas de carga contra producción durante esta auditoría.
- En Supabase, conservar Spend Cap si se contrata Pro y revisar extras: el cómputo no está cubierto por ese límite.
- En Vercel, revisar el presupuesto y decidir expresamente si alcanzar el límite debe pausar proyectos. Una alerta no es por sí sola un corte del gasto; pausar evita uso futuro a costa de interrumpir el servicio.
- Para usar Pro un solo mes, anotar la fecha real de renovación y revisar la bajada de plan al finalizar, después de exportar/conservar lo necesario. No se creó una automatización ni se cambió ninguna suscripción.

Falta para afinar el dimensionamiento: número máximo esperado de coordinadores y voluntarios conectados simultáneamente, horarios de operación y fecha de inicio del mes intensivo.

## Referencias oficiales de precios y límites

- [Supabase: precios](https://supabase.com/pricing).
- [Supabase: egress y reinicio de cuotas](https://supabase.com/docs/guides/platform/manage-your-usage/egress).
- [Supabase: factura y cómputo por proyecto](https://supabase.com/docs/guides/platform/your-monthly-invoice).
- [Supabase: cómputo y proyectos pausados](https://supabase.com/docs/guides/platform/manage-your-usage/compute).
- [Supabase: Spend Cap y exclusiones](https://supabase.com/docs/guides/platform/cost-control).
- [Vercel: Pro y crédito de consumo](https://vercel.com/docs/plans/pro-plan).
- [Vercel: gestión de gasto](https://vercel.com/docs/spend-management).
