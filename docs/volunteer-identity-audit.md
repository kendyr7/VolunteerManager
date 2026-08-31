# Nombres y unidades de voluntarios

Auditoría del 31 de agosto de 2026 sobre los 1,059 registros de la base configurada.

## Causa y corrección del código

El alta desde `/volunteers` y la importación dividían el nombre completo después
de la primera palabra. Por ejemplo, `Juan Carlos Pérez López` terminaba como
`Juan` / `Carlos Pérez López`.

- El alta ahora pide **Nombres** y **Apellidos** separados.
- La plantilla de importación incluye ambas columnas y respeta su separación.
- Los archivos antiguos con una columna de nombre completo siguen aceptándose,
  pero cada fila exige revisar y confirmar la separación antes de importarla.
  Los nombres con partículas como `de`, `del` o `la` requieren indicar el límite
  de forma explícita. Nunca se acepta una sugerencia automáticamente.
- Al editar perfiles desde voluntarios, turnos o reportes se conservan los
  campos disponibles, sin volver a dividir el nombre completo por palabras.
- El servidor normaliza espacios y variantes conocidas de unidades. Las etiquetas
  de alta y edición distinguen **Estaca / Distrito** y **Barrio / Rama**.
- Se detectan prefijos del nivel incorrecto en alta, edición e importación;
  no se intercambian campos automáticamente.

Los nombres de unidades conocidos proceden de variantes presentes en los datos,
no de un directorio oficial. Las unidades desconocidas se conservan. No se
equiparan `ñ` y `n`, se eliminan artículos ni se fusionan unidades por parecido.
Se mantiene la convención existente de importar el nombre sin prefijo de tipo.

## Correcciones aplicadas a los datos

Se normalizaron **340 registros**, con estos cambios de campos (pueden coincidir
varios en un registro):

| Campo | Cambios |
| --- | ---: |
| Nombres: espacios / Unicode | 4 |
| Apellidos | 0 |
| Estaca / Distrito | 218 |
| Barrio / Rama | 258 |

Las variantes textuales de estaca/distrito pasaron de **71 a 32**; las de
barrio/rama, de **206 a 117**. Estos valores incluyen cadenas vacías o nulas y
no representan un conteo de unidades oficiales.

La verificación posterior confirmó **1,059 registros**, **340 entradas de
auditoría**, **cero discrepancias** con el plan y ningún cambio de estado.
Solo se escribieron `first_name`, `last_name`, `stake` y `neighborhood`.
No se modificaron teléfonos, PIN, comités, turnos ni asistencias.

## Pendientes que requieren confirmación

- **705 registros** con un nombre y al menos tres palabras en apellidos:
  compatibles con el defecto, pero no todos necesariamente incorrectos.
- **162 nombres de tres palabras**: pueden ser un nombre y dos apellidos, o
  dos nombres y un apellido.
- **870 registros** en la revisión nominal en total, incluyendo casos con
  anotaciones o campos incompletos. Las categorías pueden coincidir.
- **59 registros** con posibles erratas, asignaciones incompletas o unidades
  intercambiadas. Por ejemplo, `Rama Pancasan` como estaca y `Distrito Granada`
  como barrio. No se reasignaron por inferencia.
- **14 nombres de barrio/rama** con más de una estaca/distrito observada.
  Esto no demuestra un error: pueden existir unidades homónimas.

Los Excel locales tienen nombres completos, sin una separación autoritativa.
El SQL histórico contiene 39 nombres separados, pero ninguno aporta una
separación distinta para corregir una coincidencia exacta del nombre completo
actual. No se dedujeron apellidos a partir del número de palabras.

## Evidencia privada y reproducción

La evidencia de esta ejecución está en el directorio local, excluido de Git:
`outputs/volunteer-data-audit/2026-08-31T13-12-52-584Z/`.

- `before.json`, `plan.json`, `rollback.json`: respaldo, plan y valores para revertir.
- `after.json`, `execution.json`: estado posterior, resultados y comprobación de auditoría.
- `informe.html`: informe privado con búsqueda, revisión nominal y descarga de
  propuestas marcadas. No escribe en la base y debe descargarse la revisión
  antes de cerrar la página.
- `name-reviews.json`, `unit-reviews.json`, `hierarchy.json`: casos y relaciones observadas.

Para una nueva auditoría de solo lectura:

```powershell
node --env-file=.env.local scripts/audit-volunteer-identity.mjs
node --no-warnings --experimental-strip-types scripts/prepare-volunteer-identity-audit.mts
```

El ejecutor de mantenimiento requiere `--plan=...`; sin `--apply` solo verifica.
Antes de escribir valida el plan, guarda los valores originales y compara cada
registro con su respaldo para no sobrescribir ediciones concurrentes. Se detiene
si un registro cambia. No reutiliza un plan que ya haya ejecutado escrituras.
Las correcciones semánticas de nombres o asignaciones no están permitidas por
este ejecutor: requieren una revisión específica.

Pruebas de regresión:

```powershell
node --no-warnings --experimental-strip-types scripts/test-volunteer-identity.mts
```

La verificación de interfaz autenticada quedó limitada por la pantalla de inicio
de sesión del entorno local. No se crearon registros de prueba en producción.

La compilación de producción (`npm run build`), TypeScript y las pruebas de
regresión finalizaron correctamente. ESLint pasó para los componentes nuevos,
el formulario de alta, la normalización y los scripts de auditoría. Se verificó
que todos los nombres completos conservaron sus palabras y que no quedan
diferencias cubiertas por las reglas de normalización aplicadas.

Los cambios de código están en el proyecto local; no se realizó despliegue.

## Revisión nominal completada por el usuario

El archivo `nombres-revisados.json`, descargado el 31 de agosto de 2026 a las
21:38 UTC, contenía 866 registros aprobados. La validación confirmó que todos
pertenecían a esta auditoría, sin IDs duplicados, nombres vacíos ni diferencias
entre sus valores originales y el respaldo.

- 818 registros recibieron una separación distinta de nombres y apellidos.
- 44 ya coincidían con la revisión y no necesitaron escritura.
- 4 casos del informe no estaban incluidos como aprobados en la descarga.
- 4 registros habían cambiado después del respaldo y se excluyeron para no
  sobrescribir una edición posterior.

La comprobación final encontró cero discrepancias, 818 entradas de auditoría y
todos los estados anteriores intactos. Durante la ejecución se agregó un nuevo
voluntario por otro flujo: el total pasó de 1,063 a 1,064, sin que este proceso
modificara ese registro. El archivo recibido y su SHA-256 quedaron guardados en
la evidencia local. Los ocho casos excluidos tienen una revisión de seguimiento
separada.
