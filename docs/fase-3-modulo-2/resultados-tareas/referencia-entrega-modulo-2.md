# Referencia de entrega — motor de disponibilidad, fase 3 módulo 2

Esta referencia describe lo entregado para **consulta privada**. La [especificación](../spec-modulo-2.md) y el [plan](../plan.md) fijan las reglas; la [evidencia de cierre](resultados-t086-t091.md) registra la revisión comprobada. No existe consulta anónima, escritor real de citas/apartados ni garantía de reserva.

## Acceso, flujo y reglas

Las cinco rutas requieren JWT vigente y licencia con acceso. Administrador y Recepción pueden consultar la disponibilidad operativa del negocio; el Profesional solo puede consultar su propio perfil. Solo el Administrador lee o reemplaza la configuración. Los IDs se comprueban contra el negocio de la sesión, nunca contra un `negocioId` aportado por el cliente. Una referencia ajena se trata como inexistente.

El flujo de consulta es **sesión y licencia actuales → autorización del Profesional → una transacción `REPEATABLE READ` y un instante del reloj → configuración, oferta, horario y ocupaciones del mismo negocio → cálculo de ranuras en UTC → respuesta privada**. La zona IANA de la sucursal determina fechas y recurrencias locales. Las horas explícitas ambiguas o inexistentes se rechazan; las recurrencias afectadas se omiten con motivo. La ocupación del Profesional incluye citas no canceladas y apartados vigentes de todas sus sucursales y servicios. Una cita conserva el inicio, fin y zona originales al editar después la duración del catálogo.

Sin una fila de configuración se aplican **Ventana Libre, intervalo de 15 minutos, anticipación de 15 minutos y horizonte de 60 días**. La escritura reemplaza atómicamente los cuatro valores. Solo se admiten intervalos 5, 10, 15, 20, 30 o 60; anticipación no negativa en múltiplos de 5 y horizonte entero no negativo. Cada `GET` acepta como máximo **31 fechas inclusivas**; ese límite técnico no reduce el horizonte configurado y se pueden consultar ventanas sucesivas.

`modalidad=publica` aplica intervalo, estrategia, anticipación y horizonte, pero **sigue siendo una consulta autenticada**. `modalidad=manual` omite solo esas cuatro restricciones comerciales: conserva licencia, permisos, oferta, atención, duración completa, bloqueos, empalmes y rechazo de inicios pasados. Los extremos de intervalos contiguos son válidos.

## Rutas privadas

| Ruta | Roles | Entrada y respuesta |
| --- | --- | --- |
| `GET /disponibilidad/configuracion` | Administrador | Devuelve los cuatro valores efectivos, incluso cuando aún no existe fila. |
| `PUT /disponibilidad/configuracion` | Administrador | Cuerpo completo `{ "modo": "ventana_libre", "intervaloMinutos": 15, "anticipacionMinutos": 15, "diasFuturos": 60 }`. Reemplaza el conjunto y audita un cambio real. |
| `GET /disponibilidad` | Administrador, Recepción, Profesional propio | Query obligatoria `personalId`, `sucursalId`, `servicioId`, `desde`, `hasta`; `modalidad` opcional (`publica` por defecto). Los IDs de query son enteros positivos escritos como texto. Devuelve reglas efectivas, `calculadoEn`, zona, `ranuras` con inicio/fin UTC y `omisiones` justificadas. |
| `POST /disponibilidad/validar` | Administrador, Recepción, Profesional propio | Cuerpo con IDs numéricos positivos, `fechaLocal`, `horaInicio` (`HH:mm`) y modalidad opcional. Devuelve `valido`, intervalo UTC, zona, modalidad y `motivos`; una negativa funcional responde 200 sin escritura. |
| `GET /disponibilidad/citas-afectadas` | Administrador, Recepción, Profesional propio | Query obligatoria `desde`, `hasta`; filtros opcionales `personalId` y `sucursalId`. Identifica causas operativas vigentes de citas no canceladas sin modificar la cita ni exponer datos del cliente. |

Las fechas de query y cuerpo usan `YYYY-MM-DD` local. `GET /disponibilidad` y `GET /disponibilidad/citas-afectadas` aceptan hasta 31 fechas contando ambos extremos. Los cuerpos y queries rechazan campos ajenos, incluidos `negocioId`, `apartadoId`, `titularHash` y cualquier solicitud de exclusión de apartado. Un apartado propio solo puede comprobarse mediante el contrato interno del [futuro escritor](contrato-escritores-t078-t079.md).

## Resultados y errores

| HTTP | Significado |
| --- | --- |
| 200 | Consulta correcta, aunque `ranuras` sea vacía; validación puntual positiva o negativa. |
| 400 | Campo, ID, fecha, rango, modalidad u hora local explícita inválidos. |
| 401 | Falta sesión válida, o el acceso de la licencia ya se niega por vencimiento o suspensión. |
| 403 | Rol sin permiso o Profesional intentando acceder a otro perfil propio del mismo negocio. |
| 404 | Recurso inexistente o ajeno al negocio, con error uniforme. |
| 503 | Fallo técnico temporal de consulta, apto para reintento. |
| 500 | Fallo inesperado; la respuesta no incluye SQL, trazas ni resultados parciales. |

La consulta y la validación **no reservan** ni convierten una ranura en compromiso. `MotorDisponibilidadService.revalidarEnTransaccion` prepara una relectura interna con el manager del futuro escritor y puede excluir únicamente un apartado propio comprobado. Los futuros módulos 3/4 deberán bloquear una fila común del Profesional, releer tras esperar, consumir el apartado e insertar la cita atómicamente, y devolver 409 ante conflicto. **RF-35–RF-36 solo cuentan con pruebas de colaboración; RF-37 y M2-I001–M2-I009 siguen pendientes de integración con escritores reales.**

