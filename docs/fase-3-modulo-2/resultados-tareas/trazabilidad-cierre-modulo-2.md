# Trazabilidad de cierre — fase 3, módulo 2

La tabla enlaza los **doce criterios de finalización** de la [especificación](../spec-modulo-2.md) con pruebas ejecutadas en esta revisión y con obligaciones futuras explícitas. Los escenarios usan reloj controlado y, donde corresponde, MariaDB migrada desechable. El [resultado final de suites](resultados-t086-t091.md) conserva comandos y cifras. La [referencia de entrega](referencia-entrega-modulo-2.md) describe el contrato HTTP e interno.

| Criterio | Evidencia de esta revisión | Alcance y pendiente |
| --- | --- | --- |
| 1. Cada RF con evidencia u obligación | Matriz RF de abajo; [tareas T01–T18](../tareas.md), resultados T001–T085 de esta carpeta y [evidencia T031–T038](../evidencia-t031-t038.md). | RF-35–RF-36: colaboración interna, confirmación real diferida. RF-37: integración real diferida. |
| 2. Roles, aislamiento, oferta, licencia y 48 horas | [Contexto y seis estados](../../../test/fase-3-t026-t030.integration-spec.ts), [HTTP, sesión abierta y límite exacto](../../../test/fase-3-t062-t066.e2e-spec.ts). | Consulta privada del módulo 2. |
| 3. Valores iniciales y reglas de configuración | [Validador unitario](../../../src/disponibilidad/configuracion-agenda.validador.spec.ts), [reemplazo y carreras en BD](../../../test/fase-3-t020-t025.integration-spec.ts), [GET/PUT HTTP](../../../test/fase-3-t057-t061.e2e-spec.ts). | Sin escritura de configuración por Recepción. |
| 4. Duración, contigüidad, cortes y zona | [Proyección unitaria](../../../src/disponibilidad/proyeccion-atencion.spec.ts), [atención y DST](../../../test/fase-3-t031-t038.integration-spec.ts), [cabida](../../../test/fase-3-t044-t049.integration-spec.ts), [duración histórica](../../../test/fase-3-t080-t081.integration-spec.ts). | Citas guardadas solo como datos de prueba. |
| 5. Secuencia original tras ocupación 10:07 | [Anclaje unitario](../../../src/disponibilidad/proyeccion-atencion.spec.ts), [cálculo con fuentes reales](../../../test/fase-3-t044-t049.integration-spec.ts). | Se conserva el siguiente inicio 10:15. |
| 6. Grupos compactos independientes | [Selección unitaria](../../../src/disponibilidad/seleccion-compacta.spec.ts), [referencias y apartados](../../../test/fase-3-t050-t056.integration-spec.ts). | Incluye ambos lados, otro tramo y otro día. |
| 7. Primer inicio 10:45 | [Anticipación y anclaje](../../../test/fase-3-t044-t049.integration-spec.ts), [límites y modalidad](../../../test/fase-3-t050-t056.integration-spec.ts). | Ejemplo con 10:07 + 30 min y paso de 15 min. |
| 8. Estados de cita y apartado al vencimiento | [Ocupaciones con reloj](../../../test/fase-3-t039-t043.integration-spec.ts). | Una cita solo se libera al cancelar; apartado al liberar o al alcanzar exactamente `expiraEn`. |
| 9. Manual omite solo cuatro restricciones | [Manual y validación puntual](../../../test/fase-3-t050-t056.integration-spec.ts), [autorización HTTP](../../../test/fase-3-t062-t066.e2e-spec.ts). | Mantiene pasado, bloqueos, oferta y empalmes. |
| 10. Citas afectadas sin mutación | [Causas vigentes por HTTP](../../../test/fase-3-t067-t073.e2e-spec.ts), [duración histórica](../../../test/fase-3-t080-t081.integration-spec.ts). | No adelanta cancelación ni notificación. |
| 11. Vacío, inválido, denegado y fallo reintentable | [Entradas unitarias](../../../src/disponibilidad/disponibilidad-entradas.spec.ts), [respuestas 200/400/401/403/404/503/500](../../../test/fase-3-t062-t066.e2e-spec.ts). | Fallo técnico sin SQL, traza ni agenda parcial. |
| 12. Gates y límite de integración | [Resultados T086–T091](resultados-t086-t091.md), [contrato de escritores](contrato-escritores-t078-t079.md). | T18 y M2-I001–M2-I009 quedan pendientes de módulos 3/4. |

## Cobertura por RF

| RF locales | Evidencia principal | Estado |
| --- | --- | --- |
| RF-01–RF-07 | [Configuración íntegra](../../../test/fase-3-t020-t025.integration-spec.ts), [modelo migrado](../../../test/fase-3-t005-t010.integration-spec.ts). | Motor y persistencia verificados. |
| RF-08–RF-12 | [Contexto y oferta](../../../test/fase-3-t026-t030.integration-spec.ts), [roles/licencia HTTP](../../../test/fase-3-t062-t066.e2e-spec.ts). | Consulta privada verificada. |
| RF-13–RF-20 | [Atención](../../../test/fase-3-t031-t038.integration-spec.ts), [ocupación UTC e historia](../../../test/fase-3-t039-t043.integration-spec.ts), [duración](../../../test/fase-3-t080-t081.integration-spec.ts). | Cálculo y conservación verificados. |
| RF-21–RF-28 | [Proyección](../../../src/disponibilidad/proyeccion-atencion.spec.ts), [Ventana Libre](../../../test/fase-3-t044-t049.integration-spec.ts), [Agenda Compacta](../../../test/fase-3-t050-t056.integration-spec.ts). | Estrategias y límites verificados. |
| RF-29–RF-34 | [Manual](../../../test/fase-3-t050-t056.integration-spec.ts), [ocupaciones](../../../test/fase-3-t039-t043.integration-spec.ts), [validación HTTP](../../../test/fase-3-t062-t066.e2e-spec.ts). | Consulta y apartado vigente verificados. |
| RF-35–RF-36 | [Revalidación y apartado propio](../../../test/fase-3-t074-t077.integration-spec.ts), [protocolo](contrato-escritores-t078-t079.md). | Contrato probado; confirmación por escritor real pendiente. |
| RF-37 | [Protocolo y casos M2-I001–M2-I009](contrato-escritores-t078-t079.md). | Pendiente: escritores reales y dos conexiones sobre sus operaciones. |
| RF-38–RF-41 | [Causas sin mutar citas](../../../test/fase-3-t067-t073.e2e-spec.ts), [duración preservada](../../../test/fase-3-t080-t081.integration-spec.ts). | Identificación de afectaciones verificada. |
| RF-42–RF-45 | [Lectura coherente](../../../test/fase-3-t080-t081.integration-spec.ts), [errores y omisiones HTTP](../../../test/fase-3-t062-t066.e2e-spec.ts), [rango técnico](../../../src/disponibilidad/disponibilidad-entradas.spec.ts). | Contrato de consulta verificado. |

La [lista de tareas](../tareas.md) conserva M2-I001–M2-I009 sin marcar. Las pruebas de colaboración usan datos de citas y apartados sembrados; no acreditan confirmación, consumo, rollback ni exclusión mutua de escritores reales. La evidencia histórica de módulos anteriores se usa como regresión, no como prueba de funcionalidades nuevas de este módulo.

