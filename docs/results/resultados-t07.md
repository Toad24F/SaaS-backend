# Evidencia de T07: módulos y dependencias

RF referenciados: **RF-01–40 como soporte estructural**, sin declarar implementadas sus funciones.

Se escribió primero `src/modulos.spec.ts`. La ejecución inicial falló por los módulos ausentes. Después de declararlos, la prueba de composición detectó que Auth dependía implícitamente de la configuración global; se añadió su importación explícita de ConfigModule.

## Estructura incorporada

- Auth importa Usuarios, Licencias, Codigos y Auditoria, además de sus dependencias técnicas existentes.
- Altas importa Usuarios, Negocios, Licencias, Codigos y Auditoria.
- Licencias y Codigos importan Auditoria.
- Usuarios y Negocios no dependen de los coordinadores; Auditoria no depende de otros módulos de dominio.
- AppModule incorpora Altas junto con Auth. Los módulos nuevos son declaraciones sin operaciones, controladores ni servicios ficticios.

Las tres pruebas nuevas verifican que Nest compone los siete módulos y resuelve los servicios existentes con repositorios sustituidos, que no hay ciclos (incluidos enlaces mediante forwardRef) y que se conserva la dirección de las dependencias. La prueba HTTP existente comprueba además el arranque real de la aplicación con la base de pruebas y sin sincronización del esquema.

## Resultados

| Verificación | Resultado |
|---|---|
| `npm test -- --runInBand` | 9 suites, 48 pruebas aprobadas; 3 nuevas. |
| `npm run test:e2e -- --runInBand --detectOpenHandles` | 1 suite, 1 prueba aprobada, sin recursos abiertos detectados. |
| `npm run build` | Aprobado. |
| `npm run lint` | Aprobado. |
| `npx tsc --noEmit --incremental false` | Aprobado tras corregir el tipo del listado de módulos en la prueba. |

**T07 puede marcarse manualmente como hecha.** No se modificó su casilla, no se inició T08 y no se movieron entidades ni se alteraron tablas o datos. Las entidades y operaciones de cada módulo se incorporarán en las tareas correspondientes.
