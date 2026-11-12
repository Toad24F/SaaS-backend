# Ajuste de acceso — Consulta de horarios por Recepción

Fecha: 2026-11-12. Cambio solicitado expresamente por el responsable: permitir a Recepción consultar horario semanal y atención efectiva del calendario, manteniendo la edición restringida. Se documenta como ajuste de autorización del módulo 4; no se marcan tareas posteriores ni se reescriben informes históricos.

Fuentes revisadas: [reglas](../../reglas.md), [constitución](../constitucion-modulo-4.md), [especificación](../spec.md), [plan](../plan.md), [tareas](../tareas.md), contratos del módulo 1 y ajustes aprobados de agenda. La petición amplía exclusivamente las dos lecturas privadas de horario y atención, sustituyendo para ellas la restricción anterior a Administración y Profesional propio.

## Contrato autorizado y flujo

1. Autenticar con las guardas privadas existentes; revalidar sesión, cuenta y licencia vigentes.
2. Permitir en ambos GET los roles `admin_negocio`, `recepcionista` y `profesional`. Superadmin no hereda permisos operativos.
3. Reconstruir el actor y negocio desde persistencia. Buscar el perfil dentro de ese negocio; ajeno e inexistente responden 404. Aplicar `CONSULTAR_HORARIO` y conservar la propiedad del Profesional, que recibe 403 para otro perfil del mismo negocio.
4. `GET /profesionales/:id/horario` devuelve la configuración semanal existente. `PUT` conserva `GESTIONAR_HORARIO`; Recepción recibe 403.
5. `GET /profesionales/:id/atencion?desde=&hasta=` conserva validación de fechas, rango y formato de respuesta. Leer internamente los bloqueos del negocio, individuales del perfil o colectivos, solapados con el periodo. Corregir su hidratación de fechas civiles con la utilidad existente y aplicar el alcance de sucursal durante la proyección.
6. Descontar bloqueos sin otorgar listado, alta, edición ni borrado de bloqueos a Recepción. No devolver motivos de bloqueos en atención. Atención no descuenta citas ni apartados y no equivale a disponibilidad.

No se requieren migraciones, cambios de entidad, esquema SQL o frontend. No se amplían otras rutas de profesionales ni se altera el motor de disponibilidad.

## Archivos y propósito

| Archivo | Cambio |
| --- | --- |
| `src/auth/services/autorizacion.service.ts` | Añade `CONSULTAR_HORARIO` a Administración, Recepción y Profesional, conservando permisos de gestión. |
| `src/horarios/horarios.controller.ts` | Declara los tres roles solo en los dos GET; la restricción de clase sigue protegiendo el PUT. |
| `src/horarios/horarios-acceso.service.ts` | Separa el permiso de consulta del de escritura; conserva pertenencia persistida. |
| `src/horarios/atencion.service.ts` | Sustituye el listado de gestión por lectura interna autorizada de bloqueos. |
| `src/bloqueos/bloqueos.service.ts` | Añade `listarParaAtencion`, con revalidación de actor, negocio y propiedad, filtros SQL por alcance/periodo y fechas civiles. Los métodos de gestión conservan su permiso por defecto. |
| `src/auth/services/autorizacion.service.spec.ts` | Seis casos de matriz y un caso de alcance de lectura con cuatro comprobaciones de negocio/propiedad. |
| `test/horarios-t093-t095.e2e-spec.ts` | Tres casos nuevos con aplicación, sesiones y base migrada reales; conserva los dos casos anteriores. |
| Documentación del módulo 4 | Especificación, plan, tareas, matriz y este informe registran contrato, precedencia y evidencia sin cerrar la fase. |

## Pruebas y revisión

Las pruebas nuevas se añadieron durante la implementación; no se atribuye un ciclo rojo/verde previo del comportamiento. La primera ejecución HTTP anterior al cambio falló por `EACCES` al conectar a MariaDB desde el entorno restringido. La primera unitaria completa también encontró restricciones de puertos locales y se interrumpió para repetir con acceso adecuado. No representan fallos funcionales acreditados.

En el desarrollo se corrigieron dos errores de preparación del caso de acceso: la firma JWT no debe copiar `exp` al usar `expiresIn`, y una licencia vencida debe conservar creación anterior a habilitación y vencimiento posterior a habilitación. Se corrigieron exclusivamente los fixtures de prueba.

Los tres casos HTTP nuevos verifican:

- Igualdad de semana para Recepción y respuesta de atención igual a Administración/Profesional; unión de bloqueos individual y colectivo, con tramos 09:00–10:00, 11:00–11:30 y 12:00–13:00. Bloqueos de otro perfil y negocio no alteran esos tramos.
- Denegación de PUT de horario y GET/POST/PATCH/DELETE de bloqueos para Recepción; semana intacta después de los rechazos.
- 404 para negocio ajeno e inexistente; 403 para Superadmin y Profesional sobre otro perfil; Recepción puede leer otro perfil del mismo negocio; fecha inválida devuelve 400.
- 401 sin sesión, con sesión revocada, cuenta desactivada, licencia vencida y licencia suspendida, en ambas rutas.

| Comando | Resultado |
| --- | --- |
| `npm run build` | Aprobado, código 0. Se retiró únicamente el cambio generado en `tsconfig.build.tsbuildinfo`, limpio al iniciar esta implementación. |
| `npm run lint` | Aprobado, código 0; repetido después de los últimos cambios de pruebas. |
| `npm test -- --runInBand` (con acceso a puertos locales) | 99/99 suites y 648/648 pruebas aprobadas; 128,817 s, código 0. Incluye los siete casos unitarios nuevos de autorización. |
| `npm run test:integration -- --runInBand` | 105/105 suites y 608/608 pruebas aprobadas; 1.285,868 s, código 0. |
| `npm run test:e2e -- --runInBand horarios-t093-t095` | 5/5 pruebas aprobadas; repetición final 16,895 s, código 0, después de corregir los fixtures y comprobar recuperación de acceso entre denegaciones. Incluye los tres casos HTTP nuevos y los dos anteriores. |
| `npm run test:e2e -- --runInBand` | 52 suites aprobadas y una fallida de 53; 279 pruebas aprobadas y una fallida de 280; 817,941 s, código 1. El único fallo fue la preparación de licencia del caso nuevo, ejecutado antes de corregir sus fechas SQL. La implementación productiva no cambió durante esta ejecución. La suite afectada pasó 5/5 con el fixture definitivo y se repitió además mediante `--onlyFailures` tras cerrar la ejecución completa. |
| `npm run test:e2e -- --runInBand --onlyFailures` | Reejecución posterior al cierre de la suite completa: 1/1 suite y 5/5 pruebas aprobadas; 13,212 s, código 0. Queda resuelto el único fallo registrado en HTTP; no se presenta esta reejecución focal como una segunda ejecución completa de los 280 casos. |
| `npm test -- --runInBand test/fase-5-t001-t002.spec.ts` | Revisión documental final: 2/2 aprobadas; 0,434 s, código 0. |
| Enlaces locales de especificación, plan, tareas, matriz e informe | Todos válidos. |
| `git -c core.safecrlf=false diff --check` | Sin errores. |

Revisión final: los diez casos nuevos (siete unitarios y tres HTTP) pasan; se conservan aislamiento, propiedad y permisos de escritura. La regresión de integración completa pasó. Los 279 casos HTTP restantes pasaron en la ejecución completa y la suite que contenía el único fallo pasó después con sus cinco casos. No quedan fallos conocidos de estas verificaciones. Se comprobaron enlaces locales y espacios del diff; no se modificaron casillas de tareas ni evidencias históricas. Las pruebas con escritura utilizaron los ejecutores de bases de prueba y bases migradas desechables, sin escribir en la base cotidiana.

## Límite del ajuste

La evidencia se limita al permiso de lectura y su regresión backend. No acredita frontend, tareas posteriores, cierre del módulo, integraciones diferidas ni habilitación productiva.
