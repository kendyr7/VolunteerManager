# Actualización del diario: texto, casillas y guardado

La actualización cambia componentes del navegador y estilos. No agrega ni ejecuta
migraciones, no modifica el esquema, no limpia tablas y no transforma notas al
cargar la página. Conserva los identificadores y el formato de almacenamiento
actual (`content_version: 1`). Abrir y cerrar una nota sin editarla no escribe su
contenido.

## Correcciones

- Los párrafos mantienen su disposición vertical, incluso dentro de antiguas
  filas de tareas que contenían `display:flex`.
- Las casillas se pueden marcar y desmarcar en las tarjetas y en el editor;
  su estado se serializa al guardar.
- La carga inicial ya no se repite por cada cambio de estado de React.
- El guardado envía únicamente las notas modificadas en esta sesión. Las
  eliminaciones se calculan sobre las notas conocidas que el usuario quitó,
  nunca sobre todas las notas remotas que no aparecen en la copia local.
- Reintentar un guardado fallido conserva y reenvía los cambios locales.
  El guardado al salir devuelve un fallo real si la escritura no se confirmó.
- Los avisos de éxito de guardar y eliminar esperan la respuesta del servidor.

## Verificación reproducible

```powershell
# Si Playwright no está instalado en el proyecto, indicar un paquete disponible:
$env:PLAYWRIGHT_PACKAGE = 'ruta/al/paquete/playwright'
npm run test:journal
npm run build
```

Las pruebas montan los componentes reales del diario y su CSS en Chromium/Edge,
en tamaños de escritorio y móvil. Reemplazan exclusivamente el cliente de datos
con registros ficticios y bloquean las solicitudes externas. Comprueban casillas
con ratón y teclado, edición, autoguardado, recuperación tras fallo, conservación
de otras notas y metadatos, recarga, eliminación confirmada y creación de listas.
El fixture no reproduce el layout completo de la aplicación ni prueba Safari/iOS.

## Publicación

Publicar mediante el despliegue habitual de la aplicación; esta corrección no
requiere ejecutar SQL ni importar o reemplazar datos. Las pruebas locales no
escriben en producción. Preparar estos cambios no publica la actualización.

La edición simultánea de **la misma nota** desde dos dispositivos conserva la
política existente de última escritura. Esta corrección evita que guardar una
nota borre o sobrescriba otras notas que no se editaron localmente; no implementa
resolución de conflictos entre dos ediciones del mismo contenido. Los borradores
pendientes permanecen en memoria: si se ignora el aviso de salida y se cierra el
navegador sin conexión, no existe una copia local persistente.
