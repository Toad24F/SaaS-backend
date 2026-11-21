# M5-T005 — Contratos HTTP previstos

Propuesta derivada del [plan, sección 4](../plan.md#4-contratos-e-integración-por-flujo) y la [especificación](../spec.md). Las rutas marcadas como ampliación tienen un antecedente en el producto. Las entradas, salidas y permisos de esta nota describen su comportamiento previsto para el módulo 5. Los nombres de campos nuevos y de rutas que el plan deja abiertos se proponen aquí para la implementación posterior.

## Citas y clientes

| Ruta | Entrada | Salida de éxito | Permiso | Errores específicos |
| --- | --- | --- | --- | --- |
| `POST /citas/manuales/intentos` · ampliación | `{clave, seleccion}`. La selección incluye `sucursalId`, `servicioId`, `personalId`, `fechaLocal`, `horaInicio`, notas opcionales y datos del cliente según el rol | 201 preparación de la operación | Administración y Recepción autorizadas. Profesional solo para su perfil resuelto en servidor | 404 selección ajena, 409 clave incompatible o selección en conflicto |
| `POST /citas/manuales/intentos/:clave/registrar` · ampliación | Clave en ruta y misma selección en el cuerpo, incluida la autorización de contacto por WhatsApp cuando proceda | 201 cita Confirmada, 200 repetición propia. Resumen sin folio al completar su retiro | Administración y Recepción pueden elegir una ficha autorizada con `clienteId`. Profesional captura contacto en `clienteNuevo` | 409 versión, cupo, disponibilidad, identidad ambigua o contenido distinto |
| `POST /citas/manuales/intentos/:clave/resolver` · ampliación | Clave en ruta y misma selección en el cuerpo | 200 resultado registrado o `no_registrado` terminal | Actor autorizado del intento | 404 intento ajeno, 409 contenido distinto, 503 estado incierto recuperable |
| `PATCH /citas/:id/horario` · ampliación | Versión observada, fecha y hora locales | 200 horario, estado y versión resultantes. Reprogramar Pendiente la deja Confirmada | Administración y Recepción en su alcance. Profesional solo sobre cita propia | 404 cita ajena, 409 versión, estado u ocupación |
| `PATCH /citas/:id/estado` · ampliación | Versión, estado solicitado y motivo cuando corresponde | 200 estado y versión resultantes. Reactivar Cancelada la deja Confirmada | Administración y Recepción en su alcance. Profesional solo sobre cita propia | 404 cita ajena, 409 versión, transición o reactivación sin disponibilidad |
| `GET /citas`, `GET /citas/:id`, `GET /citas/:id/historial` · ampliación de proyección | Filtros de agenda o ID y filtros de historial vigentes | 200 agenda, detalle o historial autorizado, con causa de seguimiento cuando corresponda | Alcance operativo vigente, limitado a las citas propias para el Profesional | 404 cita ajena, 400 filtros inválidos o periodo que exige acotar |
| `GET /clientes`, `GET /clientes/:id`, `GET /clientes/:id/citas` · ampliación | Búsqueda/página o ID y filtros de historial | 200 directorio, ficha activa o historial autorizado según ruta | Administración y Recepción | 404 ficha fuera de alcance, 400 filtros inválidos |
| `POST /clientes` · ampliación | `nombreCompleto` y `telefono` | 201 nueva ficha o 200 ficha activa coincidente sin sobrescritura | Administración y Recepción | 409 identidad heredada ambigua |
| `PATCH /clientes/:id` · ampliación | ID, versión y datos editables | 200 ficha actualizada | Administración y Recepción | 404 ficha ajena, 409 versión o `cliente_coincidente` con destino mínimo autorizado |
| `POST /clientes/:id/uniones` · nueva | ID origen, ID destino indicado en la advertencia, versiones y clave de operación. Datos propuestos cuando se originó en edición | 200 resultado de la unión o repetición equivalente | Administración y Recepción | 404 ficha ajena, 409 versiones, clave reutilizada, coincidencia inválida o destino ya fusionado |
| `POST /publico/negocios/:slug/intentos/:id/reservar` · ampliación | Intento y apartado propios, datos del cliente y autorización explícita de WhatsApp si acepta | 201 Pendiente o 200 repetición, resumen propio y condiciones sin revelar fichas. Retiro del folio coordinado | Sesión anónima propia, origen/CSRF, apartado y licencia aplicable | 409 conflicto genérico ante cupo, identidad ambigua, apartado o intento incompatible |
| `POST /publico/negocios/:slug/intentos/:id/resolver` · ampliación | Clave opaca en ruta y `{apartadoId}` en el cuerpo | 200 resultado propio o `no_registrado` terminal | Sesión propia y origen/CSRF. Recuperación disponible si cesa la licencia de nuevas reservas | 404 intento ajeno, 503 incertidumbre recuperable |

## Consultas y personalización

| Ruta | Entrada | Salida de éxito | Permiso | Errores específicos |
| --- | --- | --- | --- | --- |
| `GET /negocios/:id/envios` · ampliación | `pagina`, `limite` (25 inicial, 100 máximo), `estado`, `tipo`, `desde`, `hasta`. Fechas de registro UTC inclusivas | 200 filas ordenadas por creación e ID descendentes, página, límite, total y contadores del mismo conjunto filtrado | Superadmin | 400 fechas invertidas o filtros inválidos, 404 negocio inexistente |
| `GET /bloqueos` · ampliación | Paginación equivalente, `vigencia=vigentes_proximos\|anteriores\|todos`, motivo parcial, tipo, sucursal, Profesional y rango por solapamiento | 200 página por inicio e ID ascendentes, total y vigencia por fin exclusivo en zonas autorizadas | Administración y Profesional con su alcance vigente | 400 filtros inválidos, 404 recurso ajeno |
| `GET /negocio/personalizacion` · nueva | Sesión del negocio | 200 versión, configuración publicada y valores predeterminados | Administración para el editor | 404 recurso ajeno si hay una referencia de recurso |
| `POST /negocio/personalizacion/logos` · nueva | Imagen raster y versión observada | 201 logo provisional, ID y caducidad de 24 horas | Administración | 400 formato, dimensiones, decodificación o tamaño inválidos, 409 versión |
| `PUT /negocio/personalizacion` · nueva | Versión observada, colores hex opacos y referencia de logo autorizado | 200 publicación atómica, versión y marca publicadas | Administración | 400 colores/contraste inválidos, 404 recurso ajeno, 409 publicación obsoleta |
| `POST /negocio/personalizacion/restaurar` · nueva | Versión observada | 200 versión y valores predeterminados publicados | Administración | 409 versión obsoleta |
| `GET /publico/negocios/:slug/catalogo` · ampliación | Slug y filtros de catálogo vigentes | 200 catálogo, marca publicada y URL si hay logo vigente | Acceso público bajo las reglas vigentes de catálogo | 404 portal no disponible según contrato público |
| `GET /publico/negocios/:slug/logos/:id` · propuesta de recurso público | Negocio por slug e ID de recurso | 200 raster saneado y MIME de salida | Consulta pública únicamente del logo publicado del negocio | 404 recurso ajeno, provisional, sustituido o inexistente |

Los totales de correos aplican todos los filtros, incluido estado. Los bloqueos colectivos se clasifican sobre las sedes autorizadas incluidas, se cuentan una vez y siguen afectando al motor completo. El editor previsualiza y descarta localmente. Al publicar, el servidor vuelve a validar contraste, versión y pertenencia.

## Automatizaciones, webhooks y reportes

| Ruta | Entrada | Salida de éxito | Permiso | Errores específicos |
| --- | --- | --- | --- | --- |
| `GET /negocio/automatizaciones` · propuesta | Sesión del negocio | 200 versión, plazo normal y anticipación de recordatorio con valores iniciales de 12 h y 24 h | Administración | 403 licencia/permiso |
| `PUT /negocio/automatizaciones` · propuesta | Versión observada, plazo normal de 6 a 24 h y recordatorio de 12 a 48 h, enteros | 200 configuración versionada para condiciones nuevas | Administración | 400 valores inválidos, 409 versión |
| `GET /webhooks/whatsapp` · nueva | `hub.mode`, `hub.verify_token`, `hub.challenge` | 200 con reto en texto plano | Verificación de Meta y token del servidor | 400 reto mal formado, 403 token inválido |
| `POST /webhooks/whatsapp` · nueva | Cuerpo original, firma y eventos de Meta | 200 tras recepción durable o deduplicación de eventos reconocidos | Autenticación de proveedor y asociación de canal en servidor | 400 contrato inválido, 403 firma inválida, 503 persistencia temporal |
| `POST /reportes/cortes` · nueva | Periodo civil inclusivo, sucursal, Profesional y servicio opcionales, agrupación semana/mes | 201 corte completo, ID, filtros, fecha y caducidad de 24 h | Administración del negocio | 400 filtros o rango inválidos, 404 filtro ajeno, 503 fallo temporal sin corte parcial |
| `GET /reportes/cortes/:id` · nueva | ID opaco de corte | 200 resumen, indicadores, totales y metadatos | Administración y titular del corte en el mismo negocio | 404 corte ajeno, vencido o inexistente |
| `GET /reportes/cortes/:id/filas` · nueva | ID y paginación, 100 inicial, 500 máximo | 200 página estable, total y metadatos del mismo corte | Administración y titular del corte en el mismo negocio | 400 paginación inválida, 404 corte ajeno, vencido o inexistente |

## Errores comunes y secuencia

| Código | Contrato |
| --- | --- |
| 400 | Entrada inválida, campos desconocidos o filtros incompatibles |
| 401 | Sesión requerida, ausente o inválida en una ruta que la exige |
| 403 | Rol, licencia, origen/CSRF o autenticación de proveedor insuficientes, según ruta |
| 404 | Recurso ausente o fuera del alcance autorizado, con respuesta indistinguible |
| 409 | Conflicto de dominio, versión o reutilización incompatible de una operación |
| 500 | Fallo inesperado con mensaje seguro |
| 503 | Fallo temporal o resultado incierto recuperable, sin devolver una página vacía como éxito |

La aplicación autentica, resuelve la pertenencia y valida la entrada antes de leer o escribir. Cada cambio sensible revalida su alcance y versión tras esperar las barreras transaccionales. Las respuestas personales y los cortes privados llevan `Cache-Control: no-store`. Los errores omiten SQL, trazas, secretos y datos ajenos. El portal conserva las nueve rutas y la disponibilidad privada conserva las cinco del contrato vigente. La confirmación del cliente entra por el webhook. Para imprimir se recorren todas las páginas del mismo corte en el navegador.
