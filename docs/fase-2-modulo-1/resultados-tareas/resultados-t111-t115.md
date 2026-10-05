# Resultados M1-T111–T115

## Cambios por archivo

| Archivo | Qué hace |
| --- | --- |
| `src/comun/politica-eliminacion.ts` | Centraliza relaciones y eventos impeditivos; detecta asignaciones y selecciones retiradas en auditoría y convierte carreras de claves foráneas en conflicto. |
| `src/sucursales/sucursales.service.ts` | Elimina una sucursal propia solo si es elegible y audita la baja en la misma transacción. |
| `src/sucursales/sucursales.controller.ts` | Expone `DELETE /sucursales/:id` con sesión y rol administrador; devuelve 204. |
| `src/servicios/servicios.service.ts` | Elimina un servicio propio sin selecciones ni historial, con auditoría transaccional. |
| `src/servicios/servicios.controller.ts` | Expone `DELETE /servicios/:id` con autorización y respuesta 204. |
| `src/profesionales/profesionales.service.ts` | Retira perfil, cuenta y reserva técnica de correo juntos; conserva el evento de alta desvinculando solo su FK a la cuenta y registra la baja sin secretos. |
| `src/profesionales/profesionales.controller.ts` | Expone `DELETE /profesionales/:id` solo para el administrador del negocio. |
| `test/bajas-t111-t115.integration-spec.ts` | Comprueba bajas elegibles, auditoría, relaciones, desactivación, uso histórico retirado y carrera entre dos conexiones. |
| `test/bajas-t111-t115.e2e-spec.ts` | Recorre las tres rutas HTTP con permisos, pertenencia, conflictos y respuestas 204/404. |
| `docs/fase-2-modulo-1/politica-eliminacion.md` | Enumera el historial aprobado, relaciones impeditivas, tratamiento de la cuenta y concurrencia. |
| `docs/fase-2-modulo-1/tareas-modulo-1.md` | Marca T111–T115 como hechas y enlaza la evidencia. |

Los bloques nuevos de política, servicios, rutas y pruebas contienen comentarios sobre bloqueos, auditoría conservada y alcance de la baja.

## Pruebas y verificaciones

- **Tests primero:** la integración inicial falló 3/3 porque faltaban los métodos `eliminar`. Otra prueba falló al revelar que una asignación retirada permitía borrar la sucursal; se corrigió consultando las instantáneas de auditoría. La integración específica terminó **4/4**.
- **E2E específica:** **1/1**. Comprueba 404 para administrador ajeno, 403 para Profesional, 409 con alternativa de desactivación si hay relaciones, 204 al borrar y 404 al repetir.
- **Compilación:** `npm run build` correcta.
- **Lint:** `npm run lint` sin errores; cuatro avisos previos de imports sin uso en `src/auth/dto/acceso-codigo.dto.ts`.
- **Suite unitaria completa:** `npm test -- --runInBand` → **54/54 suites y 295/295 pruebas aprobadas**.
- **Suite de integración completa:** `npm run test:integration -- --runInBand` → **31/37 suites y 185/191 pruebas aprobadas**. Fallan seis pruebas anteriores de concurrencia T58, invitaciones T037–T039, reversión de migraciones de identidad/códigos y validaciones de envíos/migraciones. La suite nueva pasó 4/4.
- **Suite E2E completa:** `npm run test:e2e -- --runInBand` → **15/19 suites y 106/124 pruebas aprobadas**. Persisten 18 fallos anteriores en `recepcionistas-t48`, `auth-t46`, `recorridos-t51-t58-t60` y `http-identidad-t041-t044`; la suite nueva pasó 1/1.

Las suites completas usaron una base fija exclusiva de pruebas y bases temporales migradas por caso. Los fallos enumerados ya aparecían antes de T111–T115.
