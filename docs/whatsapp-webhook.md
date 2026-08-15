# Webhook de WhatsApp Cloud API

El webhook que recibe mensajes y respuestas interactivas es:

`/api/webhooks/whatsapp`

Meta debe apuntar este endpoint a la URL HTTPS pública de producción. Una URL que use `localhost` no puede recibir llamadas de Meta.

## Variables del servidor

- `WHATSAPP_ENABLED`: permite pausar envíos y procesamiento entrante con `false`.
- `WHATSAPP_TOKEN`: token con permisos `whatsapp_business_messaging` y, para la comprobación de suscripción, `whatsapp_business_management`.
- `WHATSAPP_PHONE_NUMBER_ID`: identificador del número remitente.
- `WHATSAPP_VERIFY_TOKEN`: valor privado que debe coincidir con el configurado en Meta Webhooks.
- `WHATSAPP_WABA_ID`: identificador de la cuenta de WhatsApp Business.
- `META_APP_SECRET`: secreto de la aplicación utilizado para validar `X-Hub-Signature-256`.
- `WHATSAPP_GRAPH_VERSION`: versión de Graph API, por ejemplo `v20.0`. Es opcional mientras se mantenga el valor predeterminado.
- `NEXT_PUBLIC_APP_URL`: origen público HTTPS de la aplicación desplegada.
- `SUPABASE_SERVICE_ROLE_KEY`: necesaria para que el webhook use su bandeja entrante privada con RLS.
- `CRON_SECRET`: secreto que autoriza exclusivamente al programador de recordatorios automáticos.
- `WHATSAPP_REMINDER_LEAD_DAYS`: fecha preferida de los recordatorios automáticos; el valor predeterminado es `2` días y acepta valores entre `1` y `3`.
- `WHATSAPP_MESSAGING_LIMIT`: límite real de conversaciones iniciadas por la organización; el valor predeterminado es `250` destinatarios únicos en 24 horas.
- `WHATSAPP_CAPACITY_RESERVE_PERCENT`: porcentaje reservado para envíos que no son recordatorios automáticos; el valor predeterminado es `10`, por lo que la automatización utiliza como máximo `225` de `250` destinatarios.

Todas las variables deben configurarse también en el ambiente de producción; tenerlas únicamente en `.env.local` no configura el despliegue.

## Configuración en Meta

1. Configurar la URL pública `https://DOMINIO/api/webhooks/whatsapp` en el producto Webhooks.
2. Usar el mismo `WHATSAPP_VERIFY_TOKEN` del servidor.
3. Suscribir el campo `messages` de `whatsapp_business_account`.
4. Suscribir la aplicación a la WABA con `POST /{WABA-ID}/subscribed_apps`.
5. Confirmar la suscripción con `GET /{WABA-ID}/subscribed_apps`.

El paso 5 puede comprobarse sin mostrar secretos ejecutando:

```bash
npm run check:whatsapp
```

Si la comprobación indica que no existe ninguna aplicación suscrita, la suscripción puede crearse explícitamente y verificarse con:

```bash
npm run subscribe:whatsapp
```

## Bandeja entrante durable e idempotencia

Antes de desplegar esta versión, ejecutar en Supabase SQL Editor la migración:

`supabase/migrations/20261013000000_whatsapp_inbound_events.sql`

Para registrar entrega, lectura y errores de los mensajes salientes, ejecutar también:

`supabase/migrations/20261014000000_whatsapp_delivery_statuses.sql`

La tabla `whatsapp_inbound_events` conserva cada mensaje entrante usando el `wamid` único de Meta. Su ciclo de procesamiento es:

1. El webhook guarda y reclama el mensaje.
2. Una repetición concurrente queda en espera y un mensaje ya procesado se ignora.
3. Los fallos recuperables se reintentan hasta cinco veces, con espera creciente.
4. Un procesamiento abandonado durante más de cinco minutos puede ser reclamado nuevamente.
5. Un evento agotado queda guardado para diagnóstico y se reconoce ante Meta para evitar un ciclo infinito.

La tabla no concede acceso a usuarios `anon` ni `authenticated`; solamente el servidor con `service_role` puede consultarla o modificarla.

Si la migración aún no existe, el webhook mantiene temporalmente el procesamiento anterior y registra una advertencia. Esta compatibilidad evita interrumpir los mensajes existentes, pero no ofrece deduplicación hasta aplicar la migración.

## Diagnóstico

Al recibir una respuesta, los logs del servidor deben contener una línea que comienza con `[WHATSAPP WEBHOOK]` o `Received Meta WhatsApp Webhook message`.

- Si no aparece, revisar URL pública, campo `messages` y suscripción WABA.
- Si aparece pero la respuesta automática falla, revisar el error de Meta o Supabase que sigue a esa línea.
- Los eventos de estado sin mensajes se reconocen y responden `200` con estado `ignored`.
- Una respuesta `503` indica que Meta debe volver a entregar uno o más mensajes pendientes.
- Los contadores `duplicates`, `deferred` y `exhausted` de la respuesta ayudan a distinguir repeticiones, esperas y fallos definitivos.

## Contactos y auditoría

- La opción para contactar al coordinador consulta usuarios de plataforma activos con rol `Editor`, tipo `committee` y el mismo `committee_id` del voluntario.
- No existen contactos de respaldo escritos directamente en el código. Si un comité no tiene coordinador activo con teléfono, el bot informa que la configuración está pendiente.
- Las confirmaciones de asistencia y las solicitudes de cambio creadas por WhatsApp escriben una entrada en `activity_logs` con el ID del voluntario como `target_id`.
- El `wamid` se guarda dentro del contexto de auditoría para evitar entradas repetidas por una misma entrega de Meta.
- Una confirmación previa se clasifica como `Confirmación`; no se interpreta como check-in ni genera horas de servicio.

## Estados de entrega

- `reminder_logs.status` conserva el estado funcional del voluntario: contactado, confirmado o error.
- `reminder_logs.delivery_status` conserva el estado independiente reportado por Meta: procesando, enviado, entregado, leído o error.
- Cada callback se guarda de forma idempotente en `whatsapp_message_status_events`.
- Los callbacks se ordenan por el `timestamp` de Meta, porque pueden llegar fuera de orden.
- Un estado recibido antes de que exista el recordatorio se conserva y un trigger lo aplica al insertar el registro.
- `/reminders` actualiza automáticamente el estado más reciente, muestra un resumen por turno y el detalle del error cuando Meta lo proporciona.

### Alcance por remitente

- Los administradores pueden consultar los estados de todos los recordatorios, incluidos los envíos automáticos.
- Los coordinadores de comité y de tecnología con permiso para avisos consultan únicamente los recordatorios enviados desde su propia cuenta.
- `reminder_logs.sent_by_user_id` identifica al remitente. Los procesos automáticos dejan este campo en `NULL`.
- La tabla no se consulta directamente con la clave pública de Supabase; la aplicación aplica el alcance desde una acción autenticada del servidor.

### Reintentos controlados

- Solo puede reintentarse el último envío cuando su estado de entrega es `failed`.
- Se exige una espera de 30 segundos entre intentos y se permiten como máximo tres intentos consecutivos.
- El servidor obtiene el teléfono, nombre y comité directamente del perfil activo del voluntario; esos datos no se confían al navegador.
- Cada reintento crea un nuevo registro de entrega y una entrada de auditoría con su número de intento.
- `/reminders` muestra una alerta dentro del turno cuando existen fallos y cambia la acción de envío por una acción explícita de reintento.

## Recordatorios automáticos

Antes de desplegar el programador, ejecutar también:

`supabase/migrations/20261016000000_automatic_reminder_claims.sql`

La distribución durable y los datos de capacidad se agregan con:

- `supabase/migrations/20260814214003_whatsapp_reminder_capacity_schedule.sql`
- `supabase/migrations/20260814221205_whatsapp_reminder_schedule_volunteer_index.sql`

- Vercel ejecuta `/api/reminders/cron` diariamente a medianoche de Guatemala (`06:00 UTC`). La frecuencia es compatible con los planes Hobby y Pro.
- La ruta falla con `401` si falta `CRON_SECRET` o el encabezado `Authorization: Bearer ...` no coincide.
- El valor predeterminado intenta enviar cada aviso dos días calendario antes. Si una fecha rebasa la capacidad automática, el plan redistribuye grupos completos de destinatarios entre tres, dos y un día antes del turno, sin bajar de 24 horas de anticipación.
- `/settings`, dentro de **Recordatorios automáticos**, muestra únicamente a administradores la demanda original y la distribución final por fecha. La gráfica usa el porcentaje real sobre `WHATSAPP_MESSAGING_LIMIT`, marca la reserva de seguridad y muestra cuántos destinatarios fueron reubicados o quedaron sin capacidad.
- La proyección descuenta envíos ya registrados, excluye voluntarios archivados, no duplica números compartidos y conserva juntos todos los turnos del mismo teléfono en una misma fecha de evento.
- Si el límite móvil de las últimas 24 horas sigue ocupado durante la ejecución, el recordatorio queda pendiente para la siguiente ejecución diaria. La ruta también recoge fechas programadas anteriores, pero rechaza el envío en cuanto ya no pueda mantener 24 horas de anticipación.
- Cuando no existe capacidad dentro de esa ventana, el registro queda con el código `CAPACITY_LIMIT` y el mensaje visible comienza con **Se superó el límite de WhatsApp**.
- El límite proyectado cubre solamente recordatorios automáticos; otras plantillas iniciadas por la organización dentro de la misma ventana móvil de 24 horas también consumen capacidad en Meta.
- El cron reconoce tanto claves de fecha cortas (`jue 10`) como ISO (`2026-09-10`) y usa siempre el horario oficial del turno.
- Cada voluntario recibe un mensaje independiente por turno. Si tiene dos turnos el mismo día recibe dos mensajes, lo que permite confirmar y rastrear cada turno por separado con la plantilla aprobada actual.
- `automation_key` se reclama antes de contactar Meta. Una segunda ejecución del cron omite ese mismo voluntario, fecha y turno en vez de duplicar el mensaje.
- Los envíos automáticos quedan con `sent_by_user_id = NULL`: los administradores los ven en `/reminders`, pero no se mezclan con los envíos propios de los coordinadores.
- La respuesta del cron solo devuelve contadores; no expone nombres ni teléfonos.
- Una prueba sin envíos puede ejecutarse con `GET /api/reminders/cron?dryRun=1&targetDate=2026-09-10`, incluyendo siempre el encabezado `Authorization: Bearer $CRON_SECRET`. `targetDate` solamente se acepta durante una prueba en seco y puede coincidir con la fecha del turno o con la fecha planificada de envío.

Una futura plantilla agrupada puede reducir a un solo mensaje los casos con varios turnos, pero debe aprobarse en Meta y requeriría representar todos los turnos dentro de un mismo seguimiento. La configuración actual prioriza confirmación y diagnóstico individual.

Después de aplicar las migraciones, las comprobaciones no destructivas son:

```bash
npm run check:whatsapp-inbox
npm run check:whatsapp-delivery
npm run check:whatsapp-retry
```
