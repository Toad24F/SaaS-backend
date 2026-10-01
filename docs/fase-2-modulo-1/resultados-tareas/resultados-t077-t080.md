# Resultados M1-T077–M1-T080 — selección y oferta de servicios

Fecha: 2026-10-01. Alcance: consulta y guardado de los servicios que ofrece cada Profesional, oferta efectiva por sucursal y rutas HTTP de selección. La creación de citas queda para el módulo de reservas.

## Flujo

1. `GET /profesionales/:id/servicios` autentica al administrador del negocio o al propio Profesional. El servicio vuelve a consultar la cuenta y comprueba negocio y propiedad del perfil. Devuelve opciones activas del catálogo con `seleccionado`; también devuelve las selecciones guardadas que fueron desactivadas globalmente, indicando `activo: false`.
2. `PUT /profesionales/:id/servicios` recibe `{ "servicioIds": [...] }` como conjunto completo. Valida IDs positivos y únicos, bloquea el perfil y comprueba la pertenencia de todos los servicios. Una selección nueva de un servicio inactivo devuelve 409; mantener una selección histórica inactiva es válido. Una lista vacía retira todas las relaciones.
3. El guardado compara el conjunto anterior con el nuevo, inserta y quita únicamente las relaciones cambiadas y audita el cambio real en la misma transacción. No toca cuenta, catálogo, sucursales ni horarios. El bloqueo del perfil ordena guardados simultáneos del mismo Profesional.
4. `ofertaSucursal` deriva la oferta desde las relaciones actuales: exige sucursal activa, asignación del Profesional, cuenta activa, selección y servicio globalmente activo. Retorna cero servicios cuando falta cualquiera de esas condiciones. El método queda disponible para la futura integración de reservas, sin afirmar aquí que ya se rechacen citas reales.

## Archivos

| Archivo | Qué hace |
| --- | --- |
| `src/profesionales/dto/profesionales.dto.ts` | Añade el DTO del conjunto completo de IDs de servicio; valida unicidad, tipo y rango, incluido `[]`. |
| `src/profesionales/profesionales.service.ts` | Añade consulta de opciones, reemplazo transaccional de selecciones con permisos y auditoría, y cálculo de oferta por sucursal. |
| `src/profesionales/profesionales.controller.ts` | Expone GET y PUT de servicios para administrador y Profesional propio; mantiene las asignaciones de sucursal en rutas separadas. |
| `test/profesionales-t077-t080.e2e-spec.ts` | Prueba HTTP, JWT, permisos, persistencia, cambios de estado y oferta con MariaDB temporal migrada. |
| `test/codigos-fase-2.integration-spec.ts` | Actualiza la preparación de una prueba histórica para retroceder hasta la migración previa a códigos derivados, sin asumir una cantidad fija de migraciones posteriores. |
| `docs/fase-2-modulo-1/tareas-modulo-1.md` | Marca T077–T080 y enlaza estos resultados. |
| `docs/fase-2-modulo-1/resultados-tareas/resultados-t077-t080.md` | Explica el flujo, archivos y evidencia de pruebas. |

Los comentarios añadidos al DTO, rutas, servicio y pruebas explican por qué la lista es un conjunto completo, por qué se conservan selecciones históricas y cómo se deriva la oferta.

## Tests primero y verificaciones

Se escribieron primero tres casos de extremo a extremo. La primera ejecución quedó roja: **3/3 fallaron con HTTP 404**, pues las rutas todavía no existían. Después de implementar, la ejecución enfocada pasó **3/3**. Los casos comprueban opciones activas e inactivas seleccionadas; selección múltiple, desmarcado y lista vacía; ausencia de cambios en catálogo, sucursales y otro perfil; oferta ante desactivación de servicio, Profesional y sucursal; permisos de administrador y Profesional propio; rechazo de perfil o servicio ajeno, nueva selección inactiva y DTO inválido.

La primera ejecución completa de integración reveló **1 fallo anterior no relacionado**: la prueba de conversión de códigos de fase 1 deshacía cuatro migraciones por una cuenta fija. Con migraciones nuevas, seguía instalado `chk_codigos_derivacion` y el dato histórico de la prueba era rechazado. El ajuste vuelve al punto previo correcto por nombre de migración. Su suite enfocada pasó **4/4** al repetirla.

| Verificación | Resultado |
| --- | --- |
| `npm test -- --runInBand` | 49 suites, **257/257** pruebas aprobadas. |
| `npm run test:integration -- --runInBand` | 30 suites, **165/165** pruebas aprobadas, tras corregir la preparación histórica. |
| `npm run test:e2e -- --runInBand` | 16 suites, **118/118** pruebas aprobadas. |
| `npm run build` | Aprobado. |
| `npm run lint` | Aprobado. |

Las tres suites completas suman **540 pruebas aprobadas**. Algunas pruebas HTTP anteriores imprimen líneas `ERROR` por fallos inyectados deliberadamente para comprobar rollback; Jest terminó con código 0. Las pruebas usan bases MariaDB temporales y no envían correos reales.
