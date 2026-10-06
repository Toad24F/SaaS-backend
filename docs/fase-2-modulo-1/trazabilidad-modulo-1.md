# Trazabilidad de aceptación — fase 2, módulo 1

Fecha: 2026-10-05. Esta matriz vincula la [especificación](spec-modulo-1.md) con casos ejecutados en las suites completas. `Pasa` significa que el caso citado pasó en la ejecución indicada al final; no convierte trabajo fuera del módulo en funcionalidad entregada. Las pruebas HTTP usan reloj y transporte controlados; las de integración usan MariaDB temporal migrada.

## Flujo de lectura

1. Localizar el RF o criterio en la primera columna. La segunda describe el caso observable y abre el archivo de prueba concreto; dentro del archivo, el nombre de `it` identifica el escenario.
2. Leer el resultado y su alcance en la tercera columna. Los totales de las suites están al final.
3. Para RF-88 y los criterios 1, 25 y 27, conservar la distinción entre oferta vacía comprobada y rechazo de citas reales pendiente de integración con reservas.

## T138 — identidad, catálogos, bajas y selección

| RF | Caso → evidencia | Resultado y alcance |
| --- | --- | --- |
| RF-01 | [Aislamiento de dos negocios][seg131] y [catálogos ajenos][suc-http] | Pasa: 403/404 sin revelar ni mutar filas ajenas. |
| RF-02 | [Rol persistido en alta][neg-http], [cupo exclusivo][suc-http] y [licencias por rol][lic-http] | Pasa: operaciones reservadas al superadmin. |
| RF-03 | [Administración de sucursales][suc-http], [servicios][ser-http] y [profesionales][pro-http] | Pasa: opera con su propio `negocio_id`. |
| RF-04 | [Matriz de roles en sucursales][suc-http], [servicios][ser-http] y [horarios][hor-http] | Pasa: recepción no administra esos recursos. |
| RF-05 | [Perfil propio/ajeno][sel-http] y [horario propio/ajeno][seg131] | Pasa: Profesional no altera cuentas, catálogos ni perfiles ajenos. |
| RF-06 | [Alta HTTP y validación][neg-http] | Pasa: nombre, RFC, correo y slug único. |
| RF-07 | [Dos altas con RFC repetido][alta-rollback] | Pasa: RFC compartido permitido sin compartir identidad. |
| RF-08 | [Alta pendiente sin usuario][alta-inv] y [recorrido conjunto][rec133] | Pasa: licencia sin iniciar, código en bandeja y ninguna cuenta incompleta. |
| RF-09 | [Activación transaccional][inv] y [recorrido HTTP][rec133] | Pasa: correo, código y datos completos crean cuenta e inician año una vez. |
| RF-10 | [Rechazos HTTP por causa][id-http] y [rechazos de invitación][inv] | Pasa: correo, código, vencimiento, sustitución y consumo sin alta parcial. |
| RF-11 | [Dos conexiones activan el mismo código][carr-inv] | Pasa: una cuenta, un consumo, un año y auditoría única. |
| RF-12 | [Corrección de destinatario][inv] y [ruta HTTP][id-http] | Pasa: invalida código y envío anteriores, reserva el nuevo correo. |
| RF-13 | [Correo ocupado o reservado][alta-rollback] y [reserva concurrente][res-cor] | Pasa: conflicto sin cambio parcial. |
| RF-14 | [Procesador con destinatario y propósito][pro-cor] y [recorrido con correo falso][rec133] | Pasa: entrega controlada y uso restringido. |
| RF-15 | [Reemisión y 48 horas][inv] y [código sustituido][cod-f2] | Pasa: anterior invalidado, licencia aún no iniciada. |
| RF-16 | [Recuperación de 30 minutos][rec-cor] y [HTTP de credenciales][cred-http] | Pasa: conserva restricciones de destinatario y propósito. |
| RF-17 | [Rechazo/timeout y reintento][alta-rollback] y [consulta HTTP de envíos][env-http] | Pasa: negocio pendiente, sin cuenta; fallo visible al superadmin. |
| RF-18 | [Reintento de código vencido/invalidado][pro-cor] y [encolado en frontera][enc-cor] | Pasa: no extiende ni revive vigencia. |
| RF-19 | [Respuesta/logs sin secretos][id-http] y [error SMTP saneado][pro-cor] | Pasa: no expone contraseñas ni códigos utilizables. |
| RF-20 | [Alta con cupo omitido][alta-inv] y [restricción migrada][ident-db] | Pasa: capacidad inicial de una sucursal activa. |
| RF-21 | [CRUD y validación HTTP de sucursal][suc-http] | Pasa: obligatorios y campos opcionales persistidos. |
| RF-22 | [Conteo de activas][suc-int] y [consulta HTTP de cupo][suc-http] | Pasa: excluye sucursales inactivas. |
| RF-23 | [Dos altas por última plaza][suc-int] y [dos reactivaciones][hor-rc] | Pasa: sin sobrecupo bajo concurrencia. |
| RF-24 | [Reducción HTTP][suc-http] y [alta/reducción simultáneas][suc-int] | Pasa: exige desactivar excedentes antes de reducir. |
| RF-25 | [Desactivación y conservación][suc-http] y [horarios de sede inactiva][hor-rc] | Pasa: datos y horarios retenidos sin atención operativa. |
| RF-26 | [Reactivación con horarios conservados][hor-rc] | Pasa: verifica cupo y conflictos antes de activar. |
| RF-27 | [Servicio HTTP y costo decimal][ser-http] | Pasa: nombre, costo no negativo y duración positiva. |
| RF-28 | [Precio/duración de catálogo único][ser-http] | Pasa: sin precio o duración por sede o Profesional. |
| RF-29 | [Alta de cuenta y perfil][pro-http] y [recorrido conjunto][rec133] | Pasa: cuenta completa y activa, sin invitación por código. |
| RF-30 | [Contraseña, reserva y unicidad][pro-http] y [dos altas concurrentes][sel-int] | Pasa: política y correo global único. |
| RF-31 | [Asignación a varias sucursales][pro-http] | Pasa: sucursales del mismo negocio. |
| RF-32 | [Selección propia y administrativa][sel-http] | Pasa: servicios activos propios, sin mutar catálogo. |
| RF-33 | [Oferta por Profesional activo y sede][sel-http] | Pasa: oferta derivada sin selección por sucursal. |
| RF-34 | [Catálogo inactivo y selección conservada][sel-http] y [carrera con desactivación][sel-int] | Pasa: servicio inactivo no se ofrece. |
| RF-35 | [Desactivar con sesión abierta][seg131] y [alta/estado del Profesional][pro-http] | Pasa: acceso cortado, datos conservados. |
| RF-36 | [Reactivar sin revivir sesión][pro-http] | Pasa: credenciales conservadas y nueva autenticación. |
| RF-66 | [Desactivar sin borrar][bajas-int] y [ruta HTTP][bajas-http] | Pasa: filas, relaciones e historial conservados. |
| RF-67 | [Eliminar filas sin uso][bajas-int] | Pasa: permite borrado y retiene auditoría técnica del alta. |
| RF-68 | [Rechazar baja con relaciones/historial][bajas-int] y [HTTP 409][bajas-http] | Pasa: indica desactivación como alternativa. |
| RF-86 | [Opciones activas, seleccionadas e inactivas][sel-http] | Pasa: admin y dueño consultan selección actual. |
| RF-87 | [Reemplazo sin tocar otros recursos][sel-http] y [recarga][sel-int] | Pasa: desmarcado y selección múltiple persistentes. |
| RF-88 | [Selección vacía y oferta restablecida][rec133] y [persistencia][sel-int] | **Parcial explícito:** selección/oferta vacía y horario/cuenta conservados pasan. Rechazo al crear citas reales pendiente del módulo de reservas. |

## T139 — horarios, bloqueos, licencias y avisos

| RF | Caso → evidencia | Resultado y alcance |
| --- | --- | --- |
| RF-37 | [Varias franjas y sedes][hor-core] y [rutas de dueño/admin][hor-http] | Pasa: franjas por día y sede asignada. |
| RF-38 | [Interruptores independientes][hor-ex] | Pasa: desactivar una franja conserva sus datos y las demás. |
| RF-39 | [Última franja y semana vacía][hor-con] | Pasa: reemplazo completo admite atención vacía. |
| RF-40 | [Borrador incompleto][hor-draft] y [omisión en atención][bloq-http] | Pasa: se guarda sin crear empalmes ni atención. |
| RF-41 | [Activación inválida por campo/tenant][hor-draft] y [rollback de semana][hor-con] | Pasa: anterior intacto. |
| RF-42 | [Descansos válidos e inválidos][hor-ex] | Pasa: par opcional completo, contenido en franja. |
| RF-43 | [Empalme dentro del descanso][hor-core] | Pasa: descanso no libera ocupación entre sedes. |
| RF-44 | [Excepción por fecha][hor-ex] y [conflicto al sustituir][hor-http] | Pasa: sustituye solo sede y valida resultado conjunto. |
| RF-45 | [Fin 24:00 y límites locales][hor-unit] y [días locales diferentes][hor-cal] | Pasa: cruce de medianoche se representa por franjas separadas. |
| RF-46 | [Conflicto entre zonas][hor-core] y [ruta de excepción][hor-http] | Pasa: compara instantes reales, aun con fecha local distinta. |
| RF-47 | [Reactivación y excepción conflictivas][hor-rc] y [rollback de excepción][hor-ex] | Pasa: operación íntegra rechazada con filas identificadas. |
| RF-48 | [Franjas consecutivas][hor-core] | Pasa: igualdad fin/inicio admitida entre sedes. |
| RF-49 | [Dos franjas con hueco para comida/traslado][hor-core] | Pasa: atención excluye el hueco sin tiempo de traslado configurable. |
| RF-50 | [Atención recorta descanso y huecos][bloq-http] y [proyección de horarios][hor-core] | Pasa: franjas guardadas intactas. |
| RF-51 | [Guardado semanal íntegro][hor-con] y [rollback SQL][hor-ex] | Pasa: conjunto completo o semana anterior. |
| RF-52 | [Error con fila y campo][hor-con] y [validación HTTP][hor-http] | Pasa: identifica datos afectados para corregir el conjunto. |
| RF-53 | [Dos reemplazos concurrentes][hor-con] y [semana/excepción concurrentes][hor-rc] | Pasa: último conjunto válido sin empalmes. |
| RF-54 | [Recarga de semana y borrador][hor-con] y [lectura HTTP][hor-http] | Pasa: devuelve sede, horas, descanso, estado e incompletos. |
| RF-55 | [Validación de tipo, motivo, fechas y alcance][bloq-http] | Pasa: datos obligatorios. |
| RF-56 | [Alcance individual/colectivo][bloq-int] y [colectivo multiday][bloq-http] | Pasa: una o todas las sedes del negocio. |
| RF-57 | [Profesional solo sobre sí mismo][bloq-int] y [seguridad HTTP][seg131] | Pasa: bloqueos ajenos y colectivos protegidos. |
| RF-58 | [Intervalo continuo multiday][bloq-http] | Pasa: recorta días intermedios. |
| RF-59 | [Bloqueo de días completos][bloq-val] y [proyección por sede][bloq-calc] | Pasa: fechas inicial y final inclusivas. |
| RF-60 | [Rangos inválidos y rollback][bloq-http] y [alcance inválido][bloq-int] | Pasa: una sola hora, invertido, nulo o ausente rechazados. |
| RF-61 | [Dos zonas horarias y DST][bloq-http] | Pasa: cada sede interpreta su hora local; anomalías rechazadas/omitidas según política. |
| RF-62 | [Bloqueos solapados][bloq-int] y [quitar uno][bloq-http] | Pasa: unión conserva restricciones restantes. |
| RF-63 | [Admin gestiona bloqueo profesional][bloq-int] | Pasa: limitado al negocio. |
| RF-64 | [Profesional modifica individual creado por admin][bloq-int] y [HTTP][bloq-http] | Pasa: no modifica colectivos ni ajenos. |
| RF-65 | [Bloqueo sobre excepción sin borrar semana][bloq-http] y [recorrido][rec133] | Pasa: atención recortada, configuración intacta. |
| RF-69 | [Suspensión y frontera de 48 h][lic-vig] y [recorrido][rec133] | Pasa: bloqueo programado. |
| RF-70 | [Gracia antes de 48 h][lic-vig] y [rutas nuevas][seg131] | Pasa: acceso normal sujeto al vencimiento. |
| RF-71 | [Vencimiento antes del bloqueo][lic-vig] | Pasa: corta acceso al vencimiento natural. |
| RF-72 | [Sesión abierta en límite exacto][seg131] y [conciliación tardía][ejecutor] | Pasa: 401 y remanente congelado. |
| RF-73 | [Suspensión repetida][lic-http] y [doble transición][lic-con] | Pasa: no reinicia plazo ni duplica eventos. |
| RF-74 | [Reactivación durante gracia][lic-http] y [aviso invalidado][avisos] | Pasa: cancela corte sin devolver tiempo consumido. |
| RF-75 | [Restitución del remanente][lic-http] y [carreras][lic-con] | Pasa: sin tiempo duplicado. |
| RF-76 | [Renovar suspendida][lic-http] y [carreras renovación/reactivación][lic-con] | Pasa: suma año sin levantar suspensión. |
| RF-77 | [Suspender negocio pendiente][act-int] y [recorrido HTTP][rec-lic] | Pasa: activación impedida sin iniciar año. |
| RF-78 | [Cuenta y datos conservados][lic-http] y [recorrido conjunto][rec133] | Pasa: suspensión/vencimiento no borran registros. |
| RF-79 | [Dobles y cruces concurrentes][lic-con] y [rollback de auditoría][lic-http] | Pasa: transiciones seriales sin pérdida, duplicado o cambio de tenant. |
| RF-80 | [Frontera inclusiva de aviso][avisos] | Pasa: encola a 48 h del vencimiento. |
| RF-81 | [Reintento vigente y descarte al vencer][avisos] | Pasa: confirmado no se repite. |
| RF-82 | [Renovar/reactivar invalida pendientes][avisos] | Pasa: envío obsoleto descartado por versión. |
| RF-83 | [Vista de días/horas/minutos][vig-unit] y [consulta propia HTTP/servicio][vig-cons] | Pasa: estado, vencimiento y tiempo restante. |
| RF-84 | [Vista durante gracia][vig-unit] y [límite HTTP][lic-vig] | Pasa: fecha de corte programado distinta de suspensión efectiva. |
| RF-85 | [Pendiente, congelada y vencida][vig-unit] y [remanente cero][lic-retry] | Pasa: estados y tiempo coherentes. |

## T138–T140 — criterios de finalización

Los números corresponden a la sección «Criterios de finalización» de la [spec](spec-modulo-1.md). Un criterio de trazabilidad revisado no se convierte en una afirmación de que el sistema de reservas ya existe.

| Criterio | Caso → evidencia | Resultado y alcance |
| --- | --- | --- |
| C-01 | Esta matriz: RF-01–RF-88; [instalación completa][inst] | Revisado: 87 RF acreditados en el alcance del módulo; RF-88 conserva el pendiente explícito de citas. |
| C-02 | [Dos negocios y roles][seg131], [sucursales][suc-http] | Pasa: aislamiento y matriz de permisos. |
| C-03 | [Invitación/activación][inv], [carrera][carr-inv] | Pasa: cuenta y año únicos. |
| C-04 | [Rechazos/corrección][id-http], [fallos y reintentos][alta-rollback] | Pasa: código y destinatario seguros. |
| C-05 | [Cupo y concurrencia][suc-int], [HTTP][suc-http] | Pasa: inicial, modificación, desactivación y carreras. |
| C-06 | [Sucursales][suc-http], [servicios][ser-http], [profesionales][pro-http], [bajas][bajas-int] | Pasa: ciclo de catálogos y eliminaciones permitidas/rechazadas. |
| C-07 | [Franjas e interruptores][hor-ex], [varias sedes][hor-http] | Pasa: estado independiente y datos retenidos. |
| C-08 | [Semana vacía y última franja][hor-con] | Pasa: guardado y recarga. |
| C-09 | [Borrador incompleto][hor-draft], [atención][bloq-http] | Pasa: sin efecto hasta activación válida. |
| C-10 | [Validación de franja/descanso][hor-ex] y [modelo unitario][hor-unit] | Pasa: obligatoriedad, rango y único descanso. |
| C-11 | [Descanso ocupado y días distintos][hor-cal], [hueco de comida][hor-core] | Pasa: consecutivas admitidas sin traslado configurable. |
| C-12 | [Excepción y zonas][hor-http], [UTC frente a fecha local][hor-core] | Pasa: conflictos entre sedes y jornadas locales. |
| C-13 | [Rollback con fila y campo][hor-con] | Pasa: conjunto anterior conservado. |
| C-14 | [Reemplazo concurrente][hor-con], [semana/excepción][hor-rc] | Pasa: último válido íntegro. |
| C-15 | [Consulta con borrador y datos incompletos][hor-con], [HTTP][hor-http] | Pasa: lectura fiel. |
| C-16 | [Validación e intervalos][bloq-val], [HTTP multiday][bloq-http] | Pasa: obligatorios, días completos y errores. |
| C-17 | [Alcance y tenant][bloq-int], [dos zonas][bloq-http] | Pasa: persona/equipo y sede/todas. |
| C-18 | [Matriz de actor y dueño][bloq-int], [seguridad HTTP][seg131] | Pasa: Profesional individual, admin del negocio. |
| C-19 | [Solapamiento y excepción][bloq-http], [cálculo unitario][bloq-calc] | Pasa: quitar un bloqueo mantiene los demás. |
| C-20 | [Límite y vencimiento anticipado][lic-vig], [cancelación][lic-http], [pendiente][rec-lic] | Pasa: 48 h, corte exacto, cancelación y preactivación. |
| C-21 | [Tiempo y datos][lic-http], [carreras][lic-con] | Pasa: sin vigencia ni auditoría duplicadas. |
| C-22 | [Frontera, reintento y sustitución][avisos] | Pasa: aviso de dos días y pendientes obsoletos. |
| C-23 | [Estados y tiempos de licencia][vig-unit], [corte en rutas][seg131] | Pasa: fechas y remanentes. |
| C-24 | [Regresión de autenticación][auth-reg], [migración limpia][inst] y suites de abajo | Pasa: build, lint y regresiones compatibles; evidencia histórica queda separada. |
| C-25 | Esta matriz y [recorrido][rec133] | Revisado con pendiente explícito: backend de módulo 1 acreditado; citas reales y pantallas fuera de alcance. |
| C-26 | [Selección por admin y propio][sel-http], [recarga][sel-int] | Pasa: distingue inactivos. |
| C-27 | [Múltiple, vacía y restaurada][sel-http], [recorrido con horario][rec133] | **Parcial explícito:** oferta vacía comprobada; rechazo al crear citas reales pendiente. |

## Resultados de ejecución y límites de entrega

| Comando | Resultado |
| --- | --- |
| `npm test -- --runInBand` | 56 suites, 298/298 pruebas aprobadas. |
| `npm run test:integration -- --runInBand` | 41 suites, 208/208 pruebas aprobadas con MariaDB temporal migrada. |
| `npm run test:e2e -- --runInBand` | 22 suites, 131/131 pruebas aprobadas con reloj y correo controlados. |
| `npm run build` y `npm run lint` | Aprobados en este cierre. |

Las tres suites suman **637/637 pruebas aprobadas**. Los `ERROR` impresos por ciertos casos HTTP corresponden a fallos inyectados para comprobar rollback; el proceso Jest terminó con código 0.

**Pendientes de entrega:** configurar y validar secretos y transporte de correo en el entorno de despliegue; ejecutar las migraciones sobre una base nueva confirmada y verificar la configuración operativa allí. La conversión de una instalación con datos existentes requeriría diagnóstico, plan aprobado y ensayo aparte. Nada de esto se declara ejecutado en producción. La comprobación del rechazo de citas cuando la selección está vacía corresponde a la futura integración del módulo de reservas.

**Fuera de alcance de este cierre:** frontend, portal y creación de reservas/citas, modos «Ventana libre» y «Agenda compacta», pagos, WhatsApp, PDF y validación de cambios contra citas existentes. Los resultados anteriores pertenecen al backend de módulo 1.

<!-- Cada referencia apunta a un archivo de pruebas ejecutado; la descripción de cada fila identifica el caso. -->
[seg131]: ../../test/seguridad-t131-t132.e2e-spec.ts
[suc-http]: ../../test/sucursales-t065.e2e-spec.ts
[neg-http]: ../../test/negocios-t47.e2e-spec.ts
[lic-http]: ../../test/licencias-t50.e2e-spec.ts
[ser-http]: ../../test/servicios-t067-t070.e2e-spec.ts
[pro-http]: ../../test/profesionales-t071-t076.e2e-spec.ts
[sel-http]: ../../test/profesionales-t077-t080.e2e-spec.ts
[hor-http]: ../../test/horarios-t093-t095.e2e-spec.ts
[alta-rollback]: ../../test/alta-rollback-t036.integration-spec.ts
[alta-inv]: ../../test/alta-invitacion.integration-spec.ts
[rec133]: ../../test/recorrido-t133.e2e-spec.ts
[inv]: ../../test/invitaciones-t037-t039.integration-spec.ts
[id-http]: ../../test/http-identidad-t041-t044.e2e-spec.ts
[carr-inv]: ../../test/carreras-invitaciones-t042-t043.integration-spec.ts
[res-cor]: ../../test/reserva-correo-fase-2.integration-spec.ts
[pro-cor]: ../../test/procesador-correo.integration-spec.ts
[cod-f2]: ../../test/codigos-fase-2.integration-spec.ts
[rec-cor]: ../../test/recuperacion-correo-t040.integration-spec.ts
[cred-http]: ../../test/credenciales-t49.e2e-spec.ts
[env-http]: ../../test/envios-correo.e2e-spec.ts
[enc-cor]: ../../test/encolado-correo.integration-spec.ts
[ident-db]: ../../test/identidad-fase-2.integration-spec.ts
[suc-int]: ../../test/sucursales-t062-t066.integration-spec.ts
[hor-rc]: ../../test/horarios-t097-t100.integration-spec.ts
[sel-int]: ../../test/profesionales-t081-t082.integration-spec.ts
[bajas-int]: ../../test/bajas-t111-t115.integration-spec.ts
[bajas-http]: ../../test/bajas-t111-t115.e2e-spec.ts
[hor-core]: ../../src/horarios/calendario-t095.spec.ts
[hor-ex]: ../../test/horarios-t092-t096.integration-spec.ts
[hor-con]: ../../test/horarios-t090-t091.integration-spec.ts
[hor-draft]: ../../test/horarios-t083-t085.integration-spec.ts
[hor-cal]: ../../src/horarios/calendario.spec.ts
[hor-unit]: ../../src/horarios/horarios-fase-2.spec.ts
[bloq-http]: ../../test/bloqueos-t106-t110.e2e-spec.ts
[bloq-int]: ../../test/bloqueos-t101-t105.integration-spec.ts
[bloq-val]: ../../src/bloqueos/validar-bloqueo.spec.ts
[bloq-calc]: ../../src/bloqueos/calculo-bloqueos.spec.ts
[lic-vig]: ../../test/licencias-vigencia-t051-t057.e2e-spec.ts
[ejecutor]: ../../test/ejecutor-t121-t122.integration-spec.ts
[lic-con]: ../../test/concurrencia-t52-t57.integration-spec.ts
[avisos]: ../../test/avisos-t116-t120.integration-spec.ts
[act-int]: ../../test/activaciones.integration-spec.ts
[rec-lic]: ../../test/recorridos-t51-t58-t60.e2e-spec.ts
[lic-retry]: ../../test/licencias-reintentos.integration-spec.ts
[vig-unit]: ../../src/licencias/services/vista-vigencia-licencia.service.spec.ts
[vig-cons]: ../../src/licencias/services/consulta-vigencia-licencias.service.spec.ts
[inst]: ../../test/instalacion-t126-t127.integration-spec.ts
[auth-reg]: ../../test/regresion-auth-t128.e2e-spec.ts
