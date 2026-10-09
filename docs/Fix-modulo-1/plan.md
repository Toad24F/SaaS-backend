# Plan — Ajustes del módulo 1

## Base y alcance

Este plan implementa la [constitución](constitucion.md) y la [especificación del fix](spec-fix.md). Los RF-01 a RF-10 citados aquí pertenecen a `spec-fix.md`; no sustituyen los números homónimos de la fase 2. La API actual ya tiene catálogo global, asignaciones de sucursales, selección general de servicios y validación de horarios. Aún no guarda especialidad, descripción, autor del servicio, estado de atención individual en sucursal ni selección de servicios por sucursal. Las evidencias anteriores no acreditan el fix.

La entrega comprende backend y contrato para el futuro frontend. No incluye cambios visuales, reservas ni cálculo de espacios disponibles. Deben conservarse las reglas compatibles de autenticación, licencias, cupo global, eliminación con historial y auditoría sin secretos.

## Módulos y contratos

| Parte | Cambio previsto | RF |
| --- | --- | --- |
| **Profesionales** | Exigir `especialidad` en altas y en cualquier edición de un perfil anterior que no la tenga; devolverla en las vistas. Mantener la identidad y credenciales en `usuarios`. | RF-01, RF-10 |
| **Servicios** | Admitir `descripcion` opcional en alta, edición y lectura. Permitir `POST /servicios` a Profesional y administrador: el alta del Profesional crea el servicio global, registra su autor y lo selecciona para su perfil en una sola operación. Permitir `PATCH /servicios/:id` al administrador o al Profesional autor; `DELETE` y activación global siguen reservados al administrador. | RF-02–RF-04, RF-08 |
| **Oferta del Profesional** | Conservar `GET/PUT /profesionales/:id/servicios` como selección general de conjunto completo; `seleccionado` expresa el estado individual efectivo de esa selección, sin cambiar el catálogo. Admitir administrador del negocio o Profesional propio. | RF-05, RF-08, RF-10 |
| **Atención en sucursales** | Conservar `GET/PUT /profesionales/:id/sucursales` para las asignaciones que controla el administrador. Añadir operación de activación/desactivación individual de una sucursal asignada para administrador o Profesional propio; no modifica `sucursales.activo` ni el cupo. Al reactivar, revalidar horarios y excepciones antes de confirmar. | RF-06, RF-08–RF-09 |
| **Servicios por sucursal y consulta** | Añadir consulta de oferta del perfil con estados globales, individuales y combinación por sucursal; añadir reemplazo del conjunto de servicios ofrecidos en una sucursal asignada. La oferta efectiva se deriva de los estados actuales, sin guardar un indicador global duplicado. | RF-07–RF-08, RF-10 |
| **Horarios, autorización y auditoría** | Reusar la validación de empalmes y la pertenencia actual, ampliándolas a la reactivación individual. Validar rol, negocio y perfil actual en cada operación; auditar solo transiciones reales y confirmar estado y evento juntos. | RF-03–RF-10 |

### Superficie HTTP nueva y compatibilidad

- `POST /servicios`: mismo cuerpo actual más `descripcion?`; el servidor obtiene el negocio y, si el actor es Profesional, su perfil autor. `PATCH /servicios/:id` admite también `descripcion?` y comprueba autoría cuando el actor es Profesional. Las respuestas de servicio incluyen `descripcion` y autoría identificable sin exponer datos privados. **RF-02–RF-04.**
- `POST /profesionales` y `PATCH /profesionales/:id`: `especialidad` obligatoria en alta; al editar un perfil heredado vacío, también obligatoria. Listado y detalle la devuelven. **RF-01.**
- `PATCH /profesionales/:id/sucursales/:sucursalId/atencion` con `activo: boolean`: cambia solo la atención individual; requiere asignación vigente. **RF-06, RF-09.**
- `GET /profesionales/:id/oferta`: devuelve sucursales asignadas, estados globales e individuales, servicios seleccionados y selección por sucursal, además de la oferta efectiva. `PUT /profesionales/:id/sucursales/:sucursalId/servicios` recibe `servicioIds` como conjunto completo, incluido `[]`. Ambos admiten administrador del negocio o Profesional propio. **RF-07–RF-08, RF-10.**
- Mantener el significado y las rutas globales `POST /sucursales/:id/{desactivar,reactivar}` y `POST /servicios/:id/{desactivar,reactivar}` para el administrador. Los IDs ajenos o inexistentes se tratan como recurso no disponible; rol insuficiente o perfil de otro Profesional se deniega. Entradas inválidas producen error de validación y conflictos de horario o estado producen conflicto, sin cambios parciales. **RF-04–RF-10.**

## Modelo de datos y continuidad

| Dato | Evolución e invariantes | RF |
| --- | --- | --- |
| `personal` | `especialidad` de texto, anulable solo para perfiles heredados; nueva alta y próxima edición exigen valor no vacío. La cuenta sigue en `usuarios`. | RF-01 |
| `servicios` | `descripcion` opcional y `creador_personal_id` anulable. El autor se fija al crear y no se transfiere; `NULL` identifica servicios anteriores o creados por administrador. Autor y servicio pertenecen al mismo `negocio_id`. | RF-02–RF-04 |
| `personal_servicios` | Añadir `activo` individual, inicialmente verdadero en las relaciones existentes. Desmarcar conserva la relación como inactiva para permitir reactivación sin perder configuración; un servicio nunca elegido no tiene relación. | RF-03, RF-05, RF-08 |
| `personal_sucursales` | Añadir `activo` de atención individual, inicialmente verdadero en las asignaciones existentes. Desactivar conserva relación, horarios y selecciones. El estado global de `sucursales` permanece independiente. | RF-06, RF-08–RF-09 |
| Relación servicio–sucursal–Profesional | Nueva relación con `negocio_id`, `personal_id`, `sucursal_id`, `servicio_id` y `activo`, única por combinación. Sus referencias compuestas exigen la asignación del Profesional a la sucursal y su selección general del servicio dentro del mismo negocio. | RF-07–RF-08, RF-10 |

Una migración nueva, sin modificar las históricas, añade los campos y la relación. Para cada selección general ya existente se crean combinaciones activas con **todas** las sucursales asignadas; las globalmente inactivas siguen sin oferta efectiva, pero recuperan su configuración si se reactivan. Un servicio creado por Profesional se asigna únicamente a él y se habilita inicialmente en todas sus sucursales asignadas. Al asignarle después otra sucursal, se habilitan inicialmente allí sus servicios generales activos; el Profesional puede ajustar la combinación. Quitar una asignación sigue las restricciones actuales de horarios y excepciones; si procede, retira sus combinaciones de oferta, pero deja evidencia de auditoría. **RF-03, RF-07–RF-10.**

Una selección general nueva crea combinaciones activas en las sucursales asignadas. Desmarcarla deja sus combinaciones guardadas e ineficaces; volver a seleccionarla recupera los ajustes anteriores. El conjunto enviado para una sucursal debe ser subconjunto de los servicios seleccionados en general por el perfil; no habilita por sí solo un servicio desmarcado o globalmente inactivo. Las selecciones históricas de servicios que se desactivaron globalmente permanecen consultables, sin reactivación implícita. **RF-05, RF-07–RF-08.**

La oferta efectiva requiere simultáneamente cuenta, sucursal y servicio globalmente activos; selección general, atención individual y combinación servicio–sucursal activas. La consulta conserva visibles las preferencias inactivas para explicar el estado. Ninguna de estas preferencias consume o libera cupo de sucursales. **RF-05–RF-08, RF-10.**

## Decisiones y alternativas descartadas

| Decisión justificada | Alternativa descartada y motivo | RF |
| --- | --- | --- |
| Guardar el autor del servicio, aunque sea parte del catálogo compartido: permite edición al creador y al administrador sin conceder permisos globales de activación. | Inferir autor desde auditoría: depende de historial y complica autorización estable. | RF-03–RF-04 |
| Conservar filas de selección y añadir estado individual para las pausas reversibles. El `PUT` general presenta como desmarcadas las filas inactivas. | Borrar la relación al desactivar: pierde la preferencia y las combinaciones por sucursal. | RF-05–RF-08 |
| Guardar explícitamente la combinación servicio–sucursal–Profesional y derivar la oferta efectiva al consultar. | Copiar servicios al catálogo de cada sucursal o guardar un indicador de oferta efectiva: duplicaría costo/estado y se desincronizaría. | RF-07–RF-08, RF-10 |
| Mantener las asignaciones administrativas separadas del interruptor de atención individual. | Permitir al Profesional quitarse de una sucursal: podría romper la pertenencia de horarios y excepciones existentes. | RF-06, RF-09 |
| Recuperar preferencias al reactivar, con validación transaccional del horario vigente. | Reactivar sin comprobar empalmes o borrar la configuración al pausar: admitiría atención imposible o perdería trabajo. | RF-06, RF-08–RF-09 |
| Completar especialidad en la siguiente edición de perfiles heredados y aceptar descripción ausente. | Rellenar valores ficticios o rechazar registros existentes: alteraría datos reales sin información del negocio. | RF-01–RF-02 |
| Reutilizar los servicios de dominio existentes, ampliando permisos por operación y sin crear módulos paralelos. Las operaciones que cruzan catálogo, sucursal y perfil respetan el orden de bloqueos existente y revalidan después de bloquear. | Crear una segunda API de catálogo para Profesionales o confiar solo en validación previa a la transacción: duplicaría reglas y permitiría carreras. | RF-03–RF-10 |

## Estrategia de pruebas y cierre

| Nivel y escenarios | RF |
| --- | --- |
| **Migración y modelo:** instalación desde migraciones históricas, nueva base y base con perfiles/selecciones previos; pertenencia compuesta, ausencia de duplicados, especialidad heredada vacía y combinación inicial en todas las sucursales asignadas. Contrastar entidades, migración y `db/schema.sql`. | RF-01–RF-03, RF-07–RF-08 |
| **HTTP y permisos:** administrador, autor, otro Profesional y recepcionista; dos negocios; alta/edición permitidas y denegadas, IDs ajenos, campos inválidos, descripción opcional, especialidad exigida y secreto ausente en auditoría/respuestas. | RF-01–RF-04, RF-10 |
| **Estados y consulta:** servicio global frente a individual, sucursal global frente a atención individual, cuenta inactiva, selección por sucursal vacía o parcial y posterior reactivación; comprobar que otras personas, catálogo, cupo, horarios e historial se conservan. | RF-05–RF-08, RF-10 |
| **Transacciones y carreras:** solicitudes repetidas u opuestas sobre la misma preferencia; alta de servicio simultánea con selección, cambio global simultáneo con oferta, reactivación individual frente a edición de horario o excepción; un rechazo conserva estado y auditoría previos. | RF-03–RF-09 |
| **Regresión:** selección general existente, asignaciones administrativas, activación global, reactivación global de sucursal y validación de horarios; no atribuir a estas pruebas cobertura de reservas ni del futuro motor de disponibilidad. | RF-05–RF-10 |

Al implementar código, ejecutar `npm run build`, `npm run lint` y las pruebas relevantes, incluidas integración con MariaDB para migración y concurrencia. La entrega queda completa cuando cada RF tenga evidencia nueva, la oferta consultada explique todos sus estados y no haya cruces de negocio, pérdidas de configuración ni eventos duplicados. Este `plan.md` es documental: no acredita ejecución de esas pruebas. **RF-01–RF-10.**
