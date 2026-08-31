# Notificaciones Web Push

Implementación con `web-push`, Supabase y el service worker existente. No requiere un proyecto Firebase, OneSignal ni una cuenta de Apple Developer. Sí consume los recursos/cuotas del hosting y la base de datos; no equivale a infraestructura ilimitada gratuita.

## Alcance inicial

- Coordinadores y administradores; no voluntarios ni perfiles Lector, archivados o inactivos.
- Nuevas solicitudes de cambio pendientes, incluidas las recibidas por WhatsApp. Se respeta el mismo alcance de comité/permisos de la lista de solicitudes.
- Cobertura crítica: turno operativo que comienza dentro de las próximas 48 horas, con menos asignaciones que el mínimo configurado en `committee_shift_requirements`. Se respeta el alcance del dashboard. No se evalúa asistencia en vivo ni mínimos por área.
- Un aviso de cobertura por turno, comité, dispositivo y fecha local (America/Guatemala). Las solicitudes tienen una ventana de entrega de 24 horas; los avisos de cobertura vencen al comenzar el turno o terminar el día local.
- Preferencias, activación voluntaria, prueba y desactivación en **Configuración → Notificaciones operativas**. La sugerencia inicial puede ocultarse.
- Los mensajes no incluyen nombres de voluntarios, teléfonos, PIN ni motivos personales. El destino sigue exigiendo una sesión autorizada.

## Activación en producción

El código no activa servicios externos por sí solo. Aplicar primero la migración y configurar las claves antes de habilitarlo para usuarios.

1. Aplicar `supabase/migrations/20261025000000_web_push.sql` y después `supabase/migrations/20261026000000_notification_inbox.sql`, mediante el proceso habitual del proyecto. **Si ya ejecutaste la primera, ejecuta únicamente la segunda.** No hacer un reset de la base de datos ni repetir la primera migración. La segunda agrega la bandeja interna y amplía los eventos para que existan aunque nadie haya aceptado push; no borra voluntarios, turnos ni suscripciones.
2. En una terminal privada de tu equipo, generar una única pareja VAPID con `npx web-push generate-vapid-keys`. Guardarla en un gestor de secretos. No compartir la clave privada en capturas, chats ni Git.
3. Configurar en Vercel (y en `.env.local` si se prueba localmente):

| Variable | Valor |
| --- | --- |
| `PUSH_ENABLED` | `true` |
| `VAPID_PUBLIC_KEY` | Clave pública generada |
| `VAPID_PRIVATE_KEY` | Clave privada de la misma pareja |
| `VAPID_SUBJECT` | URL HTTPS real de la organización o `mailto:` de contacto; no localhost |
| `PUSH_DISPATCH_SECRET` | Secreto aleatorio exclusivo, al menos 32 bytes |
| `CRON_SECRET` | Secreto del cron de Vercel, compartido con el cron existente de WhatsApp |

   El servidor utiliza además `NEXT_PUBLIC_SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`, ya existentes. Ninguna clave privada lleva el prefijo `NEXT_PUBLIC_`. La pública se entrega desde el endpoint autenticado. El código verifica que las dos claves VAPID correspondan; una configuración incompleta no pide permiso al navegador.

4. Desplegar la app. Verificar que `/sw.js` responde con JavaScript y sin caché persistente. El service worker no almacena páginas ni información privada offline.
5. Configurar el procesador periódico descrito abajo. Sin él, los flujos habituales intentan enviar inmediatamente, pero los reintentos, los lotes pendientes y los cambios directos en BD podrían esperar hasta el respaldo diario.
6. Iniciar sesión como coordinador/admin, abrir Configuración → Notificaciones operativas, activar y enviar una prueba desde cada navegador/dispositivo.

## Procesamiento periódico

Las solicitudes y los cambios de turno registran un evento en la misma transacción de BD. Las acciones de la app y el webhook de WhatsApp despiertan el procesador después de responder (`after`). No se confía en destinatarios ni mensajes enviados desde el cliente.

El procesador también genera el centro de notificaciones interno, usando un cursor separado de la cola push. Abrir la campana nunca consume ni envía las entregas push. Los dos procesadores comparten el bloqueo y trabajan de forma secuencial.

Para continuar lotes/reintentos aunque nadie tenga la app abierta, habilitar **Supabase Cron (`pg_cron`), `pg_net` y Vault** en el proyecto. Guardar mediante el Dashboard estos dos secretos de Vault:

- `push_app_url`: origen HTTPS de la app desplegada, sin ruta, por ejemplo `https://volunteermanager.org`.
- `push_dispatch_secret`: exactamente el mismo valor que `PUSH_DISPATCH_SECRET` en Vercel.

Después ejecutar una vez `supabase/setup-web-push-cron.sql`. Es un script de configuración manual, no una migración automática. Crea o actualiza solamente el trabajo `volunteer-manager-web-push`, que invoca cada minuto `POST /api/push/dispatch?scan=1`. El secreto se obtiene de Vault al ejecutar el trabajo y no se escribe en el texto del cron. El dominio debe ser accesible desde Supabase sin la pantalla de protección de despliegues de Vercel.

Cada ejecución procesa hasta 20 eventos y 30 entregas, con envíos en grupos de cinco y un bloqueo compartido que impide trabajadores simultáneos. El barrido genera eventos de cobertura por hora; una baja de turno puede generarlos antes. Se vuelven a comprobar cobertura y autorización al entregar. No se avisa retrospectivamente de eventos anteriores a la activación del dispositivo.

`vercel.json` incluye además un respaldo diario a las 06:15 UTC, independiente de WhatsApp, autorizado con `CRON_SECRET`. El cron diario no sustituye al procesador por minuto. Los planes Hobby de Vercel limitan la frecuencia del cron; revisar también sus condiciones de uso y las cuotas del proyecto. Una llamada por minuto son aproximadamente 43.200 invocaciones en 30 días, más las llamadas de la aplicación.

Opcionalmente, un Database Webhook de Supabase sobre **INSERT en `public.push_events`** puede llamar `POST /api/push/dispatch` con `Authorization: Bearer` y el secreto de despacho para despertar el envío tras escrituras directas. No es necesario para los flujos normales de la app ni sustituye los reintentos periódicos. No enviar la clave service-role como token de este endpoint.

## Comportamiento y límites

### Centro de notificaciones dentro de la app

- Campana integrada en la navegación de coordinadores/admins, sin una barra superior adicional: debajo del buscador lateral en PC (icono con contador al contraer), y junto al menú inferior en móvil. En el modo de accesos rápidos acompaña al buscador y se oculta mientras la rueda está abierta. Todas las entradas comparten una bandeja y un solo ciclo de actualización.
- El panel usa los mismos iconos del menú lateral para solicitudes, cobertura (Dashboard) y ajustes. Los filtros No leídas/Leídas ocupan cada uno la mitad del ancho y consultan el estado de lectura en el servidor, también al paginar; abre en No leídas. Conserva contador y marcar una o todas como leídas. El enlace abre la solicitud exacta aunque ya esté resuelta; el destino comprueba el acceso habitual.
- La lista se agrupa por Hoy, Ayer y fechas anteriores con el calendario de la app (America/Guatemala). El subtítulo «Tienes X notificaciones hoy» cuenta en el servidor todos los avisos del día que el usuario puede ver, leídos o no, no solo la página cargada. Comparte la fecha del evento usada por los grupos, no cambia al marcar leído y se actualiza con la bandeja.
- El check pendiente es un botón de contorno sin relleno; el check de un aviso leído es un indicador verde relleno, no un botón. El menú de tres puntos del título contiene «Marcar todas como leídas» y «Actualizar notificaciones».
- Historial por cuenta, no por dispositivo: leer en un navegador se refleja al actualizar en otro. `notification_inbox` guarda 30 días, tiene RLS y acceso exclusivo del servidor. Listado, contador y lectura verifican usuario y permisos/comité actuales.
- No depende de claves VAPID, de aceptar permisos del navegador ni de mantener una suscripción push. Desactivar los avisos del dispositivo no borra esta bandeja.
- Con la app visible, se actualiza aproximadamente cada minuto, al abrir el panel y al volver a la ventana. El endpoint autenticado de sincronización solo genera registros internos. El cron permite detectar cobertura aunque nadie abra la app.
- El historial comienza con la instalación; se recuperan solicitudes aún pendientes de las últimas 24 horas, no un historial antiguo completo. Si un evento deja de requerir aviso antes de procesarse, no crea un ítem; los ítems ya generados permanecen aunque se resuelva la solicitud.
- Marcar leído no aprueba/rechaza solicitudes ni cancela entregas push. “Marcar todas” respeta el momento de consulta para no consumir avisos nuevos que no se habían mostrado.
- Si falta la migración nueva, el panel muestra un error de configuración. No confundirlo con una bandeja vacía.
- `/dev/notifications` es una vista de pruebas sintéticas, solo en desarrollo. Permite verificar interacción y temas sin datos reales ni push; en producción responde 404.

### Entrega al dispositivo

- En iPhone/iPad se necesita iOS/iPadOS 16.4 o superior, instalar en pantalla de inicio y abrir desde ese icono antes de dar permiso. El panel explica los pasos. En otros sistemas depende del soporte del navegador y de los permisos del SO.
- El permiso se solicita solo al pulsar Activar. No es necesario reinstalar la PWA para recibir una actualización del service worker.
- Se elimina la suscripción del dispositivo al cerrar sesión y antes de iniciar sesión con otra cuenta, incluido acceso con passkey. Si la revocación falla, no se permite cambiar de cuenta silenciosamente. Las suscripciones caducan con la duración de sesión (30 días); la actividad autenticada renueva esa fecha.
- La desactivación elimina también las entregas pendientes. Los avisos ya aceptados por el proveedor o mostrados por el SO no pueden retirarse de forma garantizada.
- Al salir también se intenta cancelar la suscripción en el navegador. Una falla simultánea del navegador y la BD no impide cerrar la sesión, pero la revocación push puede demorarse hasta que el servicio vuelva o la suscripción caduque. La cookie de dispositivo se conserva ante una falla de BD para reintentar la revocación antes de otro acceso.
- HTTP 404/410 elimina la suscripción; 429, 5xx y fallos de red tienen hasta cinco intentos con espera creciente. Otros errores son terminales. No hay entrega exactamente una vez: ante una interrupción justo después del envío puede repetirse. Se usan etiquetas estables para reemplazar avisos duplicados donde el navegador lo permite.
- El proveedor conserva un aviso como máximo una hora, acortada si el evento vence antes. No se garantiza entrega inmediata ni entrega con el dispositivo desconectado, navegador forzado a cerrar, ahorro de energía o No molestar.
- No es un canal único para emergencias: la app mantiene solicitudes y dashboard como fuente de verdad. Los mínimos, comités y fechas operativas deben estar configurados correctamente.
- Las cuatro tablas tienen RLS y no conceden acceso a `anon`/`authenticated`. Todas las operaciones pasan por el servidor y la sesión propia del proyecto, no por Supabase Auth. Las suscripciones se validan contra proveedores conocidos para evitar peticiones arbitrarias desde el servidor.

## Verificación y operación

Ejecutar `npm run test:push` y `npm run build`. La suite usa identidades ficticias y PostgreSQL en memoria: no carga `.env`, no modifica Supabase y no envía notificaciones reales.

### Icono pequeño y color de la barra del teléfono

- El service worker usa `/notification-badge-96.png` como `badge`: logo blanco de 96×96 con fondo transparente para evitar el bloque blanco en Android. El icono grande y los iconos de instalación mantienen su diseño a color.
- Para regenerar solo ese recurso desde el logo vectorial original: `node scripts/generate-pwa-icons.mjs --badge-only`. No sobrescribe los iconos de instalación.
- `BrowserThemeColor` toma el fondo `--dark` del tema CSS activo y sincroniza `theme-color`, incluso después de navegar: `#f8fafb` en claro y `#050505` en oscuro. El manifiesto usa el fondo oscuro inicial; el navegador/SO decide cómo aplica estos colores a sus barras.
- Los toasts existentes también activan una señal temporal en `theme-color`: éxito verde (`#047857`) 2 segundos, error rojo (`#be123c`) 3 segundos e información azul (`#315ee0`) 2 segundos. No se cambia el diseño, duración, pausa, cierre ni acciones del toast. Al vencer la señal o cerrar/desmontar el aviso, vuelve al fondo del tema actual. El aviso más reciente prevalece; se limpia la señal al ocultar la app y no se reproducen señales antiguas al regresar.
- `/dev/notifications` incluye ejemplos de los tres tipos con el componente real, sin guardar datos ni realizar acciones operativas. El toast permanece como confirmación principal, incluso cuando el navegador no aplica el color de la barra.
- Después del despliegue, abrir o recargar la app y probar con una notificación nueva. Los avisos ya mostrados no cambian de icono retroactivamente y la actualización del manifiesto instalado puede tardar.
- Verificar también `node scripts/test-browser-theme-color.mjs`: temas, cambios de metadatos al navegar, desconexión de observadores y colores iniciales del manifiesto. Confirmar visualmente la barra de estado en un Android real; la vista móvil de escritorio no reproduce esa barra del SO.

Prueba manual, con cuentas y solicitudes de prueba autorizadas:

1. Activar dos dispositivos de un coordinador del comité A y uno del B. Enviar prueba en cada uno, también con la app en segundo plano.
2. Crear una solicitud del comité A: reciben quienes pueden verla; B no debe recibirla si carece de alcance global. Verificar también el ingreso por WhatsApp.
3. Resolver una solicitud antes del despacho: no debe notificarse. Revocar permiso/rol antes de un reintento: tampoco.
4. En un turno de las próximas 48 horas con mínimo configurado, bajar la cobertura: verificar aviso y ausencia de repetición al editar de nuevo el mismo día. Restablecer el mínimo antes del despacho: no debe enviarse.
5. Desactivar, cerrar sesión y cambiar de cuenta: no deben salir nuevos avisos de la cuenta anterior a ese dispositivo.
6. Repetir en iPhone instalado, Android y un navegador de escritorio. Comprobar permiso denegado y bloqueo del SO.

Revisar estados con agregados (sin exponer endpoints ni claves):

```sql
select status, error_code, count(*) from public.push_deliveries group by status, error_code;
select count(*) as pendientes from public.push_events where processed_at is null;
select jobid, jobname, schedule, active from cron.job where jobname = 'volunteer-manager-web-push';
```

Los eventos/entregas se conservan siete días. Si crece la cola, revisar los fallos del cron y del endpoint, límites del proveedor y configuración antes de aumentar frecuencia o lotes. No publicar logs de `net.http_request_queue`, endpoints, tokens ni secretos de Vault.

Para pausar todos los envíos, establecer `PUSH_ENABLED=false` y volver a desplegar. Para pausar el cron sin borrar datos:

```sql
select cron.alter_job(jobid, active := false)
from cron.job where jobname = 'volunteer-manager-web-push';
```

Conservar la pareja VAPID entre despliegues. Una rotación requiere reactivar las suscripciones desde los dispositivos; no arregla automáticamente las existentes.

Referencias oficiales: [Supabase: programación con Cron, pg_net y Vault](https://supabase.com/docs/guides/functions/schedule-functions), [Web Push en iOS/iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/), [web-push](https://github.com/web-push-libs/web-push), [límites de cron en Vercel](https://vercel.com/docs/cron-jobs/usage-and-pricing).
