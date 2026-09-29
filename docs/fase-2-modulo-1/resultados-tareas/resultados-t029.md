# Resultado M1-T029 — encolado con la operación de dominio

Fecha: 2026-09-28. Se implementó `BandejaCorreoService` para registrar un pendiente usando el `EntityManager` de una transacción ya abierta por el llamador. No abre ni confirma otra transacción y no depende del transporte SMTP. Un fallo posterior revierte el pendiente junto con el código, la auditoría y los cambios de dominio.

## Flujo implementado

1. El caso de uso abre su transacción y realiza la operación de dominio. Para un código, primero confirma dentro de ese mismo manager su emisión; todavía no hace commit.
2. Llama a `encolarCodigo` o `encolarAviso` con ese manager. El servicio rechaza un manager sin transacción activa y valida negocio y fecha.
3. Bloquea el código o la licencia del negocio. Para códigos comprueba que la emisión nueva sea reconstruible, no esté consumida, invalidada ni vencida, y toma el correo del propio código. Para avisos obtiene el correo de una cuenta administradora activa y activada del mismo negocio y exige una versión positiva.
4. Genera la clave lógica de deduplicación a partir del negocio y el código, o de negocio/licencia/versión. Bajo el bloqueo de la referencia, consulta el envío mediante lectura actual: si existe, devuelve su estado sin reiniciar intentos. Si no existe, crea `pendiente`, cero intentos y próxima ejecución igual al reloj recibido, sin arrendamiento ni confirmación.
5. El llamador confirma o revierte la transacción completa. Antes del commit, otra conexión no ve el envío. Después del commit, el pendiente es durable; encolar tampoco invoca SMTP después de confirmar.
6. T030–T033 tomarán y procesarán los pendientes tras el commit. T035/T040 conectarán el encolado a los nuevos flujos HTTP. T116–T118 seleccionarán vencimientos elegibles y revalidarán los avisos: el encolador actual valida referencia, administrador y formato de versión, pero no decide la ventana de aviso ni compara todavía la versión con el modelo futuro de licencia.

## Archivos y función

- [`bandeja-correo.service.ts`](../../../src/correos/bandeja-correo.service.ts): añade ambos métodos de encolado, validación de transacción, pertenencia y estado; construye las claves lógicas y conserva el pendiente existente. Los comentarios explican de dónde sale el destinatario, el orden de bloqueo, la lectura actual y el rollback compartido. No recibe ni persiste un cuerpo o código utilizable.
- [`correos.module.ts`](../../../src/correos/correos.module.ts): registra y exporta el servicio de bandeja junto con el adaptador SMTP; registra la entidad de envíos mediante `TypeOrmModule.forFeature` para la carga automática en producción. Los comentarios distinguen registro, encolado y ejecución de envíos.
- [`modulos-fase-2.spec.ts`](../../../src/modulos-fase-2.spec.ts): verifica que Nest registre servicio y repositorio sin invocar SMTP durante el arranque; sustituye solo la persistencia por un doble de prueba.
- [`encolado-correo.integration-spec.ts`](../../../test/encolado-correo.integration-spec.ts): prueba commit y visibilidad desde otra conexión, ausencia de llamadas SMTP, rollback del cambio/código/auditoría/envío, transacción obligatoria, aislamiento, deduplicación sin reiniciar estado, referencias de aviso, concurrencia y vencimiento exacto/invalidación.
- [`tareas-modulo-1.md`](../tareas-modulo-1.md): marca solo T029 como hecha y enlaza esta evidencia.

## Tests primero

La ejecución inicial falló porque no existía `BandejaCorreoService`. Tras implementarlo se corrigió la conversión de `COUNT(*)`, que MariaDB devuelve como cadena en esta configuración. Una prueba adicional de encolados concurrentes reprodujo `Record has changed since last read` al releer después de intentar una inserción duplicada. Se cambió el orden para bloquear la referencia y consultar el pendiente antes de insertar; las **6/6** pruebas focalizadas pasaron.

La prueba de composición falló primero por faltar `EnvioCorreoRepository`; se añadió el registro de entidad requerido por `autoLoadEntities` y pasó. La suite unitaria completa posterior pasó **212/212 en 43 suites**; integración **91/91 en 22 suites**; HTTP/e2e **93/93 en 9 suites**, también tras el ajuste de composición. `npm run build` y `npm run lint` pasaron. Las pruebas usan bases temporales validadas y destinatarios `example.test`; SMTP está interceptado para comprobar que no se invoca. Los mensajes `ERROR` de e2e pertenecen a fallos inyectados para comprobar rollback; Jest terminó con código 0.
