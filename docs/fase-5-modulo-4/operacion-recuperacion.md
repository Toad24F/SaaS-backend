# M4-T122 — Operación y recuperación de gestión operativa

Esta guía describe el código existente de [citas](../../src/citas/citas.controller.ts), [intentos](../../src/citas/intentos-cita-manual.service.ts) y [registro](../../src/citas/registro-cita-manual.service.ts). Se aplica la [especificación](spec.md), el [plan](plan.md) y el [contrato común de escritores](../fase-3-modulo-2/resultados-tareas/contrato-escritores-t078-t079.md). Es un procedimiento de operación; ejecutar las suites locales no habilita producción.

## Preparar una entrega

1. Conservar una copia recuperable de la base y el artefacto compatible anterior según el procedimiento del entorno. Identificar base y revisión sin copiar credenciales a evidencias. Detener las altas nuevas antes de aplicar cambios de esquema.
2. Compilar el backend (`npm run build`). Con la configuración del entorno revisada por el operador, ejecutar `npm run migration:run` antes de permitir escrituras nuevas. El arranque no ejecuta migraciones automáticamente y `synchronize` permanece desactivado. No usar una suite de tests para migrar una base operativa.
3. Verificar en la tabla `migrations` las migraciones pendientes aplicadas. El bloque M4 comprende `VersionCitas1760000043000`, `VersionClientes1760000044000`, `IntentosCitaManual1760000045000`, `EventosCita1760000046000`, `AuditoriaClientes1760000047000` y `ReferenciasGestionOperativa1760000048000`, además de todas sus dependencias. [Instalación y actualización](../../test/fase-5-t013-t019.integration-spec.ts) y [restricciones](../../test/fase-5-t007-t012.integration-spec.ts) se comprueban únicamente en bases desechables.
4. Servir backend y frontend compatibles. Verificar sesión, rol, licencia y lecturas antes de reabrir altas. La agenda acepta hasta 42 fechas y rechaza el periodo completo si excede 1.000 citas autorizadas; disponibilidad mantiene 31 fechas. Los historiales y el directorio conservan paginación.
5. Reabrir únicamente tras verificar el entorno y los criterios de la entrega. Las pruebas locales no acreditan dominio, HTTPS, proxy, copias, correo ni configuración de producción.

## Flujo de una cita manual

Administración o Recepción elige una ficha por ID propio o captura una persona nueva. Compartir teléfono no fusiona personas. La disponibilidad manual orienta la selección, pero no garantiza el registro.

1. El navegador conserva una clave opaca y la selección del envío. `POST /citas/manuales/intentos` recibe `{clave, seleccion}` y prepara su huella ligada al actor y negocio. Preparar no ocupa un horario.
2. `POST /citas/manuales/intentos/:clave/registrar` recibe la misma selección. El escritor usa `READ COMMITTED`, bloquea usuarios en orden, intento, negocio, licencia y recursos, incluido el perfil común del Profesional. Tras esperar relee acceso, oferta, contacto, reloj, horario, ocupaciones y cupo telefónico compartido.
3. El motor manual omite anticipación, horizonte y estrategia pública; mantiene duración, separación, atención, bloqueos, licencia e inicio no pasado. El cupo admite dos futuras no canceladas por teléfono normalizado y sucursal entre ambos canales.
4. Un único commit guarda cliente nuevo cuando procede, cita Confirmada, folio, costo/contacto/nombres históricos, extremos UTC, zona, separación, evento e intento registrado. Un fallo revierte todas esas escrituras. Repetir clave y contenido devuelve la misma cita (200); la creación responde 201. Cambiar contenido con la misma clave produce 409.

## Recuperar una respuesta perdida

No crear otra clave, cambiar la selección ni volver a registrar a ciegas mientras el resultado sea incierto. Conservar el envío pendiente y usar la misma sesión autorizada del actor. La recuperación manual continúa exigiendo permiso y licencia; no atribuirle la excepción de recuperación del portal público sin licencia.

`POST /citas/manuales/intentos/:clave/resolver` recibe la selección original y adquiere la exclusión del actor e intento. Espera al escritor y vuelve a comprobar el acceso. Los resultados son:

| Resultado | Acción |
| --- | --- |
| `registrado` | Mostrar la misma cita y folio; no consumir otro cupo ni crear otra persona. |
| `no_registrado` | El cierre es durable y terminal. Una petición tardía con esa clave ya no puede registrar. Solo entonces permitir corregir y preparar un envío nuevo con otra clave. |
| 503 o fallo de red | El resultado sigue incierto. Conservar clave y contenido, e intentar resolver de nuevo; no mostrar ausencia ni éxito inventados. |
| 401/403 | Recuperar una sesión y permisos válidos del mismo actor; no cambiar el dueño del intento ni saltarse la licencia. |
| 409 | Revisar contenido/versión vigente. No sobrescribir el envío pendiente con otra selección. |

Una consulta SQL sin bloqueo, un 404 aislado o una agenda vacía no prueban ausencia. El resolutor puede crear una lápida `no_registrado` incluso si todavía no existe la preparación. [Pruebas del protocolo](../../test/fase-5-t059-t061.integration-spec.ts) verifican ambos órdenes, respuesta registrada, cierre terminal y timeout sin falsa ausencia. [Respuesta perdida real](../../test/fase-5-t066.e2e-spec.ts) y [recarga en navegador](../../test/fase-5-t104-t109.e2e-spec.ts) comprueban el mismo folio y filas únicas.

## Cerrar altas ante una incidencia

No existe un interruptor de mantenimiento M4 en el código. El operador debe aplicar el cierre en el proxy/ingreso del entorno, con reglas por método y ruta comprobadas allí; no se proporciona una configuración ficticia de Nginx. Bloquear preparaciones y registros nuevos manuales (`POST /citas/manuales/intentos`, `POST /citas/manuales/intentos/:clave/registrar`) y sus equivalentes públicos: `POST /publico/negocios/:slug/apartados`, `POST /publico/negocios/:slug/intentos` y `POST /publico/negocios/:slug/intentos/:id/reservar`.

Dejar disponibles las consultas autorizadas, autenticación necesaria, las rutas de resolución manual/pública y la liberación del apartado propio. No bloquear por prefijo toda la API de intentos: impediría conocer commits anteriores. Antes de migrar, drenar escritores en curso; si no pueden drenarse, conservar incertidumbre y resolver después bajo el protocolo normal. Si la incidencia afecta también a estados o movimientos, cerrar por separado sus PATCH hasta restablecer integridad.

No suspender licencias como sustituto del mantenimiento: impediría el acceso operativo y la recuperación manual. No borrar intentos preparados, lápidas, clientes, citas, apartados ni historiales para desbloquear la interfaz. No ejecutar `migration:revert` a ciegas: las migraciones aditivas de M4 protegen datos en uso y algunas rechazan la reversión. Corregir hacia delante o restaurar una copia mediante un procedimiento del entorno probado por el operador, preservando los commits posteriores que correspondan.

## Estados, movimiento y conservación

Solo Cancelada libera el intervalo. Completada y No asistió requieren alcanzar el fin de atención; No asistió mantiene ocupación. Reactivar una cancelada futura revalida condiciones actuales con separación histórica; el cupo telefónico solo limita altas nuevas. Las públicas Pendientes no caducan automáticamente en M4.

Los PATCH de estado y horario exigen versión vigente. Un 409 requiere releer el detalle y decidir otra vez. Mover conserva folio, persona, combinación, costo, duración y separación históricos; actualiza horario, zona, versión y evento en un commit. Corregir la ficha de cliente solo afecta usos futuros. Conservar citas e historiales, incluso ante cambios de catálogo, cancelación o corrección.

Los registros operativos deben identificar revisión, comando, conteo, resultado y pendientes. No adjuntar cookies, JWT, claves utilizables, cuerpos con contacto/notas ni logs SQL a informes versionados. Los fallos técnicos son 500/503 y nunca resultados parciales o agendas vacías.

## Frontera externa

M3-T136 conserva su estado pendiente. Las evidencias del escritor manual se enlazan a M2-I004/M3-I001 y ALA-I001–ALA-I003 sin cerrar otras tareas por arrastre. WhatsApp, cancelación automática de pendientes, PDF y pagos corresponden al módulo 5. El cierre de verificación M4 no despliega ni habilita producción.
