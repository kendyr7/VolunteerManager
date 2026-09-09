# Implementación de persistencia del diario

Estado: etapa 1 implementada en el frontend y aplicada al proyecto remoto. La migración y sus políticas fueron verificadas en Supabase; la etapa 2 queda para validar identidad con voluntarios de ensayo y mover las operaciones sensibles a un servicio del diario. Diseño revisado el 9 de septiembre de 2026.

## Comportamiento que se conserva

- Libreta con varias notas, incluso para el mismo día. No habrá una restricción única por voluntario y fecha.
- Notas sin turno; al asociar una nota, solo se ofrecen días con turnos del dueño.
- Título, contenido enriquecido, listas y casillas, enlaces, resaltado y subrayado de color, colores de nota, patrones, etiquetas y notas fijadas.
- Crear y editar al cerrar el editor; confirmación explícita antes de eliminar.
- Autoguardado mientras se escribe y al cerrar el editor, con una espera breve para agrupar cambios y estados visibles de «Guardando automáticamente…», «Guardado» y «No se pudo guardar · Reintentar».
- Ningún acceso al diario desde coordinadores, administradores de la aplicación, reportes o exportaciones de voluntarios.

## 1. Identidad y aislamiento antes de guardar contenido

La aplicación usa una cookie `session` con un JWT propio firmado en `lib/auth.ts`; su `sub` es el identificador de un voluntario o de un perfil de coordinación. No se debe asumir que `auth.uid()` identifica automáticamente al voluntario ni que el cliente SSR actual envía ese JWT a Supabase.

En la etapa 2 se comprobará, con identidades de ensayo sin contenido personal, que Supabase acepta la firma y los claims de una sesión de voluntario. Si no, habrá que integrar una clave de firma admitida o un intercambio de identidad validado en el servidor. No cambiar claves ni migrar el login incidentalmente.

El cliente de datos del diario operará con la identidad validada del usuario y RLS, no con `service_role`. La ruta actual usa el servicio existente para leer turnos; ese privilegio no se trasladará a la lectura o escritura de notas.

Todas las políticas exigirán simultáneamente:

- sesión válida y claim firmado `userType = volunteer`;
- `volunteer_id = auth.uid()`;
- dueño inmutable en actualizaciones.

Aplicar políticas separadas para SELECT, INSERT, UPDATE y DELETE, con USING y WITH CHECK donde corresponda. Denegar a anónimos y perfiles de coordinación aunque tengan rol Admin. El servidor derivará el dueño de la sesión: ningún `volunteer_id` enviado por el navegador decidirá la autorización.

## 2. Tabla `volunteer_journal_notes`

| Campo | Tipo propuesto | Propósito |
|---|---|---|
| `id` | uuid, PK | Identificador generado una vez por nota; reintentos idempotentes |
| `volunteer_id` | uuid, FK a volunteers | Propietario obligatorio e inmutable |
| `title` | text | Título opcional, hasta 200 caracteres |
| `content_html` | text | Contenido saneado con lista permitida de elementos y atributos |
| `content_text` | text | Texto derivado en servidor para búsqueda y vista previa |
| `content_version` | smallint | Versión del formato del editor, inicialmente 1 |
| `shift_date` | date, nullable | Día asociado; `NULL` representa una nota sin turno |
| `color` | text | CHECK con los nueve colores actuales; default `default` |
| `pattern` | text | CHECK: none, grid, dots, lines, gradient |
| `is_pinned` | boolean | Default false |
| `tags` | text[] | Etiquetas personales, sin catálogo público compartido |
| `revision` | integer | Control de modificaciones simultáneas; inicia en 1 |
| `created_at`, `updated_at` | timestamptz | Fechas administradas por el servidor |

Límites iniciales: 100 KB de HTML por nota, 8 etiquetas de hasta 30 caracteres, sin duplicados por mayúsculas o tildes. Una nota debe contener título, texto o una estructura útil como una lista de tareas. Los límites se validan en servidor y se reflejan en el editor antes de activar persistencia.

Índices iniciales: `(volunteer_id, is_pinned DESC, updated_at DESC, id)` para listar y `(volunteer_id, shift_date)` para filtrar. Incorporar búsqueda de texto indexada cuando el volumen lo justifique; todas las búsquedas y conteos deben quedar dentro de RLS.

No asociar la nota por FK a un turno individual: varios turnos comparten día y pueden reasignarse. Al crear o cambiar `shift_date`, validar que el dueño tiene un turno en esa fecha usando la conversión oficial de `day_key`. Si después pierde ese turno, conservar el recuerdo y permitir editar su contenido, sin permitir nuevas asociaciones no autorizadas. La validación transaccional debe afectar solo nuevas asociaciones, no bloquear notas históricas.

Antes de elegir ON DELETE para el voluntario, revisar el flujo existente de eliminación de cuentas. Evitar que una eliminación administrativa de un registro operativo borre silenciosamente el diario. Resolver explícitamente conservación y eliminación de cuenta; propuesta inicial: RESTRICT, con un proceso separado de eliminación de datos autorizado.

## 3. Servicio y operaciones

Crear un servicio exclusivo del diario y operaciones para listar, crear, editar y eliminar. Las acciones rápidas (fijar, color, patrón, turno y casillas) usan el mismo control de autorización y revisión.

- Validar sesión, tipo de usuario, entrada, límites y pertenencia en cada operación.
- Sanear HTML también en servidor: no confiar en el saneado del navegador; preservar únicamente los formatos admitidos y enlaces con protocolos permitidos.
- Creación idempotente con el UUID del cliente; devolver el registro canónico.
- Actualizar/eliminar con `id` y `revision` esperada; un conflicto no sobrescribe cambios de otro dispositivo.
- Timestamps y aumento de revisión en la base de datos.
- Consultas sin caché compartida. No registrar títulos, texto, etiquetas ni HTML en logs, analítica, auditorías generales o errores.
- Borrado real después de confirmar. No crear una papelera oculta que contradiga la interfaz; los respaldos siguen su retención operativa documentada.

## 4. Conexión con la interfaz

Sustituir el almacenamiento en memoria de `JournalProvider` por carga del diario del usuario y operaciones del servicio. Retirar la compatibilidad temporal con `JournalEntry`; no migrar automáticamente notas ficticias ni datos de revisión.

Mantener el editor mientras una operación está pendiente o falla. Mostrar estados discretos «Guardando», «Guardado» y «No se pudo guardar · Reintentar». No mostrar éxito antes de la confirmación del servidor. Proteger borradores ante navegación durante un fallo. No almacenar contenido personal en localStorage por defecto.

La implementación actual usa el cliente Supabase del navegador con la sesión JWT existente y una cola de autoguardado de aproximadamente 700–850 ms. Cada nota conserva su UUID para que los reintentos sean idempotentes; al cerrar el editor se envía inmediatamente el último estado conocido y se mantiene la nota en memoria si la red falla. La carga inicial combina notas remotas con cualquier nota creada mientras la solicitud estaba pendiente.

Las acciones rápidas pueden ser optimistas con reversión en caso de error. El diálogo de eliminación permanecerá abierto y deshabilitará envíos duplicados durante la petición; ante fallo conserva la nota y ofrece reintento. Cerrar sesión elimina datos y borradores del estado del cliente. Resolver conflictos con una opción explícita para conservar el borrador y recargar la versión remota.

## 5. Validación y activación

1. **Completado:** aplicar `supabase/migrations/20261029000000_volunteer_journal_notes.sql` y verificar tabla, RLS, políticas, índices, triggers y funciones en Supabase.
2. Dos voluntarios A/B: probar aislamiento de lectura, búsqueda, conteos, creación, edición y borrado; incluir IDs ajenos y cambio de dueño.
3. Probar sesiones anónimas, expiradas y perfiles de coordinación/Admin tanto en servidor como directamente en la API con identidades restringidas; no probar RLS con `service_role`.
4. Probar fechas asignadas/no asignadas, varias notas por fecha, notas sin turno y recuerdos cuyo turno fue retirado.
5. Probar ida y vuelta de formato, enlaces, casillas, color, patrón, fijado y etiquetas, incluido HTML malicioso y límites de tamaño.
6. Probar recarga, cierre de sesión, reintentos sin duplicados, fallos de red y edición concurrente.
7. Revisar consultas, exportaciones, logs y canales realtime para asegurar que no incluyen contenido del diario.
8. Completar estas pruebas antes de ampliar la persistencia con el servicio de servidor y el control de conflictos; comprobar que revertir el frontend no elimina datos ya guardados.

## Alcance de «solo el voluntario»

Esta propuesta impide el acceso de otros usuarios, coordinadores y administradores de la aplicación. RLS no es cifrado de extremo a extremo: operadores con privilegios de base de datos o acceso a respaldos pueden leer datos almacenados en claro. Si también se exige excluir a esos operadores, definir cifrado en el dispositivo y recuperación de claves antes de crear el esquema definitivo; eso cambia búsqueda, sincronización y recuperación de cuenta.

Referencias oficiales: [RLS y límites de service_role](https://supabase.com/docs/guides/database/postgres/row-level-security), [JWT externos y claves admitidas](https://supabase.com/docs/guides/auth/jwts).
