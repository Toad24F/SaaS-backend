# Plan — Fase 3, módulo 2: Motor Inteligente de Disponibilidad y Reglas de Agenda

## 1. Base, alcance y estado actual

Este plan desarrolla la [constitución](constitucion-fase-3.md) y la [especificación del módulo 2](spec-modulo-2.md). Todos los RF citados pertenecen a esta última; no se equiparan con los números de fases anteriores. Conserva los acuerdos compatibles del [módulo 1](../fase-2-modulo-1/spec-modulo-1.md), la precedencia del [fix](../Fix-modulo-1/spec-fix.md) y su [contrato implementado](../Fix-modulo-1/contrato-implementado.md).

La entrega prevista comprende backend, persistencia mínima de las fuentes de ocupación, cálculo, consulta privada y contratos para integrar reservas. Mantiene NestJS, TypeScript, TypeORM y MariaDB/MySQL, con lógica de dominio en servicios. Las pantallas, la consulta anónima, los flujos de reserva, la gestión de estados de citas, WhatsApp y PDF permanecen en sus módulos correspondientes. Este documento no acredita implementación ni pruebas ejecutadas.

### Hechos verificados en el repositorio

- `src/horarios/atencion.service.ts` proyecta atención por fechas y descuenta descansos y bloqueos. Devuelve tramos resultantes, pero no conserva el identificador ni el inicio original de cada franja; necesita una proyección interna más rica para RF-21. Su ruta actual debe conservar el contrato existente.
- La oferta efectiva del fix ya combina los seis estados requeridos. Su consulta y la de bloqueos autorizan a administrador y Profesional propio; reutilizarlas directamente con un recepcionista produciría una denegación. El acceso de recepción debe incorporarse para la nueva consulta sin conceder gestión de horarios o catálogos.
- `personal.id` comparte identidad con `usuarios.id`; la cuenta y su estado pertenecen a `usuarios`. Ya existen zonas IANA por sucursal, excepciones por fecha, reloj inyectable, política de licencia y orden de bloqueos.
- [El esquema SQL](../../db/schema.sql) contiene diseños anteriores de `clientes`, `citas` y `bloqueos_temporales`, pero las migraciones y entidades actuales no los instalan. Las citas usan fecha y horas locales; los apartados carecen de sucursal y servicio y guardan un token utilizable. Esos diseños no acreditan reservas implementadas ni son una fuente lista para el motor.
- El [manifiesto](../../package.json) y `src/` están en la raíz de este repositorio; los comandos se ejecutarán allí, aunque antecedentes mencionen una subcarpeta `backend/`.

## 2. Módulos y responsabilidades

| Parte | Responsabilidad y cambios previstos | RF cubiertos |
| --- | --- | --- |
| M01 — Configuración de agenda | Incorporar un servicio de configuración por negocio: lectura con valores iniciales, reemplazo completo autorizado, validación y auditoría de cambios reales. | RF-01–RF-07 |
| M02 — Acceso y oferta efectiva | Incorporar permisos de consulta y validación manual para administrador, recepción y Profesional propio. Resolver negocio desde el actor actual; reutilizar licencia y seis estados de oferta mediante lecturas internas compartidas. | RF-08–RF-12, RF-29–RF-30, RF-40, RF-45 |
| M03 — Proyección de atención | Extraer un cálculo reutilizable que conserve bloques originales, zona, anclajes, tramos y omisiones. Aplicar semana o excepción, descansos y unión de bloqueos; permitir continuidad entre bloques sin perder su identidad. | RF-13–RF-19, RF-21, RF-23 |
| M04 — Fuentes de ocupación | Incorporar entidades y lectura de citas y apartados, con intervalos UTC, pertenencia, vigencia y duración de la cita conservada. Consultar la ocupación del Profesional en todas sus sucursales y servicios. | RF-09, RF-15, RF-18, RF-20, RF-31–RF-34 |
| M05 — Motor de disponibilidad | Calcular candidatos, Ventana Libre, Agenda Compacta y restricciones públicas. Validar un inicio manual usando la misma disponibilidad física. Inyectar el reloj y mantener el cálculo determinista. | RF-15–RF-30, RF-31–RF-34, RF-42–RF-44 |
| M06 — Citas afectadas | Calcular causas vigentes por cita y exponer consulta autorizada; identificar efectos de horarios, bloqueos y desactivaciones conservando estado, inicio y fin. | RF-20, RF-38–RF-41 |
| M07 — Superficie HTTP privada | Publicar configuración, ranuras, validación manual y citas afectadas; validar entradas y diferenciar ausencia de espacios, denegación, datos inválidos y fallo técnico. | RF-01, RF-06, RF-08–RF-12, RF-28–RF-30, RF-40, RF-42–RF-45 |
| M08 — Contrato de confirmación futura | Preparar la validación con contexto transaccional, propiedad de apartado y reglas de exclusión entre escritores. Su conexión con el alta y confirmación de reservas pertenece a los módulos 3 y 4. | RF-10–RF-12, RF-15, RF-20, RF-30–RF-37 |

M01 y M05–M06 pertenecerán a `DisponibilidadModule`; M07 se expondrá desde `DisponibilidadHttpModule`, siguiendo la separación existente entre dominio y HTTP. M04 será un módulo de lectura de ocupaciones, sin rutas para crear citas, clientes o apartados. M02 y M03 ampliarán servicios existentes o extraerán colaboradores compartidos; no crearán copias de sus reglas.

## 3. Modelo de datos y migraciones

### Persistencia mínima

| Dato | Modelo previsto, restricciones y relaciones | RF |
| --- | --- | --- |
| `configuracion_agenda` | Una fila por `negocio_id`, que será clave primaria y referencia a `negocios`. Campos `modo`, `intervalo_minutos`, `anticipacion_minutos`, `dias_futuros` y marcas de creación/actualización. Valores iniciales: `ventana_libre`, 15, 15 y 60. Modo cerrado; intervalo en 5/10/15/20/30/60; anticipación entera no negativa múltiplo de 5; días enteros no negativos. | RF-01–RF-07 |
| `clientes` | Incorporar únicamente la base referencial ya prevista: ID, negocio, nombre completo, teléfono y datos opcionales existentes. Clave única `(negocio_id, id)` para referencias compuestas y unicidad del teléfono dentro del negocio. No incluir gestión ni consulta de clientes en esta fase. | Soporte de RF-09, RF-31, RF-38–RF-40 |
| `citas` | Mantener identidad, negocio, sucursal, Profesional, servicio, cliente, estado, folio, origen y notas previstos. Usar `inicio_utc` y `fin_utc` como instantes canónicos, con precisión de milisegundos, y conservar `zona_horaria_reserva`. Exigir fin posterior al inicio. El intervalo guardado conserva la duración aceptada; no se recalcula con el catálogo. Estados: pendiente, confirmada, completada, cancelada y no_asistio. | RF-09, RF-15–RF-20, RF-31–RF-32, RF-38–RF-41 |
| `bloqueos_temporales` | Conservar el nombre para los apartados y distinguirlos de `bloqueos_horario`. Incorporar negocio, Profesional, sucursal, servicio, `inicio_utc`, `fin_utc`, `expira_en`, `liberado_en` anulable y `titular_hash`. Exigir intervalos positivos. Vigente significa no liberado y `ahora < expira_en`; no requiere borrado. El hash permite que el futuro módulo 3 compruebe propiedad sin guardar el token utilizable. | RF-09, RF-15, RF-18, RF-33–RF-36 |
| Relaciones de oferta y horarios | Reutilizar `usuarios`, `personal`, `sucursales`, `servicios`, sus selecciones/asignaciones, horarios, excepciones y bloqueos. No añadir otra bandera persistida de oferta ni copiar duraciones por Profesional o sucursal. | RF-08–RF-21, RF-38–RF-41 |
| Citas afectadas | Resultado derivado: cita, Profesional, sucursal, servicio, intervalo y conjunto de causas con referencias a los bloqueos que apliquen. No añadir un estado de cita ni una tabla de notificaciones. | RF-38–RF-41 |
| Auditoría | Usar la infraestructura existente para cambios reales de configuración, con actor, negocio y valores anteriores/nuevos; confirmar dato y evento juntos. No registrar consultas como cambios ni incluir tokens o datos de contacto en esa auditoría. | RF-01, RF-06–RF-07; constitución y reglas generales |

Las tablas nuevas tendrán `negocio_id` obligatorio. Las referencias desde citas y apartados a recursos operativos serán compuestas por negocio e ID, con índices únicos correspondientes en las tablas destino. Se referenciarán las identidades duraderas, no las filas de preferencias: desactivar o retirar una selección no debe borrar una cita. El backend validará además asignación y oferta efectiva al reservar. Las bajas físicas con citas o apartados relacionados deberán rechazarse mediante las claves y la política de eliminación existente; la desactivación continuará disponible. **RF-09, RF-11–RF-12, RF-20, RF-31–RF-41.**

Índices previstos: citas por `(negocio_id, personal_id, inicio_utc)` y por `(negocio_id, sucursal_id, inicio_utc)`; apartados por `(negocio_id, personal_id, inicio_utc)` y `(negocio_id, personal_id, expira_en)`. Completar los índices necesarios para las referencias compuestas. Las consultas de colisión incluirán el fin del intervalo y el estado o vigencia. Ningún índice único sobre la hora inicial se considerará garantía contra intervalos que se solapan. **RF-15, RF-18, RF-31–RF-37, RF-40.**

### Proyecciones internas

| Proyección | Información necesaria | RF |
| --- | --- | --- |
| Bloque original | Origen semanal o excepción, identidad, fecha local, sucursal, zona, inicio y fin originales y anclaje de la secuencia. | RF-13, RF-18–RF-19, RF-21, RF-23 |
| Tramo efectivo | Intervalo restante después de descansos/bloqueos y referencia a su bloque original. La unión de atención continua se utiliza para comprobar cabida, conservando los anclajes individuales. | RF-14–RF-17, RF-21–RF-26 |
| Ocupación | Tipo cita/apartado, ID, negocio, Profesional, sucursal, servicio, inicio y fin canónicos; estado o expiración según su tipo. | RF-15, RF-18, RF-20, RF-25, RF-31–RF-36 |
| Resultado de disponibilidad | Combinación solicitada, fechas, zona, instante de cálculo, modalidad y reglas aplicadas, ranuras ordenadas sin duplicados, omisiones horarias y motivos de ausencia aplicables. No incluir clientes ni titulares de apartados. | RF-09, RF-19, RF-42–RF-45 |

### Secuencia de migración y compatibilidad

1. Añadir migraciones posteriores a las del fix para configuración, base referencial de clientes y fuentes de ocupación. Incorporar entidades equivalentes y actualizar las secciones correspondientes de `db/schema.sql`; no ejecutar el DDL de instalación sobre una base existente. **RF-01–RF-07, RF-09, RF-18, RF-20, RF-31–RF-36.**
2. Para negocios sin fila de configuración, devolver los valores iniciales sin escribir durante una consulta. El primer reemplazo bloqueará la fila de negocio y creará la configuración; los posteriores usarán el mismo orden. Así se cubren negocios existentes y nuevos sin una carrera de inicialización. **RF-01–RF-07.**
3. Conservar los diseños de folio, estado y origen necesarios para módulos posteriores, sin añadir sus rutas. Sustituir en el esquema de instalación el diseño horario local y `session_token` por el modelo canónico descrito. Las otras tablas todavía no migradas no se declararán implementadas por esta entrega. **RF-18, RF-20, RF-31–RF-36.**
4. El destino sigue siendo una instalación nueva desde migraciones. Si aparecen tablas antiguas de citas/apartados ya instaladas, detener esa actualización y diagnosticar: no asumir su zona, sobrescribirlas ni convertir datos reales con esta migración. La conversión de una instalación antigua requiere trabajo específico. **RF-09, RF-18–RF-20, RF-31–RF-36.**
5. Contrastar instalación desde migraciones y desde el esquema SQL para las tablas de esta fase, incluyendo tipos, precisión temporal, restricciones e índices. Mantener desactivadas la sincronización automática y la ejecución implícita de migraciones al arrancar. **RF-01–RF-07, RF-09, RF-18, RF-31–RF-36.**

## 4. Flujo de cálculo y reglas de implementación

### Contexto, fechas y ocupaciones

1. Autenticar, resolver actor/negocio actuales y autorizar el perfil consultado. No aceptar `negocio_id` del cliente. Reutilizar la política de licencia vigente, sin implementar un segundo cómputo de las 48 horas. Un modo de consulta `publica` sigue siendo privado en esta fase. **RF-08–RF-12, RF-28–RF-30.**
2. Capturar un único instante del reloj para la consulta y leer configuración, oferta, horarios y ocupaciones en una transacción de lectura coherente. Los colaboradores recibirán el mismo contexto de lectura; no abrirán transacciones independientes ni recurrirán a repositorios fuera de ella. Las rutas de gestión actuales conservarán sus permisos. **RF-07, RF-10–RF-15, RF-31–RF-34, RF-42–RF-44.**
3. Interpretar las fechas según la zona de la sucursal. Un horario especial reemplaza las franjas semanales de esa fecha y sucursal, incluida una excepción vacía. Conservar las omisiones de recurrencias por horas inexistentes/repetidas y los bloqueos locales de días completos. **RF-13–RF-14, RF-18–RF-19.**
4. Usar intervalos con inicio incluido y fin excluido. Dos intervalos colisionan cuando cada uno comienza antes de que termine el otro. Unir atención consecutiva de la misma sucursal para comprobar que cabe toda la cita; conservar los bloques originales para generar inicios. **RF-15–RF-17, RF-21.**
5. Leer citas no canceladas y apartados vigentes del Profesional en cualquier sucursal y servicio, incluyendo ocupaciones que comiencen fuera del rango consultado pero lo atraviesen. Comparar en UTC; nunca descartar una colisión por tener otra fecha local. No recalcular el fin de una cita a partir de la duración actual del servicio. **RF-15, RF-18, RF-20, RF-31–RF-34.**

### Generación de ranuras

- Construir la secuencia de cada bloque desde su inicio original. Descontar restricciones no crea una secuencia nueva; un descanso que termine a las 10:07 mantiene el próximo inicio a las 10:15 si el anclaje era 09:00 y el intervalo 15. Desduplicar los inicios compartidos por bloques. **RF-21–RF-22.**
- Para reglas públicas, filtrar por inicio igual o posterior a `ahora + anticipación` y por fechas locales desde hoy hasta hoy más los días configurados, inclusive. Si la anticipación deja todo el horizonte sin candidatos, devolver disponibilidad vacía; no corregir silenciosamente la configuración. **RF-04–RF-05, RF-24, RF-28, RF-43.**
- Ventana Libre devuelve todos los candidatos válidos. En Agenda Compacta, cada bloque/tramo independiente puede ofrecer su primer candidato si no tiene ocupaciones de referencia; las citas que cruzan bloques conservan sus extremos reales como referencia, sin inventar una cita que termine en el corte entre bloques. **RF-16, RF-22–RF-24.**
- Para cada ocupación de referencia, buscar antes el inicio de la secuencia más cercano que permita terminar antes o justo al comenzar esa ocupación; después, el inicio más cercano igual o posterior a su fin. Admitir solamente el hueco del ajuste a la secuencia; validar de nuevo cabida y todas las demás ocupaciones. Los apartados vigentes cuentan igual que las citas a estos efectos. **RF-15, RF-17, RF-21, RF-25, RF-33.**
- Si el tramo no ofrece ningún candidato de proximidad válido pero tiene espacio, ofrecer el primer candidato restante para iniciar otro grupo. Los descansos o bloqueos que separan tramos no crean dependencia entre ellos. El cálculo de un día no exige llenar otro. **RF-23–RF-27.**
- En modo manual, generar inicios por minuto dentro de la atención válida y permitir validar directamente una fecha/hora. Omitir modo comercial, intervalo público, anticipación y horizonte; conservar todas las restricciones físicas, de oferta y acceso, y exigir inicio no anterior al instante actual. **RF-29–RF-30.**

### Identificación de citas afectadas

Calcular las causas en una consulta independiente después de los cambios confirmados; no alterar las respuestas de las rutas actuales de guardado. Mantener el rechazo de horarios mal formados o empalmados entre sucursales: permitir citas afectadas no autoriza horarios inválidos. **RF-38–RF-41.**

Evaluar cada cita no cancelada con su intervalo guardado contra la atención y oferta actuales. Las causas incluirán horario insuficiente, descanso, cada bloqueo aplicable, sucursal/cuenta/servicio inactivo, atención individual inactiva, selección retirada o ausencia de asignación. Las desactivaciones se aplican a citas futuras; los efectos de horarios y bloqueos se consultan en el rango solicitado. La consulta debe poder evaluar registros inactivos para explicar la afectación, sin reutilizar un filtro que los descarte por completo. **RF-20, RF-38–RF-40.**

No señalar una cita por cambios de anticipación, horizonte, intervalo, estrategia o duración actual del catálogo. Al retirar una causa, recalcular las restantes; no convertir la cita en cancelada, no liberar su ocupación y no enviar mensajes. Devolver solo IDs operativos, intervalo y causas; los contactos y el envío serán responsabilidad de la integración posterior. **RF-07, RF-20, RF-31–RF-32, RF-38–RF-41.**

## 5. Contratos HTTP y confirmación posterior

### Rutas privadas propuestas

| Ruta | Entrada y resultado | Acceso | RF |
| --- | --- | --- | --- |
| `GET /disponibilidad/configuracion` | Devuelve modo, intervalo, anticipación y días futuros efectivos. Leer sin configuración persistida devuelve valores iniciales. | Administrador; los otros roles reciben las reglas aplicadas en sus consultas autorizadas. | RF-01–RF-05 |
| `PUT /disponibilidad/configuracion` | Recibe los cuatro valores como conjunto completo; confirma todo o nada y devuelve la configuración resultante. Repetir el mismo conjunto no duplica auditoría. | Administrador del negocio. | RF-01–RF-07 |
| `GET /disponibilidad` | `personalId`, `sucursalId`, `servicioId`, `desde`, `hasta` y `modalidad` pública/manual; pública por defecto. Devuelve combinación, zona, instante de cálculo, reglas aplicadas, ranuras y omisiones. | Administrador y recepción del negocio; Profesional propio. | RF-08–RF-34, RF-42–RF-45 |
| `POST /disponibilidad/validar` | Mismos IDs, fecha local, hora de inicio y modalidad. Devuelve si ese inicio cabe, su fin y las causas de rechazo funcional; no crea una cita ni un apartado. Un inicio público debe estar entre los ofrecidos por su estrategia vigente. | Mismos permisos de consulta; la modalidad manual nunca es anónima. | RF-08–RF-30, RF-31–RF-35, RF-42–RF-45 |
| `GET /disponibilidad/citas-afectadas` | Rango de fechas y filtros opcionales de Profesional/sucursal. Devuelve citas no canceladas y causas vigentes. Las fechas se interpretan por sucursal, también cuando se consultan varias. | Administrador y recepción del negocio; Profesional limitado a sí mismo. | RF-09, RF-20, RF-38–RF-41, RF-44–RF-45 |

Usar camelCase en las entradas/salidas y snake_case en SQL. El rango de cada consulta se limitará a 31 fechas locales inclusivas como tamaño de petición; los clientes podrán consultar ventanas sucesivas. Este límite técnico no reduce el horizonte comercial del negocio ni impone anticipación u horizonte al modo manual. Rechazar rangos invertidos, fechas imposibles, IDs inválidos y modalidades desconocidas. Validar valores numéricos representables y sumas de fechas, sin convertir desbordamientos en una agenda vacía. **RF-03–RF-06, RF-28–RF-30, RF-42–RF-45.**

### Errores y privacidad

- Respetar autenticación actual: **401** para sesión/cuenta/licencia sin acceso, **403** para rol o perfil propio no autorizado, **404** uniforme para referencias inexistentes o ajenas. Comprobar autorización antes de explicar oferta o causas. **RF-08–RF-12, RF-40, RF-45.**
- **400** para entrada inválida; **200** con ranuras vacías para consulta válida sin oferta efectiva o espacios. Para una validación puntual válida, usar **200** con resultado negativo y motivos cuando ya no quepa o esté ocupado. **RF-06, RF-12, RF-30, RF-42–RF-45.**
- Un fallo de lectura o cálculo produce error técnico, sin ranuras parciales: **503** si es una indisponibilidad temporal de la fuente; **500** para un fallo inesperado. Ambos informan que no se pudo comprobar y permiten reintentar; no devuelven un resultado exitoso vacío. No exponer SQL, tokens, clientes ni trazas internas. **RF-09, RF-44–RF-45.**
- Las consultas no exponen IDs de apartados ni aceptan uno arbitrario para excluirlo del cálculo. La exclusión del apartado propio pertenece al contexto interno de confirmación autorizado. **RF-09, RF-33–RF-36.**

### Contrato con módulos 3 y 4

El motor ofrecerá una validación interna que reciba el contexto de negocio y actor/solicitante ya autorizado, la combinación, el inicio, la modalidad y, cuando corresponda, la identidad comprobada del apartado propio. Reutilizará la transacción del escritor. El HTTP de consulta no genera una garantía de reserva ni un comprobante que permita omitir esta validación. **RF-09–RF-12, RF-15, RF-30, RF-35–RF-36.**

La futura confirmación deberá comprobar que el apartado pertenece al solicitante, sigue vigente y corresponde exactamente a negocio, Profesional, sucursal, servicio e intervalo. Solo entonces podrá excluir ese apartado, conservando las demás ocupaciones. Si expiró o cambió la oferta, la duración del servicio o las restricciones de forma incompatible, se rechazará la confirmación y se requerirá obtener disponibilidad vigente; no se extenderá ni moverá silenciosamente el apartado. Un cambio de duración nunca modifica una cita ya confirmada. **RF-11–RF-12, RF-20, RF-33–RF-36.**

Para RF-37, todos los futuros escritores de citas y apartados deberán bloquear una fila común por Profesional, revalidar bajo ese bloqueo y confirmar la ocupación en la misma transacción. Crear, liberar, consumir y cancelar ocupaciones deben compartir el protocolo. Mantener la precedencia existente de recursos —usuarios, negocio, licencia, sucursal, servicio y perfil, con IDs ordenados dentro de cada clase— y bloquear después las ocupaciones correspondientes. Las lecturas de revalidación deben ver el estado confirmado al obtener el bloqueo, no una instantánea anterior. El reloj se leerá de nuevo tras esperas de bloqueo para vigencia y apartados. **RF-10, RF-15, RF-30–RF-37.**

Antes de conectar la confirmación, coordinar también las mutaciones de horarios, bloqueos, oferta y configuración con los recursos compartidos; los bloqueos colectivos deberán cubrir los perfiles afectados y las altas/cambios de asignación que puedan entrar en su alcance. Auditar esa compatibilidad de orden para evitar interbloqueos. Un conflicto de reserva será **409**, con rollback íntegro; la unión de confirmación y consumo del apartado será atómica. No ejecutar WhatsApp ni otros efectos externos dentro de esa transacción. **RF-07, RF-10–RF-15, RF-31–RF-39.**

Esta fase preparará los contratos y las pruebas de colaboración del motor; no publicará escritores de reservas para simular que RF-35–RF-37 están integrados. La duración del apartado, su renovación, formulario y contador se decidirán y ejecutarán en el módulo 3; el módulo 2 utilizará su vencimiento explícito. **RF-33–RF-37.**

## 6. Decisiones justificadas y alternativas descartadas

| ID | Decisión y justificación | Alternativa descartada y motivo | RF |
| --- | --- | --- | --- |
| D01 | Mantener una configuración por negocio, con valores iniciales efectivos y escritura de conjunto completo: evita combinaciones parciales y consultas que mutan datos. | Configurar por sucursal o Profesional: introduce diferencias no solicitadas. Crear la fila en cada lectura añade carreras y efectos laterales. | RF-01–RF-07 |
| D02 | Extraer lecturas internas compartidas con contexto autorizado; añadir permisos específicos de consulta para recepción. | Dar a recepción permisos de gestión de horarios/bloqueos para reutilizar métodos actuales: amplía sus facultades sin autorización. | RF-08–RF-12, RF-29–RF-30, RF-40 |
| D03 | Calcular oferta y afectaciones desde los estados fuente para reflejar reactivaciones y causas concurrentes. | Persistir banderas `disponible` o `afectada` independientes: exige invalidación en cada cambio y puede ocultar restricciones todavía vigentes. | RF-11–RF-12, RF-38–RF-41 |
| D04 | Conservar anclajes originales y unir atención solo para comprobar cabida: permite RF-16 sin alterar RF-21. | Generar ranuras desde cada hueco resultante o fusionar eliminando los bloques originales: desplaza la secuencia y pierde inicios independientes. | RF-13–RF-26 |
| D05 | Guardar ocupaciones con inicio/fin UTC y zona de reserva; calcular recurrencias en hora local. | Comparar únicamente fecha/hora local o fijar un desplazamiento UTC por sucursal: falla entre zonas y en cambios de hora. | RF-15–RF-20, RF-31–RF-34 |
| D06 | Guardar el intervalo aceptado de cada cita: las modificaciones de duración solo afectan nuevas reservas. | Derivar siempre el fin desde el servicio actual: extiende compromisos existentes y puede producir empalmes. | RF-07, RF-15, RF-20, RF-31 |
| D07 | Instalar fuentes mínimas reales de ocupación y adaptadores de lectura, sin sus flujos de escritura públicos. | Un proveedor que siempre devuelve cero ocupaciones hasta el módulo 3: aparenta disponibilidad y no demuestra persistencia ni aislamiento. | RF-09, RF-15, RF-31–RF-34, RF-38–RF-41 |
| D08 | Evaluar expiración al consultar con reloj inyectado y guardar hash de titular del apartado. | Depender de un proceso de limpieza para liberar horarios o conservar `session_token` utilizable: retrasa la liberación y conserva secretos innecesarios. | RF-33–RF-36 |
| D09 | Aplicar Agenda Compacta por bloque/tramo, con ambos lados de ocupaciones y ajuste a su secuencia. | Llenar un día antes de habilitar otro o recalcular a partir de la hora de cada cita: contradice las decisiones aprobadas. | RF-21–RF-28 |
| D10 | Compartir validador físico entre modalidades y omitir solo cuatro restricciones comerciales en manual. | Aceptar cualquier fecha/hora por tratarse de personal autorizado: permite pasado, oferta inactiva o empalmes. | RF-08–RF-12, RF-29–RF-30 |
| D11 | Consultar con lectura coherente y sin caché inicial; revalidar al escribir en el flujo futuro. | Considerar definitiva la respuesta consultada o reutilizar una caché sin invalidación: las ocupaciones pueden cambiar entre consulta y confirmación. | RF-07, RF-15, RF-31–RF-37, RF-42–RF-44 |
| D12 | Serializar futuras escrituras por Profesional con transacción y bloqueo de base de datos, independiente de sucursal. | Bloqueo en memoria, solo por sucursal o unicidad de hora inicial: falla con varias instancias, traslapes parciales o atención entre sucursales. | RF-15, RF-18, RF-35–RF-37 |
| D13 | Guardar cambios operativos válidos e identificar sus citas afectadas mediante consulta vigente. | Rechazar todos los cambios por tener citas o cancelarlas automáticamente: contradice la especificación y adelanta el ciclo de vida del módulo 4. | RF-38–RF-41 |
| D14 | Distinguir respuestas vacías, datos inválidos y errores técnicos; cerrar la consulta sin resultados parciales ante fallos. | Convertir cualquier excepción en agenda vacía: oculta incidentes y hace creer que el día está lleno. | RF-42–RF-45 |
| D15 | Limitar el tamaño de consulta a 31 fechas y permitir ventanas sucesivas, sin limitar por ello el horizonte configurable. | Materializar sin límite todos los minutos de años completos en una petición: permite consumo de recursos desproporcionado. | RF-05, RF-28–RF-30, RF-42–RF-45 |

## 7. Estrategia de tests y trazabilidad

Se usarán Jest para reglas puras, Supertest para HTTP y MariaDB con migraciones reales para integridad, consultas y carreras. Reutilizar el reloj de pruebas y los ejecutores de bases temporales existentes. No sustituir pruebas de concurrencia por esperas arbitrarias ni por dos promesas que comparten una sola conexión.

| ID | Nivel y escenarios verificables | RF cubiertos |
| --- | --- | --- |
| T01 | **Configuración, unitarias + HTTP + BD:** valores iniciales sin escritura; los seis intervalos; anticipación 0/5/15 válida y 7/negativa/fraccionaria inválida; horizonte 0/60 válido y negativo/fraccionario inválido; modo desconocido; reemplazo íntegro, repetición y carreras de primera escritura sin filas/eventos duplicados. | RF-01–RF-07 |
| T02 | **Seguridad HTTP:** administrador, recepción, Profesional propio/ajeno y superadmin; dos negocios; IDs manipulados; permisos de recepción limitados a consulta/validación; consultas sin JWT y con sesión revocada. | RF-01, RF-08–RF-09, RF-29–RF-30, RF-40, RF-45 |
| T03 | **Licencia con reloj:** antes, instante exacto y después de las 48 horas, token ya abierto, vencimiento natural anterior y cuenta inactiva. La consulta no depende de que haya corrido el conciliador. | RF-10, RF-30 |
| T04 | **Oferta efectiva:** desactivar por separado cada uno de los seis estados; asignación ausente; selección vacía; reactivar y recuperar oferta sin alterar historial; denegar o vaciar según el contrato sin revelar otro negocio. | RF-09, RF-11–RF-12, RF-30 |
| T05 | **Atención:** semana, excepción sustitutiva y vacía, descansos, bloqueos parciales/completos y superpuestos; quitar un bloqueo conserva otros; duración que cabe exactamente, cierre, contigüidad y un minuto de empalme. | RF-13–RF-17 |
| T06 | **Tiempo real y zonas:** dos sucursales con fechas locales distintas que se empalman en UTC; ocupaciones que atraviesan el rango; hora inexistente/repetida; recurrencia omitida y explicada; días de distinta longitud y cambios de fecha local. | RF-18–RF-19, RF-28, RF-31–RF-34, RF-42 |
| T07 | **Duración e historia:** cambiar 30 a 45 minutos; las nuevas ranuras usan 45 y la cita anterior conserva sus 30. Un apartado anterior incompatible no autoriza su confirmación como excepción. | RF-07, RF-15, RF-20, RF-31, RF-35–RF-36 |
| T08 | **Secuencia y continuidad:** bloque 09:00 con paso 15 y ocupación que termina 10:07 produce 10:15; descanso no reancla; bloques 09:00–11:00 y 11:00–13:00 permiten 10:30–11:30; conservar inicios independientes y desduplicar límites. | RF-16–RF-17, RF-21–RF-23 |
| T09 | **Agenda Compacta:** bloque vacío, tramos mañana/tarde independientes, candidatos antes/después, duración no múltiplo del paso, hueco por redondeo, referencias de distintos servicios, apartado vigente como referencia, fallback sin candidatos próximos y elección de otro día con huecos anteriores. | RF-21–RF-27, RF-31, RF-33–RF-34 |
| T10 | **Límites públicos:** 10:07 + 30 minutos ofrece 10:45 con paso 15; anticipación exacta y 0; hoy y último día incluidos; horizonte 0 y medianoche local; anticipación que excede todo el horizonte produce vacío. | RF-02–RF-05, RF-24, RF-27–RF-28, RF-43 |
| T11 | **Manual:** aceptar 10:07 aunque la secuencia pública sea de 15; saltar compactación, anticipación y horizonte; rechazar pasado, bloques, cierre, licencia/oferta inactiva y ocupación de otra sucursal. | RF-08–RF-12, RF-15–RF-19, RF-29–RF-31 |
| T12 | **Ocupaciones en BD con reloj:** todos los estados de cita, solo cancelada libera; apartado antes del vencimiento y en el instante exacto; liberación explícita; filas expiradas presentes; estado cancelado no elimina bloqueos; no filtrar por el servicio elegido al buscar empalmes. | RF-15, RF-18, RF-31–RF-34 |
| T13 | **Contrato de confirmación:** datos cambian después de consultar; motor rechaza oferta/horario ocupado o apartado expirado; identidad y combinación del apartado propio coinciden; otro apartado no se excluye; el HTTP no permite aportar una exclusión arbitraria. Pruebas de colaboración, sin acreditar todavía una reserva real. | RF-09–RF-12, RF-15, RF-20, RF-30, RF-35–RF-36 |
| T14 | **Afectaciones:** guardar horario/bloqueo válido que afecta citas; desactivar cada nivel de oferta; conservar estado e intervalo; listar varias causas, retirar una y mantener las demás; recuperar disponibilidad no cancela ni libera la cita; cancelar la retira del listado. | RF-07, RF-20, RF-31–RF-32, RF-38–RF-41 |
| T15 | **Fallos y contratos HTTP:** vacío legítimo; fecha/rango/ID/modalidad inválidos; oferta no habilitada; omisiones horarias; caída de BD y fallo del cálculo; sin respuesta parcial ni datos internos; reintento exitoso sin escrituras duplicadas. | RF-06, RF-09, RF-12, RF-19, RF-40, RF-42–RF-45 |
| T16 | **Migraciones e integridad:** nueva base hasta fix y luego fase 3; equivalencia del esquema; referencias compuestas que rechazan cruces de negocio; fin no posterior rechazado; hash sin token; índices; datos del fix intactos y bajas con historial rechazadas. | RF-01–RF-07, RF-09, RF-18, RF-20, RF-31–RF-41 |
| T17 | **Regresión y lectura coherente:** conservar contratos existentes de oferta/atención/bloqueos, omisiones por huso y matriz de permisos; editar configuración/oferta mientras se consulta y evitar resultados que mezclen estados de distintas lecturas. | RF-07–RF-14, RF-18–RF-19, RF-38–RF-45 |
| T18 | **Integración futura obligatoria, módulos 3/4:** dos conexiones intentan reservar intervalos iguales y parcialmente solapados, en la misma y distintas sucursales; apartado contra cita manual; expiración mientras se espera un bloqueo; confirmación contra cambio de horario/oferta/licencia; consumo único del apartado, rollback y reintentos sin efectos duplicados. Solo un escritor confirma cada intervalo incompatible. | RF-10–RF-12, RF-15, RF-18, RF-30–RF-37 |

### Cobertura actual frente a integración posterior

- **RF-01–RF-34 y RF-38–RF-45:** implementar y acreditar en esta fase el comportamiento aplicable al motor, su persistencia mínima y las consultas. Las citas/apartados de tests se prepararán como datos de prueba, sin construir pantallas ni rutas de reserva para generarlos.
- **RF-35–RF-36:** preparar el contrato interno y probar la colaboración con ocupaciones reales de prueba; mantener pendiente la evidencia del flujo completo de confirmación de módulos 3/4.
- **RF-37:** especificar protocolo y escenarios T18; no declararlo satisfecho en producción hasta que todos los escritores reales utilicen el protocolo y superen las pruebas con conexiones independientes.

Cada evidencia futura indicará escenario, RF, comando, resultado y límites de lo demostrado. Un test omitido por no disponer de MariaDB se registrará como pendiente, no como aprobado.

## 8. Orden de implementación y cierre

| Etapa | Entrega y condición de avance | RF |
| --- | --- | --- |
| E1 — Base de datos y contratos | Entidades, migraciones y esquema coherentes para configuración y ocupaciones; documentar límites de integración. | RF-01–RF-07, RF-09, RF-18, RF-20, RF-31–RF-37 |
| E2 — Lecturas autorizadas | Permisos de consulta, configuración y extracción de oferta/atención con el mismo contexto de lectura, sin alterar gestión existente. | RF-01–RF-14, RF-18–RF-19, RF-40 |
| E3 — Motor | Ocupaciones, cabida, anclajes, dos estrategias, filtros públicos y modalidad manual con pruebas deterministas. | RF-15–RF-34 |
| E4 — HTTP y afectaciones | Consultas privadas, validación puntual, errores y causas vigentes de citas afectadas. | RF-08–RF-12, RF-20, RF-29–RF-30, RF-38–RF-45 |
| E5 — Verificación de fase 3 | T01–T17, regresiones y evidencia por RF; documentar explícitamente T18 y la integración de RF-35–RF-37 como pendientes posteriores. | RF-01–RF-45, con la distinción anterior |

Al implementar, ejecutar desde la raíz del repositorio `npm run build`, `npm run lint` y `npm test -- --runInBand`, además de las suites relevantes mediante `npm run test:integration -- --runInBand` y `npm run test:e2e -- --runInBand`. Integración y HTTP que dependan de MariaDB usarán únicamente la base de pruebas confirmada y bases temporales del ejecutor existente; no ejecutar migraciones ni limpieza sobre la base cotidiana.

Cerrar esta fase cuando los criterios de la especificación aplicables al motor tengan evidencia, la instalación y los contratos sean coherentes, no haya filtraciones ni fallos conocidos en las reglas cubiertas y los pendientes de integración estén identificados. Este plan es exclusivamente documental; su creación requiere revisar coherencia, enlaces y trazabilidad, sin ejecutar compilación o pruebas de código.
