# Teléfonos internacionales del portal público

## Alcance y contrato

El formulario muestra **País o región** y **Teléfono**. Admite México, Argentina, Bolivia, Brasil, Belice, Chile, Colombia, Costa Rica, Cuba, República Dominicana, Ecuador, El Salvador, Guatemala, Honduras, Haití, Nicaragua, Panamá, Paraguay, Perú, Uruguay, Venezuela, Guayana Francesa, Guadalupe, Guyana, Martinica, Puerto Rico, Surinam, Estados Unidos y Canadá. El prefijo aparece junto al país. México es la selección inicial; el navegador mantiene país y contacto solo en memoria durante el flujo. El marcador de intento en `sessionStorage` no incorpora teléfono ni país.

El navegador usa `libphonenumber-js/max` para validar el número completo según el país elegido. Muestra un ejemplo móvil del país, acepta espacios, paréntesis y guiones, y rechaza extensiones, letras, país distinto del elegido y números que no cumplen las reglas del plan telefónico. El servidor vuelve a validar la cadena recibida y determina el país por el prefijo; el selector no es autoridad. La lista admitida es cerrada en ambos repositorios. La validación comprueba formato y plan de numeración, **no** la titularidad, la actividad de la línea ni si existe una cuenta WhatsApp. Actualizar los metadatos de la dependencia en ambos repositorios cuando cambien los planes nacionales.

El cuerpo público conserva el campo `telefono`; no admite un campo nuevo `pais`. Para compatibilidad, los números mexicanos de diez dígitos y `+52` se normalizan a los mismos diez dígitos existentes. Los números de otros países se guardan en E.164 con `+`, código de país y dígitos nacionales. El mismo valor normalizado rige ficha, snapshot de cita, cupo por teléfono y huella idempotente; no se mezcla un `+52` nuevo con una clave mexicana distinta. El nombre de dominio del campo y de la pantalla es «Teléfono».

La migración `1760000069000-TelefonosInternacionales` amplía `clientes.telefono` y `citas.telefono_contacto` a `VARCHAR(16)` y ajusta la restricción de clientes. No cambia teléfonos ni citas anteriores. Debe aplicarse **antes** de desplegar escritores capaces de registrar destinos extranjeros; Nest no ejecuta migraciones al arrancar. Conservar respaldo y verificar en una base desechable identificada como test. Su reversión se niega si ya hay teléfonos internacionales. La autorización de este cambio de código no implica ejecutar la migración sobre una base cotidiana.

## WhatsApp con Meta

La autorización para recibir WhatsApp sigue siendo opcional. Si el número es mexicano histórico, la bandeja genera `+52` seguido de diez dígitos; para los demás usa el E.164 guardado. El transporte envía a Meta los dígitos internacionales sin `+` en `to`. La coincidencia de respuestas usa el mismo destinatario y conserva la equivalencia mexicana `52`/`521` ya implementada. Un número extranjero no recibe esa excepción mexicana. No se usan teléfonos como identidad del cliente ni se revela historial por teléfono.

Un número con formato válido puede no estar registrado en WhatsApp o puede ser rechazado por Meta. El flujo existente registra acuses y fallos; solo una entrega acreditada habilita la política correspondiente de confirmación automática, y los demás casos siguen en seguimiento manual. Las plantillas aprobadas y su idioma se configuran por canal; el país del teléfono no cambia automáticamente el idioma. Antes de enviar a clientes reales, comprobar consentimiento, canal, plantilla, destino y acuse con números de prueba autorizados de los países que se usarán. La pantalla nunca promete que un mensaje se entregó al registrar la reserva.

Referencias: [metadatos y validación de libphonenumber-js](https://github.com/catamphetamine/libphonenumber-js#using-phone-number-validation-feature), [API de WhatsApp Business de Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/overview) y [plantillas de Meta](https://developers.facebook.com/docs/graph-api/reference/whats-app-business-account/message_templates/).

## Verificación y límites

Las pruebas unitarias cubren México, Estados Unidos, Canadá, Brasil y Colombia, número incompleto, país ajeno, extensión y formación del destino de Meta. La integración de la migración usa una base efímera con teléfonos anteriores y extranjeros y verifica que no haya truncamiento. El frontend prueba selector, normalización y conservación en memoria; el build incluye el nuevo catálogo telefónico. No se probó entrega real de Meta ni se habilitó un canal nuevo. El portal sigue sujeto a las reglas de origen, CSRF, licencia, oferta y disponibilidad.
