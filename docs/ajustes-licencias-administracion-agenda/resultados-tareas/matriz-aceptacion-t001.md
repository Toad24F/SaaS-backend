# ALA-T001 — Matriz de aceptación inicial

Estado: **propuesta pendiente de aprobación**. Esta matriz prepara la trazabilidad; ninguna fila acredita que el RF esté implementado o probado. Los grupos T01–T16 son los escenarios previstos en el [plan](../plan.md), y los criterios 1–8 corresponden a la [especificación](../spec.md). A01–A08 son las áreas de responsabilidad del plan. La fila señala el grupo principal; otras pruebas transversales podrán añadirse al ejecutar cada RF.

## Flujo de uso

Para cada cambio, localizar el RF en esta tabla, consultar su área y el grupo de pruebas, ejecutar los casos nuevos y registrar el resultado en una evidencia de tarea. Solo entonces se podrá vincular esa evidencia al criterio de finalización. El criterio 1 exige además aprobación real y resultados verificables; esta matriz por sí sola no lo satisface. T15 verifica instalación y regresión de forma transversal. RF-63, T16 y M3-I001/M2-I004 permanecen diferidos hasta disponer del escritor manual real; un doble o la evidencia histórica del motor no los cierra.

| RF | Área | Grupo de prueba | Criterio | Estado y propósito principal |
| --- | --- | --- | --- | --- |
| RF-01 | A01 | T01 | 2 | Pendiente: avisos a 15 y 7 días. |
| RF-02 | A01 | T01 | 2 | Pendiente: recuperación sin acumulación. |
| RF-03 | A01 | T02 | 2 | Pendiente: plazo de suspensión. |
| RF-04 | A01 | T02 | 2 | Pendiente: impedir cambiar plazo pendiente. |
| RF-05 | A01 | T02 | 2 | Pendiente: aviso previo y efectivo. |
| RF-06 | A01 | T02 | 2 | Pendiente: suspensión inmediata. |
| RF-07 | A01 | T02 | 2 | Pendiente: límite exacto de acceso. |
| RF-08 | A01 | T02 | 2 | Pendiente: vencimiento natural prioritario. |
| RF-09 | A01 | T03 | 2 | Pendiente: fallo y reintento de correo. |
| RF-10 | A01 | T02 | 2 | Pendiente: revocación previa al bloqueo. |
| RF-11 | A01 | T02 | 2 | Pendiente: remanente y reactivación. |
| RF-12 | A01 | T03 | 2 | Pendiente: renovación y confirmación. |
| RF-13 | A01 | T03 | 2 | Pendiente: renovación no levanta suspensión. |
| RF-14 | A01 | T03 | 2 | Pendiente: descartar correos obsoletos. |
| RF-15 | A01 | T02, T03 | 2 | Pendiente: operaciones repetidas o concurrentes. |
| RF-16 | A02 | T04 | 3 | Pendiente: cupos iniciales 5/3. |
| RF-17 | A02 | T04 | 3 | Pendiente: permisos y valores de cupo. |
| RF-18 | A02 | T04 | 3 | Pendiente: consumo por rol y cuenta activa. |
| RF-19 | A02 | T04 | 3 | Pendiente: alta y activación sin excedente. |
| RF-20 | A02 | T04 | 3 | Pendiente: liberar y volver a exigir cupo. |
| RF-21 | A02 | T04 | 3 | Pendiente: reducción inválida. |
| RF-22 | A03 | T05 | 3 | Pendiente: inhabilitación recuperable. |
| RF-23 | A03 | T05 | 3 | Pendiente: consultas de inhabilitados. |
| RF-24 | A03 | T05 | 3 | Pendiente: distinguir inactivo. |
| RF-25 | A03 | T05 | 3 | Pendiente: revocar acceso inmediato. |
| RF-26 | A03 | T05 | 3 | Pendiente: preservar unicidad. |
| RF-27 | A03 | T05 | 3 | Pendiente: restaurar inactivo. |
| RF-28 | A03 | T06 | 6 | Pendiente: citas afectadas conservadas. |
| RF-29 | A03 | T06, T11 | 6 | Pendiente: rechazar reserva con oferta inhabilitada. |
| RF-30 | A03 | T05 | 3 | Pendiente: recuperar oferta válida de sucursal. |
| RF-31 | A03 | T05, T06 | 3 | Pendiente: repetición y autorización. |
| RF-32 | A04 | T07 | 4 | Pendiente: visibilidad inicial y global. |
| RF-33 | A04 | T07 | 4 | Pendiente: omitir importes públicos. |
| RF-34 | A04 | T07 | 4 | Pendiente: proyección vigente sin alterar historial. |
| RF-35 | A04 | T07, T11 | 4 | Pendiente: costo histórico y aceptación veraz. |
| RF-36 | A05 | T08 | 5 | Pendiente: retirar descansos incrustados. |
| RF-37 | A05 | T08 | 5 | Pendiente: retirar excepciones por fecha. |
| RF-38 | A05 | T08 | 5 | Pendiente: conservar bloqueos. |
| RF-39 | A05 | T08 | 5 | Pendiente: unir franjas compatibles. |
| RF-40 | A05 | T08 | 5 | Pendiente: separación configurable válida. |
| RF-41 | A05 | T08 | 5 | Pendiente: reemplazo atómico de configuración. |
| RF-42 | A05 | T08 | 5 | Pendiente: separación inicial cero. |
| RF-43 | A06 | T09 | 5 | Pendiente: intervalo protegido. |
| RF-44 | A06 | T09 | 6 | Pendiente: ocupación entre sucursales. |
| RF-45 | A06 | T09 | 5 | Pendiente: atención continua y separación completa. |
| RF-46 | A06 | T10 | 5 | Pendiente: redondeo del inicio. |
| RF-47 | A06 | T10 | 5 | Pendiente: anticipación y redondeo hacia arriba. |
| RF-48 | A06 | T10 | 5 | Pendiente: inicio posterior sin ocupación extra. |
| RF-49 | A06 | T10 | 5 | Pendiente: agenda libre desde cada espacio. |
| RF-50 | A06 | T10 | 5 | Pendiente: compacta entre tramos. |
| RF-51 | A06 | T10 | 5 | Pendiente: grupos y días independientes. |
| RF-52 | A06 | T10, T11 | 6 | Pendiente: siguiente inicio cuando se ocupa el primero. |
| RF-53 | A06 | T11 | 6 | Pendiente: consumir apartado aunque se libere uno anterior. |
| RF-54 | A06 | T09, T11 | 6 | Pendiente: conservar condiciones originales del apartado. |
| RF-55 | A06 | T06, T11 | 6 | Pendiente: revalidar licencia, oferta, atención y conflictos. |
| RF-56 | A07 | T12 | 7 | Pendiente: cupo por teléfono y sucursal. |
| RF-57 | A07 | T12 | 7 | Pendiente: excluir citas no futuras y apartados. |
| RF-58 | A07 | T12 | 7 | Pendiente: cupo independiente por sucursal. |
| RF-59 | A07 | T12 | 7 | Pendiente: carrera por último cupo. |
| RF-60 | A07 | T13 | 7 | Pendiente: corregir tras rechazo sin renovar apartado. |
| RF-61 | A07 | T12, T13 | 7 | Pendiente: mensaje de rechazo sin datos ajenos. |
| RF-62 | A07 | T12 | 7 | Pendiente: personas separadas con teléfono compartido. |
| RF-63 | A07 | T16 | 7 | Diferido: integración con escritor manual real. |
| RF-64 | A08 | T14, T15 | 8 | Pendiente: permisos y contratos HTTP. |
| RF-65 | A08 | T14, T15 | 8 | Pendiente: aislamiento y transacciones. |
| RF-66 | A08 | T13, T14 | 8 | Pendiente: repetición y recuperación sin nuevo consumo. |
| RF-67 | A08 | T14 | 8 | Pendiente: errores seguros y recuperación. |
| RF-68 | A08 | T07, T14 | 8 | Pendiente: recuperación y liberación propias con licencia bloqueada. |
| RF-69 | A08 | T14, T15 | 8 | Pendiente: auditoría y regresión. |

## Criterios de finalización

| Criterio | Flujo de comprobación pendiente |
| --- | --- |
| 1. Trazabilidad y aprobación | Aprobar fuentes, enlazar cada RF a caso ejecutado y resultado. |
| 2. Licencias y correos | Ejecutar T01–T03 con reloj, operaciones y transporte controlados. |
| 3. Cupos y recuperación | Ejecutar T04–T06 con roles, restauración y carreras. |
| 4. Precios y privacidad | Ejecutar T07 sobre todas las proyecciones públicas. |
| 5. Horarios y motor | Ejecutar T08–T10 en zonas, modos y límites. |
| 6. Apartados y carreras | Ejecutar T06, T09 y T11 con filas finales verificadas. |
| 7. Cupo telefónico | Ejecutar T12–T13; T16 permanece diferido. |
| 8. Calidad y límites | Ejecutar T14–T15, compilación, lint y suites pertinentes. |

Los resultados de implementación se añadirán en evidencias posteriores; el test de esta tarea comprueba la estructura de la matriz, no el comportamiento del backend.
