# M3-T001 — Matriz de aceptación inicial

Revisión: lote M3-T001–T007. Los grupos T01–T12 son los escenarios del [plan](../plan.md), no tareas terminadas. «Preparado» significa que hay contrato o infraestructura de prueba, no evidencia funcional del portal. La demo no cuenta como evidencia. Los casos históricos de fase 3 son antecedentes del motor y deben repetirse por la entrada pública real cuando exista.

| RF | Grupo de aceptación | Evidencia nueva de este lote y pendiente |
| --- | --- | --- |
| 01 | T01, T12 | Contrato de módulo; falta flujo anónimo HTTP y navegador. |
| 02 | T01, T10, T11 | Fixture de dos negocios; falta aislamiento de API y escritores. |
| 03 | T01, T11 | Contrato de acceso; falta cambio de licencia durante el flujo. |
| 04 | T01, T02, T11 | Fixture de oferta; falta catálogo y revalidación pública. |
| 05 | T02, T12 | Pendiente interfaz y recorrido. |
| 06 | T02, T12 | Pendiente invalidación de selecciones. |
| 07 | T02, T12 | Pendiente teclado y móvil reales. |
| 08 | T03, T12 | Pendiente formulario y validación. |
| 09 | T03 | Pendiente normalización de teléfono. |
| 10 | T03, T12 | Pendiente errores de campo y conservación. |
| 11 | T01, T03 | Contrato sin cuenta; falta flujo sin código. |
| 12 | T03, T07, T10 | Fixture comparte teléfono entre negocios; falta reserva de personas distintas. |
| 13 | T01, T03 | Contrato de salida reducido; falta prueba de no divulgación. |
| 14 | T04, T11 | Contrato del motor privado preservado; falta entrada pública. |
| 15 | T04, T12 | Fixture con dos zonas; falta cálculo y presentación pública. |
| 16 | T02, T04, T12 | Pendiente vacío legítimo y navegación. |
| 17 | T02, T04, T12 | Pendiente error técnico sin ranuras parciales. |
| 18 | T04, T05, T11 | Pendiente revalidar antes de apartado. |
| 19 | T05, T12 | Reloj controlable; falta apartado real y contador. |
| 20 | T04, T05, T10, T11 | Fixture de ocupaciones; falta escritor y carrera. |
| 21 | T05, T11 | Reloj controlable; falta demostrar plazo fijo. |
| 22 | T05, T11 | Prueba de reloj en límite; falta rechazo del escritor. |
| 23 | T05, T12 | Pendiente vencimiento en formulario. |
| 24 | T06, T12 | Pendiente liberación al volver. |
| 25 | T01, T06, T11 | Barrera de dos conexiones; falta reemplazo real. |
| 26 | T06, T12 | Pendiente generación vieja entre pestañas. |
| 27 | T05, T06, T12 | Pendiente liberación por salida y vencimiento. |
| 28 | T06, T09, T12 | Pendiente recarga normal e incierta. |
| 29 | T01, T06, T10 | Contrato separa sesión y selección; falta propiedad real. |
| 30 | T07, T10, T11 | Pendiente precio al conceder y cambio de catálogo. |
| 31 | T05, T07, T08, T11 | Pendiente revalidación del escritor real. |
| 32 | T04, T07, T11, T12 | Pendiente incompatibilidad posterior y datos conservados. |
| 33 | T06, T11 | Barrera disponible; falta carrera de apartados/reservas. |
| 34 | T08, T12 | Tipo de salida pendiente; falta cita y consumo atómico. |
| 35 | T08, T09, T11 | Inyector de fallo y rollback probados; falta escritor real. |
| 36 | T03, T07, T10 | Pendiente snapshot histórico de cita. |
| 37 | T07, T12 | Tipo de resumen pendiente; falta folio y UI. |
| 38 | T08 | Contrato inicial pendiente; falta ocupación duradera. |
| 39 | T09, T10 | Pendiente repetición idempotente real. |
| 40 | T09, T11, T12 | Pendiente recuperación tras respuesta perdida. |
| 41 | T09, T11, T12 | Pendiente resolución antes de reiniciar. |
| 42 | T01, T09, T12 | Contrato de contexto interno; falta prueba de propiedad. |
| 43 | T01–T12 | Pendiente errores seguros en el recorrido completo. |

## Ocho criterios de finalización

| Criterio de [spec](../spec.md) | Grupos y estado en este lote |
| --- | --- |
| 1. Evidencia propia de RF-01–RF-43 | Matriz creada; solo infraestructura T001–T007, cierre en M3-T136. |
| 2. Flujo móvil y teclado | T02, T03, T12 pendientes. |
| 3. Aislamiento, propiedad y licencia | T01, T10, T11: fixture preparado; pruebas funcionales pendientes. |
| 4. Cinco minutos, reemplazo y abandono | T05, T06, T12: reloj preparado; escritor pendiente. |
| 5. Teléfonos, nombre y costo | T03, T07, T10 pendientes. |
| 6. Concurrencia, duplicados y recuperación | T08, T09, T11: barrera preparada; escritores pendientes. |
| 7. Cita pendiente y resumen | T08, T12: tipo declarado; implementación pendiente. |
| 8. Build, lint, pruebas e integración diferida | Ver [resultado del lote](resultado-t001-t007.md); M2-I004/M3-I001 diferido al escritor manual real. |

**Antecedentes separados:** las cinco rutas privadas y el motor de fase 3 tienen pruebas históricas. No acreditan RF públicos ni las verificaciones M2-I001–M2-I009. M2-I004 se ejecutará con el escritor manual del módulo 4; un doble de prueba no lo sustituye.
