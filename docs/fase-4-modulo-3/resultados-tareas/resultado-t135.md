# M3-T135 — Guía de instalación y recuperación operativa

Fecha: 21 de octubre de 2026. Revisión base: `ae9c8c9`; comprobaciones sobre el árbol de trabajo actual.

## Qué se realizó

Se documentó el orden **migraciones → backend compatible con escrituras cerradas → frontend conectado → proxy HTTPS de mismo origen → habilitación explícita**. La guía explica dónde cargar las variables sin incluir valores reales, cómo cerrar nuevas escrituras en todas las instancias y cómo resolver un envío incierto con su clave original. También separa el cierre operativo del cierre por licencia, conserva la recuperación propia y prohíbe borrar citas o intentos para retroceder una instalación.

El flujo de recuperación parte de la cookie anónima, el origen y CSRF válidos: el cliente consulta o libera su apartado y resuelve el mismo intento. `registrado` reproduce el folio; `no_registrado` permite reiniciar después del cierre terminal; 503 mantiene el estado incierto y exige reintento. Ninguno de esos caminos crea una segunda cita ni necesita buscar por teléfono.

## Archivos afectados

| Archivo | Qué hace |
| --- | --- |
| [`.env.example`](../../../.env.example) | Añade `PORTAL_PUBLICO_ESCRITURAS=cerradas` como ejemplo seguro. Los comentarios nuevos explican el valor cerrado durante instalación/incidentes y que liberación y recuperación propias continúan. No contiene secretos reales. |
| [`operacion-portal-publico.md`](../operacion-portal-publico.md) | Guía nueva: configuración, migraciones antes de los servidores, proxy del mismo origen, habilitación, cierre y resolución de intentos inciertos. Indica límites de infraestructura y de licencia. |
| [`tareas.md`](../tareas.md) | Marca únicamente M3-T135 al cumplir el criterio y enlaza esta evidencia. |
| `resultado-t135.md` | Registra el flujo, archivos, pruebas y límites de esta tarea. |

No se añadió lógica de aplicación ni bloques de código. El único cambio de configuración incluye comentarios junto al valor nuevo; la guía explica cada paso operativo. No se usó una skill de diseño porque no se modificó la interfaz.

## Tests primero y resultados

Se ejecutaron las suites relacionadas **antes** de escribir la guía y marcar la tarea:

| Comando | Resultado | Qué comprueba |
| --- | --- | --- |
| `npm test -- --runInBand src/reservas-publicas/control-escrituras-publicas.spec.ts src/reservas-publicas/proteccion-portal.service.spec.ts` | **2 suites, 4/4 pruebas aprobadas**. | Producción cerrada sin habilitación expresa, apertura/cierre y origen/CSRF de la sesión pública. |
| `npm run test:integration -- --runInBand fase-4-t008-t013 fase-4-t014-t019 instalacion-t126-t127` | **3 suites, 10/10 pruebas aprobadas** en bases desechables. | Instalación limpia, actualización/migraciones y coherencia de persistencia. |
| `npm run test:e2e -- --runInBand fase-4-t080-t085` | **1 suite, 15/15 pruebas aprobadas** con HTTP y base desechable. | Cierre de primeras escrituras, liberación, recuperación propia, resultado idempotente y respuestas seguras. |

La revisión documental comprobó la precedencia de `constitucion-modulo-3.md`, `spec.md` y `plan.md`, la presencia de las rutas enlazadas y las variables realmente leídas por el backend y Vite. No se ejecutó un despliegue ni se aplicaron migraciones a la base cotidiana.

## Pendientes fuera de T135

La configuración concreta de Nginx, dominio, certificados y topología de instancias requiere decisiones del despliegue. M3-T136 conserva la matriz final; M2-I004/M3-I001 sigue diferida al escritor manual real del módulo 4. Esta guía no declara producción habilitada.
