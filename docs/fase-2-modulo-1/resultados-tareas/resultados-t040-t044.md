# Resultado M1-T040–M1-T044

Fecha: 2026-09-28. **T040–T044 hechas.** Entrega limitada a recuperación por correo, contrato HTTP y pruebas concurrentes de identidad.

## Flujo de recuperación (T040)

1. El superadmin autoriza la recuperación de un administrador existente y activado. Se comprueban el actor actual, rol y pertenencia bajo bloqueo. Recepción y Profesional no reciben estos códigos.
2. En una transacción se invalida la recuperación anterior, se genera una referencia HMAC con vencimiento de **30 minutos**, se descartan sus envíos pendientes/fallidos/tomados y se revoca el arrendamiento anterior. Se encola el envío nuevo y se registra auditoría sin secretos.
3. La respuesta contiene negocio, administrador, envío, estado y vencimiento; el código se entrega mediante el procesador de correo. El administrador puede estar inactivo o su licencia suspendida: recuperar su contraseña conserva ambos bloqueos.
4. La ruta pública recibe código y contraseña. Busca la referencia por hash; el consumo revalida correo, versión, propósito, vigencia y uso bajo bloqueo. Cambia el hash y revoca sesiones en la misma transacción. No activa cuentas ni licencias.
5. Un fallo SMTP queda como error sanitizado en la bandeja y admite los mecanismos existentes de reintento. No se incluyen mensajes del proveedor ni códigos en la consulta HTTP.

## Flujo HTTP (T041 y T044)

- POST /negocios exige RFC y emailAdministrador, además de nombre e identificadorPublico; conserva los nombres del contrato existente. Devuelve invitación y envío, sin usuario pendiente ni código.
- PATCH /negocios/:id/correo-administrador recibe solo correo y devuelve metadatos de la invitación reemplazada. POST /negocios/:id/reemitir-codigo admite cuerpo vacío y devuelve metadatos. Ambas operaciones requieren sesión vigente de superadmin.
- POST /auth/activar-administrador exige negocioId, correo, código, nombre y contraseña. Devuelve **200** con la cuenta completa proyectada sin hash. Un código/destinatario no disponible devuelve **409**; entradas mal formadas o campos adicionales devuelven **400**.
- POST /auth/administradores/:id/autorizar-recuperacion devuelve **201** con metadatos; POST /auth/recuperar-contrasena mantiene código/contraseña y **204**. La recuperación inválida mantiene **400**.
- Los Guards distinguen falta de sesión (**401**) y rol insuficiente (**403**). La reemisión pública exige invitación: la compatibilidad histórica de dominio no puede devolver un código a través de ese controlador.

## Concurrencia (T042 y T043)

Las pruebas usan MariaDB migrada temporal y dos conexiones. Dos activaciones del mismo código producen un solo administrador, consumo, año de licencia y evento de activación. Barreras dentro de transacciones fijan ambos órdenes entre activación y corrección/reemisión: gana quien bloqueó primero. El reemplazo invalida el código anterior; después de corregir, ni el código nuevo acepta el correo anterior.

El ciclo rojo detectó ER_CHECKREAD en MariaDB. La utilidad de identidad reintenta la **transacción completa después del rollback**, hasta tres intentos, para ER_CHECKREAD/ER_LOCK_DEADLOCK. El agotamiento produce conflicto sanitizado; otros errores conservan su tratamiento. SMTP queda fuera de estas transacciones. No se conserva una escritura parcial ni se duplica una auditoría confirmada.

## Archivos agregados

| Archivo (rutas relativas a backend) | Función |
| --- | --- |
| src/comun/transaccion-identidad.ts | Reintento acotado de transacciones de identidad ante conflictos del motor. |
| test/support/invitaciones-fase-2.ts | Servicios reales, invitación nueva, claves aisladas y snapshots de nueve tablas. Reconstruye códigos únicamente en memoria de prueba. |
| test/support/credenciales-prueba.ts | Simula al destinatario de recuperación leyendo su envío y reconstruyendo el código; mantiene real el servicio probado. |
| test/recuperacion-correo-t040.integration-spec.ts | Cuatro casos: entrega, bloques conservados, reemplazo, caducidad exacta y permisos. |
| test/carreras-invitaciones-t042-t043.integration-spec.ts | Cinco casos sobre dos conexiones: doble activación y cuatro órdenes de reemplazo. |
| test/http-identidad-t041-t044.e2e-spec.ts | Nueve casos HTTP con AppModule/Guards/DTO reales, snapshots, roles y captura de logs sin secretos. Incluye fallo SMTP controlado. |
| docs/fase-2-modulo-1/resultados-tareas/resultados-t040-t044.md | Este documento: explica cambios, flujos, pruebas y resultados. |

## Archivos modificados

| Archivo | Qué hace el cambio |
| --- | --- |
| src/auth/services/credenciales.service.ts | Emite recuperación HMAC con bandeja/auditoría atómicas y metadatos seguros; consume usando correo de referencia sin levantar bloqueos. |
| src/correos/procesador-correo.service.ts | Permite entregar recuperación a administrador inactivo y activado; conserva validación de rol/destinatario. |
| src/auth/auth.module.ts | Importa CorreosModule para inyectar la bandeja. |
| src/codigos/codigos.service.ts | Consumo con reintento completo de conflictos de identidad. |
| src/altas/altas.service.ts | Corrección/reemisión con reintento y restricción de invitación en el controlador público. |
| src/altas/activaciones.service.ts | Retorna proyección segura de la cuenta; verifica también correo en registros históricos. |
| src/auth/acceso-codigo.controller.ts | Pasa correo/negocio al servicio, retorna cuenta con 200 y sanitiza conflictos de activación. |
| src/auth/dto/acceso-codigo.dto.ts | Exige correo válido normalizado y negocioId positivo en activación. |
| src/negocios/negocios.controller.ts | Expone corrección protegida y restringe reemisión HTTP a invitaciones. |
| src/negocios/dto/negocios-http.dto.ts | DTO de corrección con solo correo normalizado. |
| test/auth-t46.e2e-spec.ts | Adapta contrato de activación/errores y simula código recibido por correo, conservando cuotas y validación. |
| test/credenciales-t49.e2e-spec.ts | Comprueba metadatos de recuperación, consumo único y bloques; recibe el código solo en memoria de fixture. |
| test/recepcionistas-t48.e2e-spec.ts | Usa invitación moderna para reemisión HTTP segura y conserva pruebas de recepción/rollback. |
| test/seguridad-t72-t73-t75.e2e-spec.ts | Adapta recuperación sin código en respuesta; mantiene auditoría y revocación de sesiones. |
| test/recorridos-t51-t58-t60.e2e-spec.ts | Ajusta correo/negocio y estados HTTP. Conserva preparación histórica de licencias; no la presenta como cobertura del alta nueva. |
| test/concurrencia-t52-t57.integration-spec.ts | Inyecta claves aisladas para regresiones de consumo/rollback. |
| test/cuentas-licencias-t38-t44.integration-spec.ts | Adapta recuperación real a la entrega por correo en sus fixtures. |
| test/procesador-correo.integration-spec.ts | Verifica entrega también con administrador inactivo, sin desbloquearlo. |
| test/support/escenarios-t51-t60.ts | Compone recuperación real con clave aislada y simulación del destinatario. |
| test/support/altas-historicas.ts | Incluye correo del fixture para cumplir el DTO actual en evidencia histórica. |
| docs/fase-2-modulo-1/tareas-modulo-1.md | Vincula evidencia y marca únicamente T040–T044 al finalizar los gates. |

Se añadieron comentarios sobre límites de transacción, reintentos, proyección segura, conservación de bloqueos, barreras concurrentes y secreto exclusivo de fixtures. No se cambió el esquema ni se requieren migraciones nuevas.

## Tests primero y verificaciones

Antes de implementar se ejecutaron los casos nuevos: integración **7 fallidos y 2 aprobados**; HTTP **8 fallidos**. Detectaron ruta/DTO faltantes, recuperación con código en respuesta y conflictos SQL concurrentes. Los nueve casos HTTP finales incluyen además el fallo SMTP sanitizado. Las regresiones detectaron claves ausentes en fixtures antiguas; se corrigieron con claves de prueba explícitas, manteniendo la emisión real y la auditoría inyectada.

Los códigos no se guardan en texto plano en estas fixtures ni se devuelven por producción. El transporte de prueba conserva en memoria el mensaje para verificar la entrega. La captura de ConsoleLogger comprueba que los recorridos no registran códigos ni contraseñas; snapshots verifican que los rechazos no modifican identidad. El limitador público se prueba por separado en T46 y sus intentos no se incluyen en el snapshot de identidad.

### Resultado final

| Verificación | Resultado |
| --- | --- |
| npm test -- --runInBand | 43 suites, **212/212** pruebas aprobadas. |
| npm run test:integration -- --runInBand | 28 suites, **157/157** pruebas aprobadas (108.905 s). |
| npm run test:e2e -- --runInBand | 11 suites, **103/103** pruebas aprobadas (133.542 s). |
| npm run build | Compilación correcta, salida 0. |
| npm run lint | Sin diagnósticos, salida 0. |
| git diff --check | Sin errores de espacios. |

Total: **472 pruebas aprobadas**, incluidas **18/18** nuevas (9 integración y 9 HTTP). Los ERROR de T48/T49/T50/T72 son fallos inyectados de rollback, no fallos del resultado final. Se restauró únicamente el archivo incremental generado. La lista queda con **44 tareas hechas y 96 pendientes**.

La entrega se detiene en T044; T045 permanece pendiente. Las pruebas de correo usan transporte controlado: no acreditan una entrega real por Google ni envían mensajes externos.
