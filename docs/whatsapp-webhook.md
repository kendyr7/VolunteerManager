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

Si la comprobación indica que no existe ninguna aplicación suscrita, la suscripción
puede crearse explícitamente y verificarse con:

```bash
npm run subscribe:whatsapp
```

## Diagnóstico

Al recibir una respuesta, los logs del servidor deben contener una línea que comienza con `[WHATSAPP WEBHOOK]` o `Received Meta WhatsApp Webhook message`.

- Si no aparece, revisar URL pública, campo `messages` y suscripción WABA.
- Si aparece pero la respuesta automática falla, revisar el error de Meta o Supabase que sigue a esa línea.
- Los eventos de estado sin mensajes se reconocen y responden `200` con estado `ignored`.
