# Resultado M1-T036 — pruebas del alta y rollback conjunto

Fecha: 2026-09-28. **T036 hecha.** Se añadió una suite de integración para verificar el alta real de T035 sobre una base MariaDB temporal migrada, con dos conexiones, reloj controlado y transporte de correo simulado. Las pruebas se escribieron y ejecutaron antes de considerar cambios de producción: los 17 casos pasaron en la primera ejecución. No fue necesario modificar servicios, entidades, migraciones ni esquema SQL.

## Flujo verificado

1. El superadmin solicita un alta con nombre, RFC, slug y correo. Se normaliza la identidad; el RFC puede coincidir con el de otro negocio si slug y correo están disponibles.
2. Una sola transacción guarda negocio pendiente, licencia sin iniciar, invitación sin cuenta, reserva del correo, código de activación y envío pendiente. La emisión y el alta generan sus eventos de auditoría sin código utilizable.
3. Si un slug o correo normalizado está ocupado por otra invitación o cuenta, se rechaza el alta. Se verifica desde otra conexión que todos los registros previos permanecen idénticos, sin nuevas filas parciales.
4. Para comprobar rollback se instala un trigger `AFTER INSERT` en la base temporal que lanza un error en una etapa concreta. El servicio ejecuta las escrituras reales y la transacción revierte el conjunto, incluidas reserva, código, envío y auditoría. La prueba preserva un negocio anterior para detectar alteraciones accidentales de datos ajenos.
5. Tras quitar el trigger se vuelve a solicitar exactamente el mismo slug y correo: el alta pasa. Esto comprueba que el intento fallido tampoco dejó una reserva huérfana que impida reintentar.
6. Una vez confirmado el alta, el procesador contacta al transporte simulado. Un rechazo o timeout deja el envío fallido con error sanitizado y próximo intento a 60 segundos; negocio e invitación permanecen pendientes, licencia sin iniciar y cuenta ausente. El superadmin puede consultar ese resultado.
7. Antes de los 60 segundos no se vuelve a tomar el envío. En el límite exacto, una nueva instancia del procesador sobre la segunda conexión lo recupera y confirma la aceptación. El mensaje contiene el mismo código, la expiración no cambia y el resto del dominio y auditoría permanece intacto. Un confirmado no se vuelve a enviar.

## Casos de prueba

| Grupo | Casos | Qué comprueba |
| --- | ---: | --- |
| RFC repetido | 1 | Dos altas completas con el mismo RFC normalizado, referencias separadas por negocio y ningún administrador creado. |
| Identidad ocupada | 3 | Slug, correo de invitación y correo de cuenta existentes; rechazo con 409 y ausencia de cambios parciales. |
| Altas simultáneas | 2 | Dos conexiones compiten por slug o correo normalizado; gana una sola, con un conjunto de registros y dos eventos de auditoría. |
| Fallos de escritura | 8 | Error después de insertar negocio, licencia, invitación, reserva, código, envío, auditoría de código y auditoría de negocio. Compara todos los registros antes/después y prueba el alta posterior con la misma identidad. |
| Falta de configuración | 1 | Sin clave HMAC, se revierte el conjunto y no se genera una entrega manual de respaldo; con la clave de prueba se puede reintentar. |
| Fallos de transporte | 2 | Rechazo y timeout conservan el dominio pendiente; consulta de fallo, backoff, recuperación desde la bandeja y expiración intacta. Se comprueba ausencia del código utilizable en respuestas y persistencia. |

Los triggers se crean solo en la base desechable de `conBaseMigrada`, con tablas y acciones de una lista cerrada. Se eliminan en `finally`; el ejecutor existente cierra conexiones y elimina exclusivamente esa base temporal. No se altera la base cotidiana. Los códigos y mensajes reconstruidos se conservan únicamente en memoria de prueba; no se usan credenciales SMTP ni se envían correos reales.

## Archivos y función

- [`alta-rollback-t036.integration-spec.ts`](../../../test/alta-rollback-t036.integration-spec.ts): nuevo archivo con los 17 casos, creación del actor y servicios reales, captura de registros completos, triggers de fallo y procesamiento con transporte controlado. Los comentarios explican la comparación desde otra conexión, la inyección después de escrituras reales, la reserva tras rollback y la recuperación sin extender el código.
- [`resultados-t036.md`](resultados-t036.md): documenta flujo, alcance, función de los archivos y resultados de verificación.
- [`tareas-modulo-1.md`](../tareas-modulo-1.md): registra T036 y enlaza esta evidencia una vez verificadas las suites.

## Verificación final

La suite focalizada terminó con código 0: 1 suite y **17/17 pruebas aprobadas**. Después se ejecutaron las suites completas con la comprobación reforzada de ausencia del código utilizable en persistencia y respuestas:

| Comando | Resultado |
| --- | --- |
| `npm test -- --runInBand` | 43 suites; **212/212** aprobadas |
| `npm run test:integration -- --runInBand` | 25 suites; **130/130** aprobadas |
| `npm run test:e2e -- --runInBand` | 10 suites; **94/94** aprobadas |
| `npm run build` | Correcta |
| `npm run lint` | Sin errores |

Total: **436 pruebas aprobadas**. Todas las verificaciones finalizaron con código 0. Los ERROR de T48/T49/T50/T72 corresponden a fallos inyectados deliberadamente en las suites de rollback. Se verificaron las rutas de esta evidencia y `git diff --check`. El archivo incremental generado por la compilación se restauró. La lista queda con 36 tareas hechas y 104 pendientes; el trabajo se detiene en T036.

## Alcance

Esta evidencia corresponde al alta y a sus fallos de persistencia/entrega. No acredita activación de la nueva invitación ni las tareas de corrección y reemisión posteriores. No se implementó T037. Los antecedentes de fase 1 conservan su alcance histórico; esta suite utiliza el servicio real de fase 2 y no la fixture de altas históricas.
