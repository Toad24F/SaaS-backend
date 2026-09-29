# Resultado M1-T051–M1-T058

Fecha: 2026-09-28. **T051–T058 implementadas.** La renovación respeta la gracia pendiente y actualiza el saldo si la licencia ya está congelada. La consulta de vigencia muestra el estado calculado con la hora del servidor, incluida la frontera de suspensión, y las rutas protegidas aplican la misma política compartida que login y JWT.

## Cambios realizados

| Archivo | Qué hace |
| --- | --- |
| `src/licencias/licencias.service.ts` | Al renovar conserva solicitud y bloqueo previstos. Si la operación llega después del límite, materializa la congelación primero y recalcula el remanente desde el vencimiento anual retenido. Registrar el remanente en auditoría permite revisar la renovación. |
| `src/altas/activaciones.service.ts` | Incrementa la versión del vencimiento al activar la primera cuenta dentro de la transacción de activación existente. La política vigente sigue impidiendo consumir el código durante una suspensión inicial. |
| `src/licencias/services/vista-vigencia-licencia.service.ts` | Calcula estados pendiente, vigente, suspensión pendiente, suspendida y vencida; da hora del servidor, fecha aplicable, bloqueo previsto y remanente como días/horas/minutos. En congelación deja `venceEn` nulo y reporta el saldo fijo, aunque el materializador aún no haya escrito el estado. |
| `src/licencias/services/consulta-vigencia-licencias.service.ts` | Resuelve la vista propia por `negocioId` autenticado y rechaza acceso vencido/bloqueado. Permite lectura por licencia para superadmin, incluso cuando el negocio está bloqueado. |
| `src/licencias/licencias.controller.ts` | Añade `GET /licencias/mi-vigencia` para roles de negocio y `GET /licencias/:id/vigencia` para superadmin. Las operaciones de suspensión, reactivación y renovación responden 200 con la vista actualizada. |
| `src/licencias/licencias.module.ts` | Registra y exporta los servicios de vista y consulta para que el controlador los use. |
| `src/licencias/licencias.service.spec.ts` | Prueba renovación congelada, renovación durante la gracia y renovación posterior al vencimiento retenido, incluyendo el saldo y la versión. |
| `src/licencias/services/vista-vigencia-licencia.service.spec.ts` | Usa reloj fijo para verificar cómputo de días/horas/minutos, estado pendiente, gracia, congelación y vencimiento exacto. |
| `src/licencias/services/consulta-vigencia-licencias.service.spec.ts` | Comprueba la consulta por negocio propio, rechazo al límite exacto, consulta administrativa de una suspendida y licencia inexistente. |
| `test/licencias-vigencia-t051-t057.e2e-spec.ts` | Añade recorridos HTTP con guards, sesiones, reloj controlado y MariaDB para el instante anterior/exacto a las 48 horas y un vencimiento natural anterior. |
| `test/concurrencia-t52-t57.integration-spec.ts` | Adapta expectativas antiguas a la gracia y añade carreras de materialización/reactivación y renovación/reactivación con dos conexiones. |
| `test/licencias-t50.e2e-spec.ts` | Actualiza las expectativas de administración HTTP: suspensión pendiente mantiene acceso y reactivación anticipada no desplaza el vencimiento. |
| `test/recorridos-t51-t58-t60.e2e-spec.ts` | Ajusta el recorrido anual a la gracia, renovación congelada y remanente restaurado desde el límite real. |
| `test/seguridad-t72-t73-t75.e2e-spec.ts` | Actualiza el código HTTP esperado para las operaciones que ahora devuelven la vista de licencia. |
| `docs/fase-2-modulo-1/tareas-modulo-1.md` | Marca T051–T058 como hechas y enlaza esta evidencia. |

Se añadieron comentarios a los bloques de renovación/materialización, cálculo de vista, aislamiento de consulta y rutas HTTP para explicar cuándo consumen tiempo, cómo evitan eludir el bloqueo y qué fecha presentan.

## Pruebas y verificaciones

- **Primero, prueba roja:** la prueba de vista no pudo cargar el servicio nuevo antes de implementarlo. Después de añadirlo, las pruebas temporales y de consulta pasaron. Una ejecución inicial también detectó una dependencia de constructor en Nest; se eliminó esa inyección innecesaria y la prueba de composición volvió a pasar.
- **Pruebas enfocadas:** 4 suites, **21/21** aprobadas para renovación, vista, consulta y política de acceso.
- **Suite principal `npm test -- --runInBand`:** 47 suites, **226/226** aprobadas.
- **`npm run build`:** pasó.
- **`npm run lint`:** pasó sin diagnósticos.
- **`git diff --check`:** pasó.
- **HTTP/MariaDB:** se intentó ejecutar `licencias-vigencia-t051-t057.e2e-spec.ts` y `licencias-t50.e2e-spec.ts`. Las 17 pruebas no llegaron al código de ruta porque el host `40.233.1.45:3306` rechazó la conexión (`ECONNREFUSED`). Las nuevas carreras de integración tampoco pueden verificarse sin esa base.

Las pruebas de sesión confirman la política en unitarios y el nuevo recorrido HTTP está preparado para validar el límite exacto; la ejecución real de esas pruebas y de las carreras queda pendiente de que MariaDB vuelva a estar disponible. La suite principal sí terminó correctamente. Me detengo en T058.
