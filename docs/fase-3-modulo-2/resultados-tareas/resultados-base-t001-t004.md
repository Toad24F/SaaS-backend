# Evidencia de base y preparación — M2-T001–M2-T004

## Alcance y flujo preparado

La aplicación registra `DisponibilidadHttpModule` como límite de las futuras rutas privadas y `DisponibilidadModule` como dominio. Este importa `OcupacionesModule`, punto de entrada de la futura lectura de citas y apartados. En esta base los tres módulos carecen de controladores y proveedores: la persistencia comienza en M2-T005 y la lectura en M2-T039. El flujo previsto es **HTTP autorizado → motor → lectura de oferta, atención y ocupaciones → cálculo → resultado**. Ninguna consulta de esta fase escribe citas o apartados.

`src/disponibilidad/contratos-internos.ts` define cuatro proyecciones para ese flujo: bloque original (preserva anclaje y zona), tramo efectivo (conserva referencia al bloque tras restricciones), ocupación (intervalo de cita o apartado del Profesional) y resultado (combinación, reloj, modalidad, ranuras y omisiones). Son tipos; todavía no calculan ni leen datos.

`src/disponibilidad/ocupaciones.module.ts`, `disponibilidad.module.ts` y `disponibilidad-http.module.ts` declaran la dirección de dependencias. `src/app.module.ts` compone el dominio y el límite HTTP; `src/disponibilidad/base-fase-3.spec.ts` comprueba su registro, la ausencia de rutas/proveedores adelantados y la dirección acíclica de imports. Los comentarios en esos archivos explican el cometido de cada bloque nuevo.

## Matriz de evidencia requerida

Cada RF pertenece a `spec-modulo-2.md`. La columna «evidencia exigida» indica qué debe demostrarse al implementar el motor; **pendiente** no significa fallido. Las suites históricas de módulo 1 registradas abajo son antecedente y no acreditan estos RF. Los grupos T01–T18 son los del `plan.md`.

| RF | Evidencia exigida para fase 3 | Estado |
| --- | --- | --- |
| 01 | Configuración aislada por negocio y escritura solo Administrador; T01–T02 | Pendiente |
| 02 | Valores efectivos iniciales sin escritura; T01 | Pendiente |
| 03 | Seis intervalos admitidos y rechazo de otros; T01 | Pendiente |
| 04 | Anticipación múltiplo de 5, incluido cero; T01, T10 | Pendiente |
| 05 | Horizonte entero, incluido cero y último día local; T01, T10 | Pendiente |
| 06 | Reemplazo inválido íntegramente rechazado; T01, T15 | Pendiente |
| 07 | Cambio comercial afecta nuevas consultas sin modificar citas; T01, T07, T17 | Pendiente |
| 08 | Administrador/Recepción consultan negocio y Profesional solo agenda propia; T02, T11 | Pendiente |
| 09 | Aislamiento entre negocios y referencias ajenas; T02, T11, T15 | Pendiente |
| 10 | Acceso con cuenta/licencia y límite de 48 horas; T03 | Pendiente |
| 11 | Seis estados de oferta y asignación exigidos; T02, T04 | Pendiente |
| 12 | Oferta inactiva excluida en ambas modalidades sin borrar historial; T04, T11 | Pendiente |
| 13 | Semana/excepción, descansos y bloqueos por fecha; T05 | Pendiente |
| 14 | Ninguna ranura atraviesa descanso o bloqueo; T05 | Pendiente |
| 15 | Duración completa y ausencia de ocupación incompatible; T05, T07, T12 | Pendiente |
| 16 | Cabida a través de bloques contiguos del mismo perfil y sucursal; T08 | Pendiente |
| 17 | Inicio/fin exactamente contiguos permitidos; T08 | Pendiente |
| 18 | Zona local de sucursal y colisiones reales en UTC entre sucursales; T06 | Pendiente |
| 19 | Hora ambigua/inexistente rechazada u omisión explicada de recurrencia; T06 | Pendiente |
| 20 | Cita conserva intervalo al cambiar duración del servicio; T07, T14 | Pendiente |
| 21 | Secuencia anclada al comienzo del bloque original; T08–T09 | Pendiente |
| 22 | Ventana Libre ofrece todos los candidatos válidos; T08 | Pendiente |
| 23 | Agenda Compacta inicia grupos independientes por tramo; T09 | Pendiente |
| 24 | Primer candidato válido al avanzar la anticipación; T09–T10 | Pendiente |
| 25 | Candidatos próximos a ambos lados de citas/apartados; T09 | Pendiente |
| 26 | Nuevo grupo cuando no cabe junto a una ocupación; T09 | Pendiente |
| 27 | Otro día elegible sin llenar los anteriores; T09–T10 | Pendiente |
| 28 | Anticipación y horizonte públicos con límites incluidos; T10 | Pendiente |
| 29 | Manual admite cualquier minuto válido sin cuatro restricciones comerciales; T11 | Pendiente |
| 30 | Manual conserva permisos, licencia, oferta y restricciones físicas; T04, T11 | Pendiente |
| 31 | Toda cita no cancelada ocupa, aun en otro servicio/sucursal; T12 | Pendiente |
| 32 | Cancelada libera únicamente su propio intervalo; T12 | Pendiente |
| 33 | Apartado vigente ocupa y referencia Agenda Compacta; T09, T12 | Pendiente |
| 34 | Apartado libera al vencimiento exacto o liberación; T12 | Pendiente |
| 35 | Contrato de revalidación interna; confirmación real con escritor de módulos 3/4; T13, T18 | Integración real pendiente |
| 36 | Propiedad/exclusión del apartado propio; confirmación real con escritor de módulos 3/4; T13, T18 | Integración real pendiente |
| 37 | Una sola confirmación ante carreras en escritores reales de módulos 3/4; T18 | Integración real pendiente |
| 38 | Cambio operativo identifica citas afectadas sin alterarlas; T14 | Pendiente |
| 39 | Desactivación identifica citas futuras e impide nuevas reservas; T14 | Pendiente |
| 40 | Consulta de afectaciones con permisos y sin canceladas; T02, T14 | Pendiente |
| 41 | Causas desaparecen/reaparecen según restricciones vigentes; T14 | Pendiente |
| 42 | Ranuras con inicio, fin y zona de la combinación; T15 | Pendiente |
| 43 | Agenda vacía legítima distinguible de fallo; T10, T15 | Pendiente |
| 44 | Error de comprobación sin ranuras parciales y con reintento; T15 | Pendiente |
| 45 | Entrada inválida rechazada sin revelar datos ajenos; T02, T15 | Pendiente |

## Regresión y contratos actuales

M2-T002: se ejecutaron las suites unitarias existentes de oferta (`modelo-oferta-fix.spec.ts`), calendario (`calendario.spec.ts`, `calendario-t095.spec.ts`, `horarios-fase-2.spec.ts`) y bloqueos (`calculo-bloqueos.spec.ts`, `validar-bloqueo.spec.ts`) junto con la prueba nueva de composición: **7 suites, 42 pruebas aprobadas**. Verifican modelos y utilidades anteriores; no calculan ranuras del módulo 2.

M2-T003: las suites HTTP `fix-modulo-1-t024-t029.e2e-spec.ts`, `horarios-t093-t095.e2e-spec.ts` y `bloqueos-t106-t110.e2e-spec.ts` finalizaron con **3 suites, 8 pruebas aprobadas**. La suite adicional `fix-modulo-1-t030-t034.e2e-spec.ts` aprobó **2 pruebas** de oferta efectiva y permisos. Los contratos que debe conservar la fase 3 son:

- `GET /profesionales/:id/sucursales/:sucursalId/atencion` devuelve `{ sucursalId, activo }`; su `PUT` deniega a Recepción (403), Profesional ajeno (403), administrador de otro negocio y sucursal ajena/no asignada (404).
- `GET /profesionales/:id/sucursales/:sucursalId/servicios` devuelve `{ sucursalId, servicioIds }`; `PUT` con `[]` retira la oferta solo en esa sucursal y la repetición del mismo conjunto no añade auditoría. Recepción sigue sin facultad de gestión (403).
- `GET /profesionales/:id/oferta` devuelve los estados fuente y el resultado `ofrecido` con motivos de exclusión por combinación; el Profesional propio puede leer, otro Profesional y Recepción reciben 403, y un administrador ajeno recibe 404.
- `GET /profesionales/:id/horario` devuelve las franjas guardadas al administrador o Profesional propio; Recepción no puede editarlas (403), otro Profesional recibe 403 y el administrador ajeno 404. Las excepciones admiten un día cerrado con `franjas: []`.
- `GET /profesionales/:id/atencion` devuelve `intervalos` y `omisiones`, no `ranuras`; una recurrencia inválida aparece en omisiones, una sucursal inactiva queda fuera y un rango invertido obtiene 400. `GET /bloqueos` conserva la lectura autorizada y las mutaciones de Recepción se deniegan.

La nueva consulta de disponibilidad necesitará permisos de lectura específicos para Recepción; no se deben ampliar sus permisos sobre las rutas de gestión anteriores. Las pruebas HTTP históricas acreditan esos contratos previos, no el acceso de Recepción a una ruta nueva.

## Ejecución y límites

La primera ejecución de la prueba de M2-T004 falló porque los módulos aún no existían, como se esperaba al escribir la prueba primero. La primera ejecución en sandbox tampoco pudo iniciar Jest por `EPERM` sobre su directorio temporal; la repetición fuera del sandbox produjo ese fallo esperado. Tras implementar los módulos, la prueba pasó. Una ejecución intermedia detectó que importar `AppModule` exigía el entorno de test; se añadió `test/setup-env.ts` a la prueba y la repetición pasó.

Quedan para las tareas siguientes los proveedores reales, persistencia, controladores y pruebas de comportamiento del motor. RF-35–RF-37 mantienen su verificación de integración real en los módulos 3/4.

Verificación final de esta revisión: `npm test -- --runInBand` **58 suites/306 pruebas aprobadas**; `npm run build` y `npm run lint` terminaron sin errores. `git diff --check` no señaló problemas de formato. No se ejecutaron las suites completas de integración/e2e porque esta sección no modifica persistencia ni comportamiento HTTP; los cuatro grupos HTTP citados verifican los contratos afectados.
