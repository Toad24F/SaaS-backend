# Resultados T51–T60

Fecha: 2026-09-16.

## Trabajo realizado por archivo

- `test/support/escenarios-t51-t60.ts`: prepara superadmin, negocios pendientes y activos mediante los casos de uso reales; conecta servicios a cada `DataSource` de prueba sin compartir estado entre bases.
- `test/concurrencia-t52-t57.integration-spec.ts`: once escenarios con dos conexiones MariaDB para activación única, reemplazo/consumo de códigos en ambos órdenes y simultáneo, login frente a cambio/recuperación de clave, suspensiones/reactivaciones/renovaciones simultáneas y rollback de operaciones sensibles.
- `test/recorridos-t51-t58-t60.e2e-spec.ts`: cuatro recorridos con Nest, Guards, JWT, validación HTTP y reloj controlado. Comprueban aislamiento entre negocios; alta, activación, login y gestión anual; vencimiento exacto, renovaciones anticipada/tardía, pausas prolongadas/sucesivas y aniversario bisiesto; y suspensión anterior a la primera activación con caducidad/reemisión de código.
- `src/auth/auth.service.ts`: revalida la cuenta bajo bloqueo y crea la sesión en la misma transacción. El login iniciado con hash antiguo ya no puede crear una sesión después de cambiar o recuperar la contraseña.
- `src/auth/services/sesiones.service.ts`: incorpora la inserción de sesión con un `EntityManager` recibido, para compartir el bloqueo y el commit del login.
- `src/auth/auth.service.spec.ts` y `src/auth/auth-flujos.spec.ts`: actualizan los dobles unitarios para la creación transaccional de sesiones; conservan comprobaciones de JWT sin hash, rechazos y logout.
- `docs/tareas-auth.md` y `docs/plan.md`: marcan T51–T60 como hechas, ajustan el conteo y enlazan esta evidencia.

Los bloques de producción y los helpers/pruebas nuevos incluyen comentarios sobre el motivo del bloqueo, la transacción, los intercalados y el aislamiento de datos.

## Pruebas primero y hallazgo

La primera ejecución de integración fue roja en T54: un login pausado después de comparar el hash antiguo dejaba **una sesión activa** tras cambiar la contraseña. La prueba demostró la carrera con dos conexiones independientes. T55 también reveló una aserción incorrecta del test, que suponía cuál de dos solicitudes simultáneas ganaría; se cambió para aceptar cualquiera de los órdenes seriales válidos. Después de corregir la creación de sesión bajo bloqueo y ampliar la cobertura, las once pruebas nuevas de integración y las cuatro e2e nuevas pasaron.

T52 verifica una sola activación, consumo, habilitación y evento. T53 verifica ambos órdenes de reemplazo/consumo, la competencia simultánea de activación y recuperación y el rechazo de códigos invalidados. T54 fuerza el intercalado de login con cambio y con recuperación, sin sesiones sobrevivientes de la clave anterior. T55–T56 verifican un solo efecto por transición, dos años acumulados y cruces serializables. T57 induce errores antes del commit y confirma rollback de alta, activación/código, cambio/recuperación de contraseña, suspensión, reactivación, renovación y auditoría. T51 y T58–T60 ejercitan las rutas HTTP reales y comprueban que bloqueos y expiraciones conservan los datos.

## Resultado de la suite

- `npm run build`: correcto.
- `npm run lint`: correcto, sin diagnósticos.
- `npm test -- --runInBand`: 26 suites, 118 pruebas aprobadas.
- `npm run test:integration -- --runInBand`: 12 suites, 54 pruebas aprobadas.
- `npm run test:e2e -- --runInBand`: 8 suites, 87 pruebas aprobadas.

Las trazas de excepciones T48–T50 durante e2e son inyecciones deliberadas de sus pruebas de rollback; Jest cerró todas las suites en verde. T51–T60 quedan completadas. No se inició T61 ni tareas posteriores.
