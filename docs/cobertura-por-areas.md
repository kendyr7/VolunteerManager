# Cobertura por áreas: contrato de experiencia

## Propósito

Permitir que administradores y coordinadores distribuyan los voluntarios de un
comité entre áreas operativas, midan la cobertura por día y turno, y comuniquen
al voluntario exactamente dónde debe servir.

## Regla principal

El comité pertenece al voluntario. El área pertenece a la asignación del turno.
Por eso una persona puede servir en áreas distintas en días o turnos distintos,
pero nunca en dos áreas dentro de la misma asignación.

Una asignación existente sin área se presenta como **Sin área**. No se migran ni
se inventan asignaciones automáticamente.

## Superficies

### Coordinación: Cobertura por áreas

La función vivirá dentro del contexto de Turnos y usará tres vistas conectadas:

1. **Cobertura**: matriz de áreas por turno para el día seleccionado, con el dato
   `asignados / requeridos`, total del comité y cantidad sin área.
2. **Asignaciones**: lista de las personas programadas en el día y turno, agrupada
   por área, con selección individual o múltiple.
3. **Áreas**: creación, edición, orden, requerimientos, archivado y restauración.

El administrador tendrá un selector de comité. El coordinador de comité entrará
directamente al suyo y no verá un selector que sugiera acceso global.

### Voluntario: Mi horario

Cada bloque de turno mostrará el área inmediatamente debajo de la hora:

```text
Turno 2 · 10:00–14:00
Área: Parqueo Norte
```

Si todavía no existe una asignación, mostrará `Área pendiente` con un estado
neutral. Un área archivada conservará su nombre en turnos históricos.

## Lenguaje visual

- Reutilizar tipografía, densidad, radios de 8 px, iconos Material Symbols y
  controles existentes.
- Azul `#4D7CFE`: selección y acciones principales.
- Verde: cobertura alcanzada.
- Ámbar: falta menos de la mitad del objetivo.
- Rosa/rojo: déficit crítico.
- Gris: sin requerimiento o sin área.
- El color siempre acompaña texto y cifras; nunca será el único indicador.
- Transiciones de estado de 150–250 ms y respeto a `prefers-reduced-motion`.

## Estados obligatorios

- Cargando: estructura esqueleto de la matriz o lista.
- Sin áreas: explicación y acción `Crear primera área`.
- Sin voluntarios en el turno: mensaje contextual, no tabla vacía.
- Sin área: grupo visible y accionable.
- Área archivada: fuera de selectores nuevos, presente en historial.
- Conflicto de edición: conservar la selección y explicar qué cambió.
- Error de permisos: no mostrar datos parciales de otro comité.

## Reglas de interacción

- Asignar por selector será la interacción base accesible. Arrastrar y soltar
  puede añadirse después como acelerador, nunca como única opción.
- Sobrecobertura genera información, no un bloqueo.
- Archivar solicita confirmación y muestra cuántas asignaciones conservan el área.
- Las mutaciones se confirman con feedback inmediato y se registran en auditoría.

## Entrega por etapas

1. Modelo, permisos, invariantes y auditoría.
2. Gestión de áreas y requerimientos.
3. Asignación individual y múltiple.
4. Matriz y totales de cobertura.
5. Área visible en el horario del voluntario y comunicaciones.
