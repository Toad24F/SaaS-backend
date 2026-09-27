# Resultado M1-T020–M1-T024 — códigos por invitación y consumo único

Fecha: 2026-09-27. Los códigos nuevos de activación apuntan a un alta pendiente; los de recuperación apuntan a una cuenta. Cada emisión nueva deriva el valor utilizable con HMAC y una clave versionada externa, pero guarda únicamente su hash y los metadatos necesarios para reconstruirlo. La emisión y el reemplazo son transaccionales; el consumo verifica correo, propósito, versión, vigencia y estado bajo bloqueo, y revierte también la operación asociada si esta falla.

## Archivos y función

| Archivo | Qué hace |
| --- | --- |
| [`codigo-acceso.entity.ts`](../../../src/codigos/entities/codigo-acceso.entity.ts) | Modela los dos destinos excluyentes, versión del destinatario, metadatos de derivación y restricciones de unicidad de códigos vigentes. Los comentarios identifican el destino de invitación y la compatibilidad histórica. |
| [`alta-administrador.entity.ts`](../../../src/altas/entities/alta-administrador.entity.ts) y [`usuario.entity.ts`](../../../src/usuarios/entities/usuario.entity.ts) | Incorporan `correoVersion` para invalidar códigos emitidos antes de cambiar la dirección. |
| [`reserva-correo.service.ts`](../../../src/altas/reserva-correo.service.ts) | Incrementa la versión al corregir el correo del alta, dentro de la misma transacción que cambia la reserva. |
| [`derivador-codigo.ts`](../../../src/codigos/derivador-codigo.ts) | Deriva HMAC-SHA256 de emisión, nonce, propósito, negocio, destinatario, correo y versiones; valida la configuración y separa la clave de JWT. Su comentario explica el contexto canónico. |
| [`codigos.service.ts`](../../../src/codigos/codigos.service.ts) | Emite con 48 horas o 30 minutos, reemplaza invalidando el anterior y consume con bloqueos y transacción. Audita solo propósito y expiración. Los comentarios explican los bloqueos y la información excluida de auditoría. |
| [`codigos.module.ts`](../../../src/codigos/codigos.module.ts) | Registra el derivador como dependencia del servicio. |
| [`CodigosInvitacion`](../../../src/database/migrations/1760000007000-CodigosInvitacion.ts) | Añade columnas, claves foráneas compuestas, checks y unicidad; marca las emisiones previas antes de activar las nuevas restricciones. Los comentarios explican el orden de migración. |
| [`schema.sql`](../../../db/schema.sql) | Refleja la migración en el esquema de referencia, incluido el orden de conversión de datos existentes. |
| [`.env.example`](../../../.env.example) | Documenta versión activa y mapa de claves HMAC de ejemplo, separadas de JWT; no contiene una clave operativa. |
| [`altas.service.ts`](../../../src/altas/altas.service.ts), [`activaciones.service.ts`](../../../src/altas/activaciones.service.ts) y [`credenciales.service.ts`](../../../src/auth/services/credenciales.service.ts) | Identifican las rutas HTTP de fase 1 como históricas y comprueban que sus operaciones reciban códigos ligados a una cuenta. |
| [`codigo-fase-2.spec.ts`](../../../src/codigos/entities/codigo-fase-2.spec.ts), [`derivador-codigo.spec.ts`](../../../src/codigos/derivador-codigo.spec.ts) y [`codigos-fase-2.integration-spec.ts`](../../../test/codigos-fase-2.integration-spec.ts) | Prueban metadatos, derivación y rotación, restricciones SQL, migración con un código histórico, reemplazo, expiración, correo, versión, consumo único y rollback. |
| [`schema-fase-2.spec.ts`](../../../src/database/schema-fase-2.spec.ts), [`identidad-fase-2.integration-spec.ts`](../../../test/identidad-fase-2.integration-spec.ts), [`instalacion-t61.integration-spec.ts`](../../../test/instalacion-t61.integration-spec.ts) y [`migrations.integration-spec.ts`](../../../test/migrations.integration-spec.ts) | Mantienen comprobaciones de coherencia SQL, cantidad y reversión de migraciones; la última sigue probando exclusivamente las cuatro migraciones históricas que registra. |
| [`tareas-modulo-1.md`](../tareas-modulo-1.md) | Marca T020–T024 como hechas y enlaza este resultado. |

## Tests primero y resultado

Primero fallaron las pruebas nuevas por falta del derivador, los campos y las restricciones. Después de implementar, una prueba adicional instaló la migración sobre un código histórico vigente y falló por activar `chk_codigos_derivacion` antes de marcarlo; se corrigió el orden y pasó **4/4** en la suite focalizada de integración. Las pruebas unitarias del nuevo modelo y derivador pasaron **5/5**; cubren reproducibilidad, separación por contexto, versión anterior de clave y configuración mal formada.

Resultado final: `npm test -- --runInBand` **197/197, 40 suites**; `npm run test:integration -- --runInBand` **82/82, 20 suites**; `npm run test:e2e -- --runInBand` **93/93, 9 suites**. También pasaron `npm run build` y `npm run lint`. Los mensajes `ERROR` visibles en e2e pertenecen a escenarios que inyectan fallos para verificar rollback; Jest terminó con código 0.

## Alcance de esta entrega

La ruta interna nueva ya admite invitaciones sin cuenta y exige correo al consumir. Los controladores HTTP de fase 1 siguen usando códigos históricos de cuenta para preservar sus contratos mientras T035–T041 sustituyen alta, activación y recuperación y T025–T033 añaden entrega durable por correo. Esa compatibilidad está señalada en el código mediante `legado_fase_1`; no acredita que los flujos HTTP nuevos ni el correo estén terminados. En despliegue se debe configurar una clave HMAC aleatoria de al menos 32 caracteres, distinta de `JWT_SECRET`, y conservar las versiones anteriores mientras haya emisiones pendientes.
