# Resultados T45 — login, perfil y logout HTTP

Fecha: 2026-09-12.

## Trabajo realizado por archivo

- **`src/auth/auth.controller.ts` (modificado):** conserva `POST /auth/login` y `GET /auth/profile`; agrega `POST /auth/logout`, que revoca la sesión autenticada y devuelve 204 sin cuerpo. Los identificadores provienen del token validado.
- **`src/auth/guards/jwt-logout.guard.ts` (nuevo):** selecciona la estrategia exclusiva de cierre de sesión. No se utiliza para obtener acceso al perfil ni a otras operaciones.
- **`src/auth/strategies/jwt-logout.strategy.ts` (nuevo):** comprueba firma y expiración JWT mediante Passport y verifica en MariaDB que la sesión pertenece al usuario, sigue vigente y no está revocada. Permite cerrar sesión aun con licencia suspendida o vencida.
- **`src/auth/auth.module.ts` (modificado):** registra el Guard y la estrategia de logout con los servicios existentes.
- **`src/auth/dto/login.dto.ts` (modificado):** conserva validación del correo, tipo de contraseña y campos obligatorios; retira el mínimo de seis caracteres del login para que una contraseña corta incorrecta reciba el mismo 401 de credenciales. La política de al menos doce caracteres para establecer contraseñas permanece en su servicio.
- **`src/auth/auth.controller.spec.ts` (modificado):** adapta el montaje unitario para aislar también el nuevo Guard; mantiene las pruebas de composición y delegación de login. La seguridad del Guard se comprueba con peticiones HTTP reales en la suite nueva.
- **`test/auth-t45.e2e-spec.ts` (nuevo):** agrega diez pruebas HTTP con AppModule, Guards, servicios y persistencia reales sobre una base MariaDB nueva y desechable por caso. Usa las mismas opciones de ValidationPipe que producción y un reloj de dominio controlado; cierra la aplicación y limpia la base en los bloques de finalización.
- **`docs/tareas-auth.md` (actualizado al cerrar):** registra T45 y enlaza esta evidencia.

Los bloques añadidos incluyen comentarios sobre validación de sesión, excepción comercial de logout, validación del DTO, aislamiento de pruebas y vencimiento controlado. No hubo cambios de entidades, migraciones ni SQL.

## Tests primero y correcciones

Se escribió la suite HTTP antes de modificar producción. Durante su preparación se corrigieron el contacto obligatorio del negocio y el nombre del método de hash. La fase roja funcional produjo **5 fallos y 5 aciertos**: logout devolvía 404 y la contraseña corta incorrecta producía 400 en lugar de 401.

Después de implementar se ajustó el montaje unitario para el nuevo Guard y se corrigió el dato de prueba de cuenta pendiente para cumplir la restricción SQL (sin nombre ni hash). No se relajaron restricciones de persistencia ni se sustituyeron Guards en las pruebas HTTP.

## Cobertura de las diez pruebas HTTP

1. Login y perfil con listas explícitas de campos públicos, ausencia de hash en respuestas y JWT; logout persistido, rechazo de reutilización y conservación de otra sesión.
2. Cuerpo vacío: 400 y ninguna sesión creada.
3. Correo inválido: 400 y ninguna sesión creada.
4. Contraseña de tipo incorrecto: 400 y ninguna sesión creada.
5. Campo extra `negocioId`: 400 y ninguna sesión creada.
6. Mismo cuerpo de error 401 para correo desconocido, contraseña incorrecta (incluida una corta), cuenta inactiva y cuenta pendiente.
7. Cinco intentos permitidos, sexto bloqueado con 429, bloqueo todavía activo a los 59.999 segundos y desbloqueo exacto al minuto sin prolongación.
8. Perfil bloqueado por licencia suspendida; logout permitido y posterior reutilización rechazada.
9. Perfil bloqueado por licencia vencida; logout permitido y posterior reutilización rechazada.
10. Rechazo de JWT ausente, adulterado y expirado en ambas rutas; perfil permitido un milisegundo antes de la hora y rechazo de perfil/logout al vencer la sesión persistida exactamente.

## Verificación final

```text
npm run build
Resultado: correcto (salida 0)

npm run lint
Resultado: correcto (salida 0)

npm test -- --runInBand
Test Suites: 25 passed, 25 total
Tests:       116 passed, 116 total

npm run test:integration -- --runInBand --detectOpenHandles
Test Suites: 9 passed, 9 total
Tests:       35 passed, 35 total

npm run test:e2e -- --runInBand --detectOpenHandles
Test Suites: 2 passed, 2 total
Tests:       11 passed, 11 total
```

Total: **36 suites y 162 pruebas aprobadas**, sin fallos ni omisiones. Los ejecutores de integración y HTTP finalizaron sin reportar recursos abiertos. Node emitió el aviso ya existente de VM Modules experimental; no impidió ninguna verificación.

**T45 completada.** No se inició T46 ni otra tarea posterior. Se conservaron los cambios previos del repositorio y se usaron exclusivamente bases de prueba; el bloqueo de reservas reales continúa fuera del alcance de esta tarea.
