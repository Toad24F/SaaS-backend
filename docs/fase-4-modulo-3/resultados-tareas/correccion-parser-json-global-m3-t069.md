# Corrección de la regresión del parser JSON global de M3-T069

Fecha de diagnóstico y corrección: 20 de octubre de 2026.

## Resumen

La rama `modulo-3` dejó de interpretar cuerpos JSON fuera de
`/publico/negocios`. Como consecuencia, `POST /auth/login` entregaba un objeto
vacío al `LoginDto`, aunque Postman enviara correctamente `email` y `password`
con `Content-Type: application/json`.

La regresión se originó al implementar el límite de 32 KiB del portal público.
La corrección conserva ese límite y restablece el parser JSON global de Nest;
no elimina ni revierte la funcionalidad del módulo 3.

## Commit que introdujo la regresión

- Commit completo: `26550590518535a7fe1149e74700b6b3abe6b4b9`.
- Commit abreviado: `2655059`.
- Fecha: 19 de octubre de 2026, 14:09:30, zona `-07:00`.
- Mensaje: `feat: implementar validación y huella para contacto de reservas, limitar tamaño de JSON y registrar intentos`.
- Tarea asociada: M3-T069, validación del contacto y límite del cuerpo a
  32 KiB.

Ese commit añadió `instalarLimiteCuerpoPublico(app)` en `src/main.ts` y registró
directamente el siguiente parser de Express:

```ts
app.use('/publico/negocios', json({ limit: 32 * 1024 }));
```

El objetivo era correcto: medir y rechazar el JSON crudo del portal cuando
superara 32 KiB, incluidos espacios y claves repetidas. El defecto estuvo en la
interacción de ese registro con la inicialización posterior de Nest.

## Cómo funcionaba el error

1. `NestFactory.create(AppModule)` construía la aplicación, pero el registro de
   los parsers globales de Nest todavía no había terminado.
2. `instalarLimiteCuerpoPublico(app)` registraba antes un `express.json()`
   limitado a `/publico/negocios`.
3. La función creada por Express tiene internamente el nombre `jsonParser`.
4. Al inicializarse durante `app.listen()`, el adaptador Express de Nest buscaba
   en la pila de middlewares si ya existía una función llamada `jsonParser`.
   Esa detección examina el nombre de la función, pero no distingue que el
   parser encontrado solo está montado bajo `/publico/negocios`.
5. Nest concluía incorrectamente que el parser JSON global ya estaba instalado
   y omitía registrar el suyo.
6. Las rutas públicas sí podían leer JSON porque coincidían con el parser
   acotado. Las demás rutas, incluida `/auth/login`, recibían el cuerpo sin
   interpretar.
7. El `ValidationPipe` validaba entonces `email` y `password` como valores
   ausentes. Por eso la respuesta contenía simultáneamente los mensajes de
   correo obligatorio, correo inválido, contraseña obligatoria y contraseña no
   textual.

El DTO, el controlador y el servicio de autenticación no habían cambiado. El
fallo ocurría antes de que el cuerpo llegara a esa lógica.

## Por qué funcionaba en `Modulo-2`

En la rama `Modulo-2`, `src/main.ts` no registraba ningún `express.json()` antes
de la inicialización de Nest. Nest instalaba normalmente su parser JSON global,
por lo que `/auth/login` recibía las credenciales.

`Modulo-2` tampoco implementaba el límite específico de 32 KiB requerido para
el portal del módulo 3. Volver literalmente a esa configuración habría
recuperado el login, pero habría eliminado un requisito vigente de M3-T069.

## Modificación aplicada

En `src/reservas-publicas/limite-cuerpo-publico.ts` se mantuvo el parser de
32 KiB, pero se registró mediante una función envolvente con un nombre distinto:

```ts
const analizarJsonPublico = json({ limit: 32 * 1024 });
const limitarJsonPublico: RequestHandler = (req, res, next) =>
  analizarJsonPublico(req, res, next);
app.use('/publico/negocios', limitarJsonPublico);
```

Nest ya no confunde este middleware acotado con su `jsonParser` global y, al
inicializarse, registra también el parser general. Para una ruta pública, el
parser de 32 KiB se ejecuta primero y conserva el error público previsto ante un
exceso. Para una ruta no pública, como `/auth/login`, se ejecuta el parser global
de Nest.

No se modificaron:

- `LoginDto` ni sus validaciones;
- `AuthController` ni `AuthService`;
- el contrato HTTP de autenticación;
- el límite público de 32 KiB;
- la respuesta pública específica para un cuerpo excesivo.

## Diferencia respecto de dejarlo como antes del módulo 3

| Estado | Parser global de Nest | Límite público de 32 KiB |
| --- | --- | --- |
| `Modulo-2` | Sí | No |
| M3 después de `2655059`, antes de la corrección | No, se omitía por error | Sí |
| M3 corregido | Sí | Sí |

Por tanto, la corrección no dejó el arranque exactamente como estaba antes del
módulo 3. Conservó la nueva protección del portal y recuperó el comportamiento
global que ya existía.

## Por qué las pruebas anteriores no lo detectaron

La prueba original de `limite-cuerpo-publico.spec.ts` montaba el middleware en
una aplicación Express mínima. Verificaba correctamente el límite exacto y el
rechazo por exceso, pero no inicializaba Nest después del parser acotado. Por
ello no ejercía la detección por nombre que omitía el parser global.

Las suites e2e existentes crean sus aplicaciones con
`createNestApplication()` y configuran sus tuberías dentro de cada prueba; no
ejecutan la función `bootstrap()` de `src/main.ts`. Así, las pruebas de login
seguían teniendo el parser global aunque el arranque real estuviera afectado.

Se añadió una regresión que instala el límite público antes de `app.init()`, tal
como ocurre en producción, y comprueba en la misma aplicación:

- que una ruta equivalente a `/auth/login` recibe su JSON;
- que una ruta de `/publico/negocios` también recibe su JSON;
- que permanecen las pruebas del límite exacto y del exceso de 32 KiB.

## Verificación de la corrección

| Comando | Resultado |
| --- | --- |
| `npm test -- --runInBand src/reservas-publicas/limite-cuerpo-publico.spec.ts` | 1 suite y 3 pruebas aprobadas. |
| `npm run build` | Aprobado. |
| `npm run lint` | Aprobado. |
| `git diff --check` | Aprobado, sin errores de espacios. |

Al redactar esta evidencia, la corrección está aplicada en el árbol de trabajo
de `modulo-3`, pero todavía no tiene un commit propio. No debe atribuirse un hash
de corrección hasta que ese commit exista.
