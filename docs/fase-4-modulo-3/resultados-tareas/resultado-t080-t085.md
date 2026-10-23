# Resultado M3-T080–T085

Fecha: 19 de octubre de 2026. Revisión base: `41cd2279ad89daf637b3e2ada81cb540aefa9d05`; evidencia sobre los cambios de este lote en el árbol de trabajo.

## Alcance y archivos

Se exponen preparación, registro y resolución del envío mediante las tres rutas restantes del portal. Se reutilizan los servicios transaccionales y el motor de disponibilidad existentes. El lote termina en T085.

| Archivo agregado o modificado | Finalidad |
| --- | --- |
| `src/reservas-publicas/portal-publico.controller.ts` | Añade `POST /intentos`, `POST /intentos/:id/reservar` y `POST /intentos/:id/resolver`. Obtiene negocio del slug y titular de la cookie; exige origen, CSRF y sesión persistida, valida la clave y el cuerpo de resolución, aplica respuestas personales `no-store` y errores públicos seguros. Los comentarios explican la clave pública, recuperación sin licencia y cierre durable. |
| `src/reservas-publicas/intentos-reserva-publica.service.ts` | Añade `prepararConMeta`: informa dentro de la transacción si la preparación fue nueva o repetida, para responder 201 o 200 sin una consulta previa vulnerable a carreras. Conserva `preparar` y su contrato interno. |
| `src/reservas-publicas/registro-reserva-publica.service.ts` | Añade `registrarConMeta`: devuelve resultado y repetición desde la misma transacción que reconoce o guarda la cita. Conserva el contrato de `registrar`, la revalidación, los bloqueos y el commit atómico. |
| `src/reservas-publicas/reservas-publicas.module.ts` | Actualiza el comentario de la frontera de dominio para reflejar el uso de sus colaboradores desde HTTP. |
| `src/reservas-publicas/reservas-publicas-http.module.ts` | Documenta la frontera de las nueve rutas públicas y su protección de mutaciones. |
| `src/reservas-publicas/resolver-negocio-publico.service.ts` | Aclara en el comentario que la resolución sin licencia se reutiliza para liberar y recuperar resultados propios; cualquier escritura nueva debe revalidarla en su transacción. |
| `test/fase-4-t080-t085.e2e-spec.ts` | Agrega 12 casos HTTP con Supertest, aplicación real, reloj inyectado y MariaDB migrada desechable. Comprueba respuestas y filas persistidas; incluye comentarios sobre escenarios, exclusión, incertidumbre y rollback. |
| `docs/fase-4-modulo-3/tareas.md` | Marca exclusivamente M3-T080–T085 al satisfacer sus criterios. |
| `docs/fase-4-modulo-3/resultados-tareas/resultado-t080-t085.md` | Describe archivos, contrato, flujo, pruebas y resultados de este lote. |

No se requieren cambios de esquema, entidades ni migraciones: la persistencia necesaria ya estaba implementada.

## Contrato y flujo HTTP

Todas las rutas parten de `/publico/negocios/:slug`. `:id` identifica la **clave opaca de intento** elegida por el navegador, de 16 a 64 caracteres alfanuméricos, guion o guion bajo. No es el ID SQL autogenerado. Esta decisión permite resolver el envío con el marcador mínimo del navegador incluso si la preparación o su respuesta se perdieron. La clave siempre se busca dentro de la sesión y negocio autorizados; conocerla no acredita propiedad.

1. El navegador ya dispone de cookie anónima y token CSRF y obtiene un apartado. Envía `POST /intentos` con `{ clave, apartadoId }`. El controlador valida cookie, origen, CSRF, negocio con licencia y sesión persistida. El servicio bloquea la sesión, verifica el apartado propio, actual y vigente y prepara el intento sin renovar su expiración. Responde `{ id: clave, apartadoId, estado }`: 201 en creación y 200 en repetición compatible. Reutilizar una clave terminal o con otro apartado produce 409.
2. Envía `POST /intentos/:id/reservar` con `{ nombre, telefono, notas? }`. Se rechazan campos adicionales, entre ellos estado, costo, fin, negocio e identidad. Se reutiliza la normalización de contacto y la huella HMAC del servicio. El negocio se resuelve sin exigir licencia en la frontera para permitir recuperar una repetición ya registrada; para cualquier escritura nueva el motor revalida la licencia dentro de la transacción y tras adquirir los bloqueos.
3. El escritor bloquea sesión, intento y recursos en el orden común, relee apartado, generación, licencia y oferta y revalida intervalo y duración con el motor compartido. Guarda cliente nuevo, cita `pendiente`, consumo del apartado, retirada del puntero y resultado en un único commit. Devuelve 201 para creación y 200 para una repetición con contenido normalizado equivalente; contenido diferente produce 409. El resumen incluye folio, estado, extremos UTC, zona, costo aceptado y nombres históricos, sin contacto ni datos internos.
4. Ante envío incierto, `POST /intentos/:id/resolver` recibe exclusivamente `{ apartadoId }`. Sigue exigiendo cookie, origen, CSRF y pertenencia, pero permite recuperar resultados después de cerrar la licencia. Bajo la misma exclusión del escritor devuelve 200 con `{ estado: 'registrado', resultado }` o cierra de forma durable `{ estado: 'no_registrado' }`. En este último caso libera solo el apartado propio correspondiente. Si la preparación nunca llegó, crea el registro terminal para impedir una escritura tardía.
5. Una espera agotada o fallo temporal devuelve 503; un error inesperado devuelve 500. Ninguno se interpreta como éxito o ausencia de cita. Credencial perdida devuelve 401 y acción de reinicio; recursos ajenos o inexistentes, 404 uniforme; origen/CSRF inválido, 403; entrada inválida, 400. Las respuestas personales, incluidos errores, llevan `Cache-Control: no-store`. No hay búsqueda por teléfono o folio.

La copia histórica conserva costo del apartado y contacto normalizado de cada reserva, incluso si el teléfono se comparte. Los cambios de catálogo posteriores no modifican el resultado recuperado. La cita pendiente sigue ocupando su intervalo después del plazo del apartado; este módulo no le añade caducidad ni confirmación de WhatsApp.

## Tests primero y casos ejecutados

Se escribió primero la suite HTTP. El primer intento dentro del sandbox no pudo conectarse al loopback de MariaDB (`EACCES`); se repitió con el permiso de ejecución necesario. Antes de implementar las rutas, **11 de 11 pruebas fallaron con 404** en las operaciones de intento que aún no existían. Después de implementar, esas 11 pasaron. Se reforzaron comprobaciones del resumen, ocupación y filas finales y se añadió un caso de fallo SQL real: **12 de 12 pruebas aprobadas**.

| Tarea / RF locales de fase 4 | Prueba y comprobaciones |
| --- | --- |
| T080; RF-08–RF-11, RF-13, RF-34–RF-35, RF-37, RF-39 | Preparación 201 y repetición 200; contacto inválido y campos desconocidos 400; cita y resumen exactos, folio, consumo y puntero; repetición normalizada devuelve mismo resultado y solo una cita; otro contenido 409. |
| T081; RF-03, RF-28, RF-35, RF-39–RF-43 | Recuperación registrada y repetición después del cierre de licencia; clave cuya preparación no llegó queda `no_registrado` y bloquea preparación y registro tardíos; repetir resolución conserva el cierre. |
| T082; RF-08–RF-13, RF-34, RF-36–RF-38 | Dos reservas con mismo teléfono y distintos nombres crean clientes independientes, conservan contacto y notas y tienen folios diferentes. Notas con apariencia de HTML se guardan como texto. Tras seis minutos la cita sigue pendiente; disponibilidad conserva otros horarios y excluye el intervalo ocupado; otro navegador recibe 409 al intentar apartarlo. |
| T083; RF-12, RF-30, RF-36–RF-37, RF-39 | Costo cambia de 100 a 250 durante apartado: la cita respeta 100 y un nuevo apartado acepta 250. Cambiar nombres de negocio/servicio/sucursal/profesional, costo, duración y zona después de guardar no modifica el resumen recuperado ni el contacto persistido. |
| T084; RF-03–RF-04, RF-18, RF-31–RF-32 | Cinco casos: oferta inactiva, duración distinta, vencimiento exacto, licencia vencida y apartado liberado. Ninguno crea cliente/cita nuevos ni renueva el plazo; los no liberados previamente conservan su estado. Preparar, reservar o resolver con apartado ajeno también se rechaza. |
| T085; RF-02–RF-03, RF-13, RF-29, RF-40–RF-43 | Cookie ajena, clave inexistente en otra sesión y segundo negocio no revelan resultados. Cookie ausente/inválida, origen y CSRF se rechazan. No hay consulta por folio ni recuperación con teléfono. Fallos temporales e inesperados responden 503/500 seguros sin estado falso; después se recupera el resultado real. |
| Refuerzo T080/T085; RF-34–RF-35, RF-39–RF-43 | Disparador MariaDB `AFTER INSERT` de cita produce fallo real: HTTP 500 sin SQL, rollback de cita y cliente, apartado sin consumir y vencimiento original; reintentar misma clave permite registrar y recuperar. |

Las pruebas HTTP usan servicios y persistencia reales. Solo el caso de clasificación de fallo técnico del resolutor inyecta una excepción en esa frontera para verificar el contrato 503/500; no se presenta ese doble como evidencia de carrera entre escritor y resolutor. Las carreras con dos conexiones y ambos órdenes de commit permanecen en T086–T096.

## Verificaciones

| Comando | Resultado |
| --- | --- |
| `npm run test:e2e -- --runInBand test/fase-4-t080-t085.e2e-spec.ts` antes de implementar | Rojo funcional: 1 suite y 11 pruebas fallidas por rutas ausentes (404), después de permitir la conexión local. |
| `npm run test:e2e -- --runInBand test/fase-4-t080-t085.e2e-spec.ts` final | 1 suite, 12 pruebas aprobadas; código de salida 0. |
| `npm run build` | Aprobado; código de salida 0. |
| `npm run lint` | Aprobado sin advertencias; código de salida 0. |
| `npm test -- --runInBand` | 72 suites, 361 pruebas aprobadas; código de salida 0. |
| `npm run test:integration -- --runInBand` | 72 suites, 298 pruebas aprobadas; código de salida 0. Incluye regresión del motor, apartados, escritor y resolutor internos. |
| `npm run test:e2e -- --runInBand` | 29 suites, 159 pruebas aprobadas; código de salida 0. Incluye los 12 casos nuevos. |
| `git diff --check` | Aprobado; sin errores de whitespace. |

La primera ejecución unitaria dentro del sandbox tuvo dos errores `EACCES` en las pruebas existentes de cuerpo HTTP por conexión a puertos locales. Al repetir la suite completa con permiso de loopback pasaron las 361 pruebas. Los mensajes `ERROR` de casos HTTP históricos que inyectan fallos de auditoría son esperados: la suite terminó con código 0. Todas las escrituras nuevas de este lote se ejecutaron mediante `conBaseMigrada`, que crea, migra y elimina una base exclusiva `citas_persistencia_<uuid>`; no utiliza la base cotidiana.

## Límites y siguiente punto

M3-T086 y posteriores permanecen pendientes. M2-I004/M3-I001 siguen diferidos al escritor manual real del módulo 4; este lote no acredita integración completa del módulo 2. La evidencia histórica de lotes anteriores conserva su alcance temporal. No se declara fase cerrada ni producción habilitada antes de M3-T136.
