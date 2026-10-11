# Fase 3: Constitución del Módulo 2 - Motor Inteligente de Disponibilidad y Reglas de Agenda

Constitución aprobada. Alcance: implementar el motor y preparar su uso posterior por los módulos 3 y 4; sus interfaces, endpoints de reservas y gestión, y flujos completos quedan para sus respectivas fases.

1. **Stack:** usar NestJS, TypeScript, TypeORM y MariaDB/MySQL; mantener la lógica de disponibilidad en servicios del backend.
2. **Aislamiento:** toda consulta y operación debe validar `negocio_id`, pertenencia de recursos y permisos correspondientes.
3. **Base del módulo 1:** calcular disponibilidad con servicios activos, duración, asignaciones por sucursal, jornadas, descansos y bloqueos.
4. **Horarios válidos:** ofrecer únicamente intervalos completos que quepan en la jornada y no se empalmen con citas ni apartados vigentes.
5. **Cruce de sucursales:** impedir que un profesional tenga horarios o citas superpuestos entre ubicaciones.
6. **Modos configurables:** implementar ventana libre y agenda compacta, definiendo reglas verificables para el primer espacio, contigüidad y avance al siguiente día hábil.
7. **Integración con módulo 3:** preparar el motor para considerar apartados temporales y validar disponibilidad dentro de una transacción; la creación de apartados y la confirmación de reservas se implementarán en el módulo 3.
8. **Integración con módulo 4:** exponer servicios internos reutilizables para el futuro agendamiento manual y definir qué estados de cita ocupan o liberan disponibilidad; el calendario, los cambios de estado y sus endpoints se implementarán en el módulo 4.
9. **Calidad:** validar entradas, manejar fechas con la zona horaria del negocio y exigir compilación, lint y pruebas relevantes exitosas.
10. **Tests:** cubrir ambos modos, límites de jornada, descansos, bloqueos, vencimientos de apartados, aislamiento y validación transaccional ante concurrencia mediante pruebas unitarias y de integración del motor.
11. **Límites:** excluir pagos, WhatsApp y reportes del motor; conservar puntos de integración para el módulo 5 sin duplicar reglas de agenda.
