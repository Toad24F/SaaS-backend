# Especificación — Ajustes del módulo 1

## Objetivo y relación con lo existente

Permitir que cada Profesional describa su especialidad, amplíe el catálogo de servicios de su negocio y decida qué servicios presta en cada sucursal asignada. Estas decisiones individuales deben poder cambiar sin alterar los estados globales ni la oferta de otras personas.

Esta especificación complementa la [constitución del fix](constitucion.md) y sustituye únicamente las reglas incompatibles de la [especificación anterior del módulo 1](../fase-2-modulo-1/spec-modulo-1.md), en particular la prohibición de que el Profesional cambie el catálogo general y la oferta de servicios sin selección por sucursal. Los identificadores RF-01 a RF-10 son locales a este documento. La documentación y las pruebas anteriores describen o acreditan solo el comportamiento previo; no demuestran estos requisitos nuevos.

## Requisitos funcionales en EARS

### Perfil y catálogo

- **RF-01.** Cuando se registre un Profesional nuevo, el sistema deberá exigir una especialidad no vacía. Cuando se edite un perfil anterior sin especialidad, el sistema deberá exigirla; mientras no se edite, podrá permanecer vacía. **Por qué:** identificar su área de atención sin invalidar perfiles existentes.
- **RF-02.** Cuando se cree o edite un servicio, el sistema deberá admitir una descripción opcional y conservarla para su consulta. **Por qué:** explicar qué incluye el servicio sin exigir completar el catálogo existente.
- **RF-03.** Cuando un Profesional cree un servicio, el sistema deberá incorporarlo al catálogo de su negocio y asignarlo automáticamente solo a su perfil, sin asignarlo a otros profesionales. **Por qué:** permitirle ampliar su oferta sin modificar la de sus compañeros.
- **RF-04.** Cuando se editen el nombre, costo, duración o descripción de un servicio, el sistema deberá permitirlo al administrador del negocio o al Profesional que lo creó y denegarlo a los demás profesionales. **Por qué:** permitir corregir un servicio creado por su autor, protegiendo los datos compartidos del catálogo.

### Oferta individual y sucursales

- **RF-05.** Cuando el administrador o el propio Profesional active o desactive un servicio para ese perfil, el sistema deberá cambiar únicamente su oferta individual, sin modificar el estado global del servicio ni la selección de otros profesionales. **Por qué:** separar la decisión de atender un servicio de la disponibilidad del catálogo para todo el negocio.
- **RF-06.** Cuando el administrador o el propio Profesional active o desactive la atención de ese perfil en una sucursal asignada, el sistema deberá cambiar únicamente su estado individual, sin desactivar la sucursal para el negocio ni modificar su cupo. **Por qué:** permitir elegir dónde atiende sin afectar al resto del personal.
- **RF-07.** Cuando el administrador o el propio Profesional configure los servicios que ese perfil ofrece en una sucursal, el sistema deberá aceptar únicamente servicios de su negocio y sucursales asignadas a ese perfil. **Por qué:** reflejar la oferta real de cada ubicación e impedir asociaciones ajenas.
- **RF-08.** Mientras el servicio global, la sucursal global, la cuenta del Profesional, su selección individual del servicio, su atención individual en la sucursal o la selección del servicio para esa sucursal estén inactivos, el sistema deberá excluir esa combinación de la oferta efectiva y conservar la configuración individual. **Por qué:** respetar todos los niveles de activación sin perder preferencias ni historial.
- **RF-09.** Si reactivar la atención individual de un Profesional en una sucursal produce conflictos con sus horarios vigentes, el sistema deberá rechazar la reactivación completa y conservar el estado anterior. **Por qué:** impedir que atienda simultáneamente en distintas sucursales.
- **RF-10.** Cuando el administrador del negocio o el propio Profesional consulte la oferta de un perfil autorizado, el sistema deberá distinguir las sucursales asignadas, sus estados globales e individuales, los servicios seleccionados, sus estados globales e individuales y la oferta resultante por sucursal; deberá denegar la consulta de perfiles ajenos. **Por qué:** permitir que cada actor conozca y gestione el estado real sin inferirlo de datos incompletos.

## Reglas de continuidad y errores

- Para los perfiles existentes, cada servicio ya seleccionado se considera inicialmente ofrecido en todas sus sucursales asignadas y activas. Un servicio creado por un Profesional sigue la misma regla inicial para su perfil; después puede ajustar su oferta por sucursal. **Por qué:** conservar la oferta previa y evitar que un alta nueva aparezca sin ubicación.
- Desactivar una oferta individual conserva servicios seleccionados, sucursales asignadas, horarios y demás historial. Al reactivarla se recupera la configuración guardada, siempre que continúe siendo válida; la reactivación de sucursal se sujeta a RF-09. **Por qué:** permitir pausas reversibles sin perder trabajo.
- Repetir una activación o desactivación que ya tenga el estado solicitado no deberá duplicar cambios ni eventos de auditoría. Una operación rechazada no deberá dejar cambios parciales. **Por qué:** mantener resultados estables ante reintentos y errores.
- Las operaciones sobre perfiles, servicios o sucursales de otro negocio, o sobre un perfil profesional ajeno, deberán denegarse sin alterar ni revelar sus datos. El administrador conserva el control global del catálogo y de las sucursales; la creación y edición permitidas al autor no otorgan al Profesional control global de activación o desactivación. **Por qué:** preservar el aislamiento y la separación de responsabilidades.

## Fuera de alcance

- Diseño, navegación, colores, avatares y demás cambios visuales del frontend.
- Cálculo de espacios disponibles, motor de disponibilidad, reservas y tratamiento de citas existentes.
- Crear sucursales desde una cuenta Profesional o modificar el límite de sucursales.
- Costos o duraciones distintos por sucursal o Profesional.
- Pagos anticipados.

## Criterios de finalización

1. Cada RF cuenta con evidencia nueva de aceptación; la cobertura histórica del módulo 1 no se presenta como prueba de este fix.
2. Se verifican permisos de administrador, autor del servicio y demás profesionales, incluido el rechazo de perfiles y negocios ajenos.
3. Se verifican especialidad obligatoria en altas y edición de perfiles anteriores, descripción opcional, creación y edición compartida de servicios y asignación automática solo al autor.
4. Se verifican activaciones y desactivaciones individuales y globales, su repetición sin efectos duplicados y la oferta por cada combinación de Profesional, servicio y sucursal.
5. Se verifica la continuidad de selecciones existentes, la conservación de horarios e historial, la recuperación al reactivar y el rechazo íntegro de reactivaciones con empalmes.
6. La consulta autorizada distingue los estados necesarios para explicar por qué una combinación se ofrece o no; se documenta que el motor de disponibilidad y las citas siguen pendientes.
