# Resultados M1-T106–T110

## Cambios por archivo

| Archivo | Qué hace |
| --- | --- |
| `src/bloqueos/calculo-bloqueos.ts` | Convierte un bloqueo civil en un intervalo UTC según la zona de cada sucursal y resta la unión de bloqueos sin fusionar ni borrar registros. |
| `src/bloqueos/calculo-bloqueos.spec.ts` | Comprueba zonas distintas, rango continuo multiday, último día completo, DST inválido y superposición. |
| `src/horarios/calendario.ts` | Expone la resolución estricta de un extremo local para rechazar horas inexistentes o repetidas. |
| `src/bloqueos/bloqueos.service.ts` | Valida los extremos horarios en cada sede afectada, resuelve filtros autorizados de consulta y evita que propiedades `undefined` de PATCH sustituyan datos guardados. Rechaza ediciones vacías. Las asignaciones se consultan al usar el bloqueo. |
| `src/bloqueos/validar-bloqueo.ts` | Actualiza el comentario que explica por qué conserva fechas civiles antes de aplicarlas por sede. |
| `src/bloqueos/dto/bloqueos.dto.ts` | Define validación de cuerpo, edición parcial, ID de ruta y filtros de consulta. |
| `src/bloqueos/bloqueos.controller.ts` y `src/bloqueos/bloqueos-http.module.ts` | Exponen GET, POST, PATCH y DELETE `/bloqueos` con sesión, rol y autorización del servicio. |
| `src/app.module.ts` | Registra el módulo HTTP de bloqueos. |
| `src/horarios/atencion.service.ts` | Proyecta intervalos por fecha y sede desde semana o excepción, quita descansos y bloques, omite borradores y sedes inactivas, e informa omisiones por DST. No genera citas ni ranuras. |
| `src/horarios/horarios.module.ts`, `src/horarios/horarios-acceso.service.ts`, `src/horarios/horarios.controller.ts` y `src/horarios/dto/horarios.dto.ts` | Registran la proyección y exponen `GET /profesionales/:id/atencion?desde=&hasta=` con autorización de perfil y fechas validadas. |
| `test/bloqueos-t106-t110.e2e-spec.ts` | Recorre permisos, aislamiento, filtros, rango multiday en dos zonas, asignación posterior, superposición, prioridad sobre excepción, borrado individual y omisiones DST. |
| `docs/fase-2-modulo-1/tareas-modulo-1.md` | Marca T106–T110 como hechas y enlaza esta evidencia. |

Los bloques principales del cálculo, los DTO y las rutas contienen comentarios que explican el alcance, los límites civiles y la conservación de datos.

## Pruebas y verificaciones

- **Tests primero:** la prueba de cálculo falló al faltar el módulo nuevo; la prueba HTTP falló inicialmente con ruta inexistente. Después, las pruebas detectaron que PATCH propagaba campos `undefined` y aceptaba una edición vacía, y que GET ignoraba una sucursal inválida; los tres defectos se corrigieron.
- **Cálculo y composición:** 5/5 pruebas aprobadas en 2 suites.
- **E2E específicas T106–T110:** 3/3 aprobadas.
- **Suite unitaria completa:** `npm test -- --runInBand` → **54/54 suites, 295/295 pruebas aprobadas**.
- **Compilación:** `npm run build` → correcta.
- **Lint:** `npm run lint` → salida 0, con cuatro avisos previos de imports sin uso en `src/auth/dto/acceso-codigo.dto.ts`.
- **Integración completa:** `npm run test:integration -- --runInBand` → **30/36 suites y 181/187 pruebas aprobadas**. Persisten seis fallos previos en concurrencia T58, invitaciones T037–T039, reversión histórica de códigos/identidad, envíos de correo y migraciones antiguas; no corresponden a T106–T110.
- **E2E completa:** `npm run test:e2e -- --runInBand` → **14/18 suites y 105/123 pruebas aprobadas**. Los 18 fallos siguen concentrados en cuatro suites previas de autenticación, invitaciones/recepcionistas y licencias; la suite nueva de bloqueos y atención pasó 3/3. La corrección posterior del PATCH vacío se volvió a verificar en esa suite específica.
