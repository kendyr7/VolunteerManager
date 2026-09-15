# Rendimiento de Turnos y Voluntarios

## Causas verificadas

- Los cálculos de asistencia construían formateadores de zona horaria miles de veces por actualización. Ahora reutilizan `Intl.DateTimeFormat`, manteniendo `America/Guatemala` y sus límites de fecha.
- Voluntarios montaba todas las filas y tarjetas, incluidas las que quedaban fuera de pantalla. Ahora usa la dependencia existente `react-virtuoso`; búsqueda, orden, selección y saltos por letras conservan el conjunto completo de datos.
- El reloj de asistencia reconstruía también los índices de programación. Esos índices ahora permanecen estables mientras no cambien voluntarios o turnos.
- Los sondeos reemplazaban datos idénticos y reconstruían el almacén, búsquedas y listas. Se conservan las referencias cuando no cambió el contenido.
- Cada aviso de sesión disparaba otra descarga completa. El aviso ya contiene el registro y se aplica inmediatamente; la reconciliación de respaldo se realiza cada 60 segundos, al volver a la pestaña y al reconectar. El reloj local sigue actualizándose cada 10 segundos.
- Invalidaciones simultáneas podían lanzar varias recargas después de la consulta inicial. Ahora comparten una sola recarga posterior, que conserva los cambios recibidos durante la primera consulta.
- Importar estilos desde la página de Usuarios incorporaba dependencias innecesarias. Los estilos se trasladaron a un módulo compartido sin cambiar sus valores.

## Evidencia

Consulta de solo lectura: 1.253 voluntarios, 6.905 turnos y 1.353 sesiones en la base de datos. Los tiempos SQL medios consultados estaban alrededor de 3–5 ms, con picos históricos mayores; esto no mide latencia de red ni tiempo total de navegación.

El benchmark usa registros sintéticos de esas mismas cantidades y una hora fija. Primera medición local:

| Cálculo | Antes | Después |
| --- | ---: | ---: |
| Datos compartidos | 685 ms | 147 ms |
| Confiabilidad | 542 ms | 157 ms |
| Estados de Turnos | 1.776 ms | 184 ms |
| Total | 3.003 ms | 488 ms |

Las huellas SHA-256 de los resultados fueron idénticas antes y después. Otras ejecuciones posteriores dieron aproximadamente 0,5–0,7 segundos en conjunto; los tiempos varían con la carga del equipo. No son mediciones de velocidad final en producción.

La prueba en Edge, con respuestas de datos interceptadas, montó 17 filas en escritorio y 13 en móvil de 1.253 registros. Verifica salto A–Z, filtro, recuperación de lista y expansión de Turnos. No realiza escrituras ni consultas reales a la base de datos.

## Comprobaciones reproducibles

```powershell
npm run test:performance
node scripts/verify-attendance-state.cjs
node scripts/verify-attendance-views.cjs
npm run test:reliability
npm run build
```

Para la prueba de navegador, ejecutar una compilación de producción local en el puerto 3005 (`npm start -- -p 3005`), disponer de Edge y Playwright y ejecutar `node scripts/test-coordinator-browser.cjs`. Si Playwright está en el runtime compartido, establecer `PLAYWRIGHT_PACKAGE` con la ruta de ese paquete. La prueba solo firma una identidad sintética para el proxy local; intercepta todas las acciones y API, bloquea WebSockets y no permite que las peticiones de datos lleguen a servicios externos. Las capturas quedan en `outputs/performance/`.
