# Revisión del teléfono internacional del portal — 2026-11-27

## Cambio revisado

La entrada pública, la ficha de cliente y el snapshot de cita aceptan los destinos enumerados en el [contrato](../../telefonos-internacionales-portal.md). México conserva diez dígitos; los demás destinos usan E.164. El portal conectado y la demo incluyen selector y muestran la etiqueta «Teléfono». Los envíos de WhatsApp forman el destino desde el valor normalizado, sin añadir `+52` a números extranjeros. El transporte real de Meta no se probó en esta revisión.

## Verificaciones

- `npm run build` — correcto.
- `npm run lint` — correcto.
- `npm test -- --runInBand --silent` — 111 suites, 719 pruebas correctas.
- `npm run test:integration -- --runInBand test/telefonos-internacionales.integration-spec.ts` — 1 prueba correcta, base desechable `citas_test_telefonos_<uuid>`.
- `npm run test:e2e -- --runInBand test/fase-4-t080-t085.e2e-spec.ts --testNamePattern="registra un teléfono estadounidense"` — 1 prueba correcta, base desechable; las demás del archivo se omitieron por el filtro.
- Frontend: `npm test` — 321 pruebas correctas; `npm run build` — correcto; `node tests/portal.flujo-navegador.mjs` y `node tests/portal.navegacion-navegador.mjs` — correctos con servidor simulado. Capturas de escritorio y móvil, tema claro y oscuro; la segunda prueba incluyó teléfono de Estados Unidos en la demo.
- `git diff --check` en ambos repositorios — correcto.

## Aplicación local

Antes de migrar la base cotidiana se generó `db/respaldo-antes-telefonos-20261127-030051.sql` (1 079 585 bytes). `npm run migration:run` aplicó `TelefonosInternacionales1760000069000`. Una consulta posterior confirmó esa entrada en `migrations` y longitud 16 para `clientes.telefono` y `citas.telefono_contacto`. El respaldo contiene datos operativos y permanece fuera del control de versiones.

No se cambiaron las casillas históricas del módulo ni se declaró cerrada su fase. Para uso real de WhatsApp queda verificar consentimiento, plantillas, idioma, destino y acuses con números autorizados.
