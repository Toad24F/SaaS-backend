# Resultado M1-T062–M1-T066 — gestión inicial de sucursales y cupo

Fecha: 2026-09-30. Implementación limitada al alta, cambio de cupo, consulta, edición, desactivación, contratos HTTP y carreras. La reactivación con comprobación de horarios queda en su tarea posterior.

## Flujo del dominio

1. La ruta de administrador autentica la sesión y obtiene el ID del actor. El servicio vuelve a consultar al usuario activo y su rol; deriva el negocio de la cuenta persistida. Ni el cuerpo ni la ruta pueden asignar negocio o estado a una sucursal.
2. Para crear, se bloquea la fila de `negocios` con escritura y se cuentan exclusivamente sus `sucursales.activo = true` dentro de la misma transacción. Si el conteo alcanza el límite, responde 409 sin insertar ni auditar. Si hay lugar, guarda la sucursal activa y su auditoría en el mismo commit.
3. El superadmin puede consultar y modificar el límite mediante rutas de negocio. El servicio verifica su rol persistido, bloquea la misma fila de negocio y cuenta activas. Acepta enteros de 1 a 4294967295. Una reducción bajo el conteo devuelve 409 e indica que se desactiven las excedentes. Un valor repetido no genera otra auditoría.
4. Listar y consultar usan `negocioId` del actor. Editar y desactivar vuelven a comprobar pertenencia y bloquean negocio y sucursal en ese orden. La edición parcial valida los campos; los obligatorios no admiten `null` y los opcionales sí pueden limpiarse. Desactivar mantiene la fila y sus datos, la excluye del cupo y solo audita el primer cambio. Una sucursal ajena responde 404.
5. Las rutas HTTP aplican JWT, estado actual de sesión/licencia y rol; proyectan explícitamente los campos permitidos. La reactivación no se expone hasta que pueda revisar conflictos de horarios.

| Ruta | Rol | Resultado |
| --- | --- | --- |
| `POST /sucursales` | Administrador | 201, sucursal activa propia; 409 si no hay cupo. |
| `GET /sucursales`, `GET /sucursales/:id` | Administrador | Sucursales propias, incluidas las inactivas; una ajena responde 404. |
| `PATCH /sucursales/:id` | Administrador | Edita solo campos suministrados y conserva pertenencia/estado. |
| `POST /sucursales/:id/desactivar` | Administrador | 204, idempotente; conserva la fila. |
| `GET /sucursales/cupo` | Administrador | Límite, activas y disponibles del negocio propio. |
| `GET /negocios/:id/cupo-sucursales` | Superadmin | Los mismos datos para el negocio indicado. |
| `PATCH /negocios/:id/limite-sucursales` | Superadmin | Recibe `{ "limiteSucursales": 2 }`; 409 si la reducción excede activas. |

## Concurrencia y rollback

Las pruebas usan dos conexiones MariaDB. Dos altas para la última plaza permiten una sola inserción y un solo evento; la otra devuelve conflicto. Alta y reducción simultáneas usan el mismo bloqueo del negocio y terminan con `activas <= límite`, cualquiera que gane. Los conflictos de lectura o deadlock transitorios reintentan la transacción completa con la utilidad compartida. Un fallo inyectado en auditoría revierte el alta sin dejar sucursal parcial.

## Archivos

| Archivo | Qué hace |
| --- | --- |
| `src/sucursales/sucursales.service.ts` | Nuevo servicio de dominio: permisos actuales, pertenencia, cupo, CRUD inicial, transacciones y auditoría. |
| `src/sucursales/sucursales.controller.ts` | Nuevas rutas HTTP del administrador para crear, consultar, editar, desactivar y ver cupo; respuestas por lista permitida. |
| `src/sucursales/sucursales-http.module.ts` | Compone controlador de sucursales con autenticación y servicio de dominio sin ciclo de módulos. |
| `src/sucursales/sucursales.module.ts` | Registra el servicio, autorización y auditoría junto al repositorio de sucursales. |
| `src/sucursales/dto/sucursal.dto.ts` | Añade edición parcial con validación por campo; conserva los validadores del alta. |
| `src/sucursales/dto/sucursal-id.dto.ts` | Nuevo DTO que valida IDs positivos dentro del rango SQL. |
| `src/negocios/dto/negocios-http.dto.ts` | Añade DTO de límite entero positivo y máximo SQL. |
| `src/negocios/negocios.controller.ts` | Añade consulta/cambio de cupo solo para superadmin. |
| `src/negocios/negocios-http.module.ts` | Da acceso al servicio de sucursales desde las rutas de negocio. |
| `src/app.module.ts` | Registra el nuevo módulo HTTP. |
| `src/modulos-fase-2.spec.ts` | Simula el repositorio de auditoría en la prueba de composición sin base. |
| `test/sucursales-t062-t066.integration-spec.ts` | Prueba cupo, permisos, pertenencia, cambios reales, rollback y carreras con dos conexiones. |
| `test/sucursales-t065.e2e-spec.ts` | Prueba el recorrido HTTP, roles, DTO, aislamiento y respuestas. |
| `docs/fase-2-modulo-1/tareas-modulo-1.md` | Marca T062–T066 como hechas y enlaza esta evidencia al finalizar las verificaciones. |
| `docs/fase-2-modulo-1/resultados-tareas/resultados-t062-t066.md` | Este documento describe flujo, cambios, pruebas y resultados. |

Los comentarios agregados al servicio, controlador, módulos, DTO y pruebas explican bloqueo y orden, campos del servidor, desactivación conservadora, contrato HTTP y el motivo de las fixtures.

## Tests primero y resultado

Se escribieron primero las pruebas de integración y HTTP. La prueba de integración quedó roja por faltar el servicio; la HTTP devolvió 404 porque las rutas aún no existían. Tras implementar, las enfocadas pasaron con **5/5** de integración y **3/3** HTTP. La primera pasada detectó una lectura con bloqueo fuera de transacción y una edición parcial que asignaba `null` a campos omitidos; se corrigieron y verificaron. La suite unitaria detectó que su fixture de composición debía simular el repositorio de auditoría importado por el nuevo módulo.

| Verificación | Resultado |
| --- | --- |
| Pruebas enfocadas de integración | 5/5 aprobadas en MariaDB desechable. |
| Pruebas enfocadas HTTP | 3/3 aprobadas con JWT, guards y validación reales. |
| `npm test -- --runInBand` | 48 suites; 246/246 pruebas aprobadas. |
| `npm run test:integration -- --runInBand` | 30 suites; 165/165 pruebas aprobadas. |
| `npm run test:e2e -- --runInBand` | 13 suites; 108/108 pruebas aprobadas. |
| `npm run build` | Aprobado. |
| `npm run lint` | Aprobado. |

Las tres suites completas suman **519 pruebas aprobadas**. Las líneas `ERROR` que aparecen durante algunas pruebas HTTP corresponden a fallos controlados inyectados para verificar el manejo de errores; Jest terminó con código 0 y todas las pruebas aprobadas. La ejecución usa una base MariaDB temporal migrada y datos de prueba desechables, sin envío de correos reales.
