# Identificador público del negocio en login y perfil

Fecha: 20 de octubre de 2026. Ajuste autorizado expresamente para habilitar Abrir portal/Copiar enlace desde Mi cuenta en frontend. No marca una tarea posterior ni cierra la fase 4.

## Problema y contrato final

El perfil conocía negocioId y negocioNombre, pero no el slug. GET /negocios y GET /negocios/:id están restringidos a superadmin, por lo que administración no podía obtener legítimamente el enlace del portal desde esas rutas.

Se añade un campo informativo a respuestas existentes, sin crear endpoints ni cambiar permisos:

| Respuesta | Campo | Origen |
| --- | --- | --- |
| POST /auth/login | `usuario.identificadorPublico: string | null` | Slug del negocio revalidado dentro de la transacción de login; null para superadmin. |
| GET /auth/profile | `user.identificadorPublico: string | null` | Slug actual del negocio unido al usuario recuperado de la base; null para superadmin. |

Ejemplo parcial de una cuenta de negocio: `{ "negocioId": 7, "identificadorPublico": "clinica-centro" }`. Es metadato público para construir `/reservas/clinica-centro`, no una credencial ni autoridad de acceso. No se añade al JWT, no se recibe del cuerpo del cliente y no se expone la entidad completa Negocio.

## Archivos modificados

| Archivo | Qué hace el bloque cambiado |
| --- | --- |
| `src/auth/auth.service.ts` | Obtiene el identificador desde el negocio ya releído al validar acceso en la transacción que serializa login frente a cambio/recuperación de contraseña. Lo devuelve junto al usuario seguro de login, separado de JwtPayload. Incluye comentario de la lectura vigente y el caso superadmin. |
| `src/auth/strategies/jwt.strategy.ts` | Reconstruye el identificador del negocio actual por cada petición validada. Ignora el valor de cualquier claim antiguo o adulterado; no cambia la validación de sesión, cuenta o licencia. |
| `src/auth/interfaces/usuario-autenticado.interface.ts` | Declara `identificadorPublico: string | null` en el contexto autenticado, documentando que no es un claim. |
| `src/auth/auth.service.spec.ts` | Actualiza la expectativa de superadmin y añade tres casos de login por rol de negocio. El manager doble distingue el repositorio Negocio del de Licencia para comprobar que el slug viene de la lectura transaccional, no de la relación anterior. |
| `src/auth/strategies/jwt.strategy.spec.ts` | Actualiza comparaciones del perfil y el null de superadmin; añade tres casos por rol que ignoran negocio/slug ajenos del token y reflejan cambios en la base. |
| `test/auth-t45.e2e-spec.ts` | Actualiza las respuestas completas que antes fallarían por el campo adicional. Añade dos casos HTTP reales: pertenencia y slug actualizado frente a claims ajenos, y login/perfil de superadmin con null. Mantiene todas las verificaciones previas. |
| Este documento | Registra flujo, pruebas, alcance y resultados del contrato. |

No se modifican entidades, esquema, migraciones ni JwtPayload. El resto de suites usa aserciones parciales compatibles o no depende de la forma de esta respuesta; se revisaron referencias a UsuarioAutenticado, negocioNombre y /auth/profile antes de implementar.

## Flujo y conservación de comportamiento

1. Login valida credenciales/activación/acceso como antes. Dentro de su transacción relee el usuario bajo el bloqueo existente, comprueba contraseña vigente y obtiene su negocio/licencia actuales.
2. El slug sale de esa lectura del negocio y se devuelve al frontend con la sesión creada. El JWT conserva sus claims previos; no se firma el slug como dato de autorización.
3. En restauración, JwtStrategy valida sesión y usuario, consulta su negocio actual y aplica la política de acceso de licencia. Después construye el contexto seguro con el identificador vigente.
4. Superadmin recibe null; las cuentas de negocio reciben el slug de su negocio propio. Un token válido que afirme otro negocio o un slug anterior no sustituye la pertenencia de la cuenta recuperada por sub.
5. El frontend valida el formato, carga `tenant.slug` y muestra el acceso en Mi cuenta solo a administración del negocio. El enlace público usa el origen del frontend y no incluye tokens privados. Las rutas /negocios mantienen su rol exclusivo.

## Tests primero

Se modificaron las expectativas dependientes y se añadieron los seis casos unitarios parametrizados antes de cambiar código del producto. Primer comando:

```text
npm test -- --runInBand --runTestsByPath src/auth/auth.service.spec.ts src/auth/strategies/jwt.strategy.spec.ts
2 suites fallidas; 9 pruebas fallidas y 18 aprobadas.
```

Los fallos mostraban el campo identificadorPublico ausente, tanto en negocio como en superadmin. Después de implementar, las tres suites de autenticación (incluida auth-flujos.spec.ts) aprobaron 30 pruebas. Se actualizaron también las expectativas exactas HTTP de T45 antes de implementar; no se sustituyeron por aserciones permisivas para ocultar cambios del contrato.

Casos nuevos: tres roles en login con slug transaccional distinto de la relación anterior; tres roles en perfil que ignoran el negocio/slug del JWT y releen cambios; HTTP con segundo negocio y slug propio actualizado; HTTP de superadmin sin identificador. Las regresiones conservan logout/revocación, vencimiento, cuenta/licencia no habilitadas, validación de cuerpos y recuperación/activación.

## Comandos finales y resultados reales

| Comando | Resultado |
| --- | --- |
| `npm test -- --runInBand` | **73 suites y 371 pruebas aprobadas; 0 fallos**. Suite unitaria completa. |
| `npm run test:e2e -- --runInBand --runTestsByPath test/auth-t45.e2e-spec.ts test/auth-t46.e2e-spec.ts test/regresion-auth-t128.e2e-spec.ts` | **3 suites y 26 pruebas aprobadas; 0 fallos**. HTTP de autenticación y regresiones dependientes. |
| `npm run test:integration -- --runInBand --runTestsByPath test/auth-dominio-t26-t30.integration-spec.ts` | **1 suite y 4 pruebas aprobadas; 0 fallos**. Autenticación e aislamiento del dominio. |
| `npm run build` | Aprobado (Nest/TypeScript). |
| `npm run lint` | Aprobado (oxlint, sin autofix). |
| `git diff --check` | Aprobado. |

Los primeros intentos con sandbox produjeron EACCES al conectar a HTTP local o MariaDB: 3 casos unitarios y las suites HTTP/integración no podían abrir conexiones. Se repitieron los mismos comandos con acceso local permitido y pasaron; no se cambiaron tests para sortear ese fallo del entorno. No hay tests omitidos en las ejecuciones finales indicadas.

HTTP e integración usan conBaseMigrada: bases desechables `citas_persistencia_<uuid>`, migradas para cada caso, con nombre validado y limpieza al terminar. No se alteró la base cotidiana. No se ejecutó toda la colección HTTP/integración del repositorio: se ejecutaron las suites relacionadas indicadas, además de toda la suite unitaria.

Frontend: `npm test` completo, **152 aprobadas y 0 fallos**, build aprobado (122 módulos). Incluye tres nuevas regresiones de login/restauración, actualización de slug y ausencia/valor inválido sin reutilizar enlace. El doble de login/perfil de tests/backend.test.js se actualiza al campo nuevo. La revisión visual usa API ficticia; es distinta de las pruebas HTTP reales con MariaDB.

## Uso y límites

Ejecutar el backend actualizado y recargar Mi cuenta en el frontend actualizado. Las sesiones vigentes no requieren un JWT nuevo porque perfil reconstruye el identificador desde la base. El dato adicional es compatible con consumidores que ignoran campos desconocidos; las comparaciones exactas de tests se actualizaron.

La autorización concedida corresponde exclusivamente al ajuste descrito. No se cambia la política de licencia pública, el límite conocido de recuperación/CSRF tras recarga, el registro público, Nginx ni el despliegue. No se declara producción habilitada ni cierre de T117 o de la fase 4.

Detalle de implementación y evidencia visual del frontend: [acceso desde Mi cuenta](../../../../frontend-saas/docs/fase-4/resultados-tareas/resultado-acceso-portal-perfil.md).
