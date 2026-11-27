# M5-T006 — Contrato de Meta WhatsApp Cloud API

Consulta documental del 20 de noviembre de 2026. Se elige Graph API **v26.0**, publicada el 29 de julio de 2026 y listada sin fecha de retiro anunciada en el changelog consultado. La versión debe configurarse de forma explícita y verificarse de nuevo antes de habilitar el canal. [Versiones de Graph API](https://developers.facebook.com/docs/graph-api/changelog/versions/).

## Envío y acción

El adaptador enviará por `POST https://graph.facebook.com/v26.0/{phone-number-id}/messages` con token Bearer y `messaging_product: "whatsapp"`. Las plantillas aprobadas distinguen alta pública Pendiente, alta manual Confirmada y recordatorio. Solo la primera ofrece la acción. El ID devuelto en `messages[].id` sirve para correlacionar el mensaje aceptado y sus acuses. [Cloud API](https://developers.facebook.com/documentation/business-messaging/whatsapp/overview), [plantilla interactiva en la colección oficial de Meta](https://www.postman.com/meta/whatsapp-business-platform/request/lwtlz1k/send-message-template-interactive).

Fragmento sintético de `template.components` para la plantilla Pendiente:

```json
{
  "type": "button",
  "sub_type": "quick_reply",
  "index": "0",
  "parameters": [
    { "type": "payload", "payload": "<referencia-opaca-de-prueba>" }
  ]
}
```

Al pulsar el botón de plantilla, el webhook recibe `messages[].type = "button"` y `messages[].button.payload`. Usar el ID entrante para deduplicar, `from` para validar el destinatario original, `context.id` para correlacionar el mensaje inicial y `metadata.phone_number_id` para resolver el canal. Validar la acción contra cita, generación, envío y vigencia en servidor. El texto libre y los estados de entrega/lectura actualizan sus flujos respectivos sin confirmar asistencia. [Referencia oficial del callback](https://www.postman.com/meta/whatsapp-business-platform/request/5qal58f/received-callback-from-a-quick-reply-button-click), [ejemplo de campos del botón](https://developers.facebook.com/docs/whatsapp/api/messages/message-templates/interactive-message-templates).

## Recepción y consentimiento

1. En GET, verificar `hub.mode=subscribe` y `hub.verify_token`. Devolver `hub.challenge` con 200 únicamente si coinciden. En POST, verificar `X-Hub-Signature-256` como `sha256=<hex>` mediante HMAC-SHA256 de los bytes originales del cuerpo y el secreto de la app, antes de aceptar el JSON. Comparar los bytes de la firma en tiempo constante. El token de verificación y el secreto se administran fuera del repositorio. [Verificación y firma de Meta](https://developers.facebook.com/docs/graph-api/webhooks/getting-started/).
2. Resolver el canal y persistir un recibo deduplicado antes de devolver 200. Procesar después bajo el orden común de bloqueo y la generación vigente. Un error temporal al persistir devuelve 503. El reloj del servidor, leído después del bloqueo, determina la vigencia.
3. Meta exige que el destinatario haya dado su número o identificador y su consentimiento para recibir mensajes. En el portal se propone consentimiento explícito y opcional, identificado con el negocio y los mensajes de cita. En el registro manual el personal consigna la autorización comunicada por el cliente. Respetar retiros y dejar seguimiento manual si falta autorización, conservando la cita. Para iniciar conversaciones y para mensajes fuera de la ventana de atención de 24 horas se requieren plantillas aprobadas. [Política de mensajes de WhatsApp Business](https://whatsappbusiness.com/policy/).

Para la prueba real quedan por acreditar una cuenta empresarial configurada, un remitente habilitado, credenciales y permisos, las tres plantillas aprobadas, un webhook HTTPS suscrito y un número de prueba autorizado con consentimiento. Esta revisión verifica el contrato por fuentes oficiales. El canal requiere las pruebas reales previstas en M5-T135–M5-T138.
