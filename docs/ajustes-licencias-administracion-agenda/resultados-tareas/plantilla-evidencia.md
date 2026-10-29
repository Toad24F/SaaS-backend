# Plantilla de evidencia — ALA-Tn

> Copiar este archivo para una tarea concreta. La plantilla no acredita por sí misma una tarea ni una funcionalidad. Completar cada campo con datos observados, sin secretos ni información personal de prueba.

## Identificación

- **Revisión:** commit base y estado de cambios evaluados.
- **Tarea y RF:** identificador ALA-Tn, RF locales y dependencia ya satisfecha.
- **Archivos afectados:** ruta y explicación breve de qué hace cada archivo nuevo o modificado.
- **Tipo:** Preparación documental / infraestructura de prueba / Funcionalidad acreditada. Elegir solo lo demostrado.

## Flujo realizado

Explicar en orden la entrada, las decisiones y la salida. Para un cambio documental, describir cómo se usa la fuente y qué permanece pendiente. Para una función, identificar validaciones, transacción y resultado observable; señalar límites de la comprobación.

## Comprobación

| Comando o comprobación | Entorno no secreto | Resultado y código de salida | Pruebas ejecutadas / fallidas / omitidas |
| --- | --- | --- | --- |
| Escribir comando exacto | Base desechable identificada como test, si aplica | Observación real | Cantidades reales |

Registrar el fallo inicial de tests primero cuando corresponda y el resultado después del cambio. Para carreras, anotar dos conexiones, barrera, orden y filas finales. Una base no disponible o una prueba omitida no se presenta como éxito.

## Cobertura y pendientes

| RF | Caso nuevo o directamente relacionado | Resultado observado | Criterio de finalización |
| --- | --- | --- | --- |
| RF-XX | Nombre de prueba o inspección | Aprobado / fallido / pendiente | Número 1–8 |

- **Pruebas omitidas:** ninguna, o explicar cada omisión y su causa.
- **Pendientes:** dependencias, fallos, RF no acreditados, integración manual diferida y acción necesaria.
- **Funcionalidad acreditada:** enumerar solo la verificada con el escritor o lector real. Si la tarea es Preparación documental, escribir «ninguna».

Marcar la casilla de `tareas.md` únicamente cuando su «Hecho cuando:» esté probado. Los RF-63/M3-I001/M2-I004 requieren el escritor manual real y permanecen diferidos hasta entonces.
