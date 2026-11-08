# ALA-T003 — Inventario de contratos y reglas conservadas

Estado: propuesta pendiente de aprobación. Este inventario distingue el contrato actual comprobado en controladores del cambio previsto en el [plan](../plan.md); enumerarlo no implementa rutas nuevas. Los RF son locales a la [spec](../spec.md).

## Flujo previsto

El superadmin configura límites y operaciones de licencia. El administrador del negocio gestiona sus recursos y la publicación del catálogo. El navegador anónimo sigue el portal público por slug, obtiene su sesión y disponibilidad, concede o libera un apartado propio, prepara el intento y registra o resuelve su resultado. El motor de disponibilidad se comparte con la entrada privada, que conserva autorización por rol. Cada mutación valida negocio y pertenencia en servidor; los IDs, precios, estados y roles enviados por cliente no son autoridad.

## Entradas retiradas, nuevas o modificadas

| Frontera | Entrada y respuesta propuestas | Autoridad y estado |
| --- | --- | --- |
| Licencia | `POST /licencias/:id/suspender`: `plazoDias` opcional 0–30, predeterminado 2. Suspender, reactivar y renovar exigen `Idempotency-Key` 16–64. | Solo superadmin; 200 al reproducir, 409 para contenido incompatible. Nuevo contrato. |
| Cupos | `GET /negocios/:id/cupo-usuarios`, `PATCH /negocios/:id/limites-usuarios`; `GET /profesionales/cupo`, `GET /recepcionistas/cupo`. | Escritura solo superadmin; consulta propia de cada rol solo administrador. Nuevas rutas. |
| Inhabilitación | Para profesionales, recepcionistas, servicios y sucursales: `GET /<recurso>/inhabilitados`, `GET /<recurso>/inhabilitados/:id`, `POST /<recurso>/:id/inhabilitar`, `POST /<recurso>/:id/restaurar`. | Solo administrador propio. Nuevas rutas; restaurar deja inactivo. |
| Bajas | Retirar `DELETE` de los cuatro recursos y conservar activación/desactivación solo para registros no inhabilitados. | Administrador propio; rutas retiradas responden 404 sin escritura. |
| Catálogo | Añadir `GET /negocios/publicacion-catalogo`; PATCH actual admite `mostrarPreciosPublicos` parcial. | Administrador propio; precio público se proyecta según valor vigente. |
| Configuración | `GET/PUT /disponibilidad/configuracion`: retirar `intervaloMinutos`, añadir `tiempoEntreCitasMinutos` y conservar reemplazo completo atómico. | PUT solo administrador; GET según permisos privados vigentes. |
| Horarios | Retirar descansos incrustados y rutas de excepciones por fecha; mantener bloqueos temporales. | Permisos de horarios vigentes; entradas antiguas se rechazan. |
| Intento | Preparar admite `intentoAnteriorId` solo tras rechazo terminal por cupo; reservar/resolver conservan idempotencia y pueden devolver `cupo_telefono_excedido`. | Solo dueño de sesión y apartado; 201 inicial, 200 repetición, 409 conflicto. |

## nueve rutas públicas conservadas

La base es `/publico/negocios/:slug`. La ruta pública usa solo modalidad pública; no suplanta un administrador ni llama HTTP privado.

| Ruta | Uso y permiso conservado |
| --- | --- |
| GET /publico/negocios/:slug/catalogo | Catálogo filtrado por negocio; anónimo. |
| GET /publico/negocios/:slug/disponibilidad | Motor público por selección; anónimo. |
| POST /publico/negocios/:slug/sesion | Cookie anónima propia; origen y CSRF según contrato. |
| POST /publico/negocios/:slug/apartados | Conceder apartado propio; sesión, origen y CSRF. |
| GET /publico/negocios/:slug/apartados/:id | Consultar apartado propio; respuesta personal `no-store`. |
| POST /publico/negocios/:slug/apartados/:id/liberar | Liberar apartado propio aun con licencia bloqueada. |
| POST /publico/negocios/:slug/intentos | Preparar intento vinculado al apartado propio. |
| POST /publico/negocios/:slug/intentos/:id/reservar | Registrar cita pendiente una vez. |
| POST /publico/negocios/:slug/intentos/:id/resolver | Resolver envío incierto propio aun con licencia bloqueada. |

## cinco rutas privadas de disponibilidad conservadas

| Ruta | Permiso conservado |
| --- | --- |
| GET /disponibilidad/configuracion | Solo administrador del negocio. |
| PUT /disponibilidad/configuracion | Solo administrador del negocio. |
| GET /disponibilidad | Administrador, recepción y profesional dentro de su alcance. |
| POST /disponibilidad/validar | Administrador, recepción y profesional dentro de su alcance. |
| GET /disponibilidad/citas-afectadas | Administrador y recepción de su negocio; profesional limitado a sus propias citas. |

Siguen vigentes cookie HttpOnly, origen, CSRF, límite de 32 KiB, filtrado por negocio, permisos privados, cita inicialmente pendiente, folio, resumen histórico y recuperación idempotente. La modificación de visibilidad omite importes solo en respuestas futuras; no retira datos ya entregados al navegador. RF-63 y M3-I001/M2-I004 esperan al escritor manual real.
