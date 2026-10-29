# Ajuste del catálogo público opcional

## Cambio

- `/catalogo` proyecta `descripcion` del servicio y `especialidad` del Profesional cuando tienen valor.
- `negocio.categoria` es opcional. `negocio.telefono` y `sucursales[].telefono` e `indicaciones` solo se publican cuando `mostrar_contacto_publico=1` en el negocio. El valor inicial es 0.
- El Administrador del negocio controla la publicación y puede configurar categoría y teléfono con `PATCH /negocios/publicacion-catalogo`. Los datos se aíslan con el `negocioId` de su sesión.
- Migración aditiva `1760000033000-DatosPublicosCatalogo` y esquema de instalación limpia actualizados.

## Verificación del 21 de octubre de 2026

- Se añadió primero una prueba de integración HTTP para la proyección, los filtros y el apagado de la autorización.
- `npm run build`: correcto.
- `npm run lint`: correcto.
- `npm test -- --runInBand`: 74 suites y 370 pruebas correctas; 3 pruebas del servidor HTTP local no pudieron abrir puertos (`EACCES`).
- `npm run test:integration -- --runInBand fase-4-t041-t044`: bloqueado al conectar a MariaDB de prueba (`EACCES` en localhost:3306).
- `npm run test:e2e -- --runInBand fase-4-t080-t085`: mismo bloqueo de conexión a MariaDB.

Queda pendiente ejecutar las pruebas con acceso a la base desechable y puertos locales antes de acreditar este ajuste en HTTP. No se modifica el estado de las tareas M3.
