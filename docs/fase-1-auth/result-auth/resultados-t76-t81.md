# Resultados T76 y T81

Fecha: 2026-09-15

## Resultado

T76 implementa la desactivación y reactivación transaccional de recepcionistas completos del negocio del administrador. La fila destino se bloquea para serializar cambios; desactivar revoca todas sus sesiones, reactivar conserva sus credenciales e identidad y las repeticiones no producen cambios ni eventos duplicados.

T81 implementa el alta directa: normaliza nombre y correo, aplica la política bcrypt, obtiene negocio y rol desde el administrador persistido y crea una cuenta activa y activada junto con su auditoría. No genera códigos; una colisión global de correo responde como conflicto y la transacción evita altas parciales.

## Archivos

- `src/usuarios/usuarios.service.ts`: contiene los casos de uso de alta directa y transición de acceso, las validaciones de actor/tenant/cuenta completa, el bloqueo pesimista, la revocación de sesiones y la auditoría sin secretos.
- `src/usuarios/usuarios.module.ts`: registra auditoría y política de contraseñas requeridas por los nuevos casos de uso.
- `src/auth/auth.module.ts`: exporta el reloj compartido para que las operaciones HTTP usen el mismo instante que sesiones y Guards.
- `src/usuarios/recepcionistas.controller.ts`: entrega el instante del reloj inyectado al caso existente de desactivación; evita revocaciones anteriores a la creación de una sesión en pruebas y producción.
- `src/usuarios/usuarios.service.spec.ts`: registra dobles de las nuevas dependencias para conservar la prueba unitaria de consulta.
- `test/recepcionistas-t76-t81.integration-spec.ts`: agrega cinco escenarios de aceptación sobre instalaciones MariaDB migradas y desechables.
- `docs/tareas-auth.md` y `docs/plan.md`: actualizan el avance, enlazan esta evidencia y mantienen pendientes T77–T79 y T82–T85.

## Pruebas nuevas

1. Verifica que el alta normalice datos, asigne servidor/tenant, guarde hash, nazca activa y activada, audite sin secretos y no genere códigos.
2. Rechaza actor sin permiso, nombre vacío y correo global duplicado sin crear cuenta ni auditoría parcial.
3. Fuerza un fallo de auditoría durante el alta y comprueba el rollback de la cuenta.
4. Desactiva y reactiva dos veces, comprobando un solo evento por transición, revocación permanente de sesiones y conservación de identidad.
5. Rechaza otro tenant y otro rol, y fuerza un fallo de auditoría para demostrar rollback conjunto de cuenta, sesiones y evento.

La primera ejecución funcional fue roja con 5/5 fallos porque `crearRecepcionista` y `reactivarRecepcionista` aún no existían. Después de implementar, la suite nueva quedó en 5/5. Una primera pasada e2e detectó que la ruta histórica de desactivación no propagaba el reloj inyectado; tras corregirlo, su suite aislada pasó 14/14 y la e2e completa pasó 79/79.

## Verificación final

- `npm run build`: correcto.
- `npm run lint`: correcto, sin diagnósticos.
- `npm test -- --runInBand`: 26 suites, 118 pruebas aprobadas.
- `npm run test:integration -- --runInBand`: 10 suites, 37 pruebas aprobadas.
- `npm run test:e2e -- --runInBand`: 7 suites, 79 pruebas aprobadas.

T76 y T81 quedan completadas. No se iniciaron T77–T79 ni T82–T85.
