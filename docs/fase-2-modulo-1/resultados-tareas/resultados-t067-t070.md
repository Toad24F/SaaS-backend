# Resultado M1-T067–M1-T070 — catálogo de servicios

Fecha: 2026-09-30.

## Qué se realizó

Se agregó un catálogo único por negocio. Cada servicio guarda nombre, costo `DECIMAL(10,2)`, duración entera positiva y estado global. El costo cero es válido; los negativos, más de dos decimales, las duraciones no positivas y los campos reservados se rechazan. La cuenta persistida del administrador determina el negocio: listar, consultar, editar y cambiar estado nunca usan un `negocioId` enviado por el cliente. Desactivar y reactivar conservan la fila y sus datos; el estado global queda separado de las futuras selecciones individuales de profesionales.

Las rutas `POST /servicios`, `GET /servicios`, `GET /servicios/:id`, `PATCH /servicios/:id`, `POST /servicios/:id/desactivar` y `POST /servicios/:id/reactivar` exigen JWT, sesión vigente y rol `admin_negocio`. Una ID de otro negocio responde 404. Los cambios reales se auditan en la misma transacción; repetir una transición no añade otro evento. La respuesta HTTP enumera explícitamente los campos del catálogo. El borrado físico se mantiene para M1-T113.

## Archivos

| Archivo | Qué hace |
| --- | --- |
| `src/servicios/entities/servicio.entity.ts` | Define columnas, relación obligatoria con negocio, índices y restricciones del catálogo global. |
| `src/database/migrations/1760000011000-Servicios.ts` | Crea y revierte la tabla con decimal exacto, duración positiva, estado y pertenencia. |
| `db/schema.sql` | Alinea el diseño de referencia con la migración y la entidad. |
| `src/servicios/dto/servicio.dto.ts` | Valida alta y edición parcial, normaliza el costo decimal y excluye negocio, estado y tarifas particulares. |
| `src/servicios/dto/servicio-id.dto.ts` | Valida la clave primaria recibida en rutas. |
| `src/servicios/servicios.service.ts` | Implementa alta, lectura, edición y transiciones con aislamiento, bloqueos y auditoría transaccional. |
| `src/servicios/servicios.controller.ts` | Expone rutas de administrador y proyecta las respuestas permitidas. |
| `src/servicios/servicios-http.module.ts` | Une controlador, autenticación y dominio sin ciclo de módulos. |
| `src/servicios/servicios.module.ts` | Registra repositorio, permisos, auditoría y servicio de dominio. |
| `src/app.module.ts` | Conecta el módulo HTTP con la aplicación. |
| `src/modulos-fase-2.spec.ts` | Simula el repositorio nuevo en la prueba de composición sin base. |
| `src/servicios/servicios-fase-2.spec.ts` | Comprueba metadatos, DDL y validación decimal sin conexión. |
| `test/servicios-t067-t070.e2e-spec.ts` | Prueba migración, persistencia exacta, rutas, roles, aislamiento, transiciones y auditoría en base temporal. |
| `test/identidad-fase-2.integration-spec.ts`, `test/envios-correo.integration-spec.ts`, `test/instalacion-t61.integration-spec.ts` | Actualizan los conteos esperados de migraciones y el recorrido de reversión por la nueva migración. |
| `docs/fase-2-modulo-1/tareas-modulo-1.md` | Marca T067–T070 terminadas y enlaza esta evidencia. |
| `docs/fase-2-modulo-1/resultados-tareas/resultados-t067-t070.md` | Registra el alcance, función de archivos y resultados de verificación. |

Los comentarios en entidad, migración, DTO, servicio, controlador, módulos y pruebas explican la pertenencia, el decimal, el estado global, las transacciones y el propósito de las pruebas.

## Tests primero y resultado

Se escribió primero la prueba HTTP e integración. Su ejecución inicial quedó bloqueada por `ECONNREFUSED` en la MariaDB configurada (`40.233.1.45:3306`), incluso fuera del entorno restringido. Se utilizó después una base local exclusiva de pruebas con MariaDB 10.4.32; la prueba nueva migró una base temporal, verificó `12345678.91` sin redondeo, restricciones SQL, costo cero, duración, permisos, pertenencia, edición, estado conservador y auditoría sin eventos duplicados. Una aserción inicial interpretaba el `COUNT(*)` devuelto como número cuando el driver lo devuelve como texto; se corrigió la aserción y la prueba enfocada terminó en verde.

| Verificación | Resultado |
| --- | --- |
| `npm test -- --runInBand` | **49 suites, 257/257 pruebas aprobadas.** Incluye 11 pruebas nuevas de DTO, entidad y DDL. |
| `npm run test:e2e -- --runInBand servicios-t067-t070` | **1 suite, 3/3 aprobadas** en MariaDB temporal. |
| `npm run test:e2e -- --runInBand` | **14 suites, 111/111 aprobadas.** Los mensajes `ERROR` son fallos inyectados y esperados por pruebas anteriores. |
| `npm run test:integration -- --runInBand` | **25 suites aprobadas y 5 fallidas; 160/165 pruebas aprobadas.** |
| `npm run build` | Aprobado. |
| `npm run lint` | Aprobado. |

Los cinco fallos de la suite de integración completa son casos de tareas anteriores: transición concurrente de licencia T058, conversión de códigos T021–T024, reversión histórica T013, restricción de bandeja T026 y rechazo de relación inexistente T017. Se reprodujeron en la instancia local MariaDB 10.4.32. Los casos de T067–T070 pasaron; la causa de esos cinco fallos históricos queda pendiente de investigación por separado.
