# WhatsApp Cloud API en Liira

## Estado operativo

- Webhook firmado: `/api/webhooks/whatsapp`.
- Suscripción requerida: `messages`.
- Los mensajes entrantes crean o actualizan el cliente, la conversación y su línea de tiempo.
- La bandeja está en `/admin/conversaciones`; Tech ve además el estado del proveedor.
- Amanda analiza y responde desde el webhook cuando `WHATSAPP_AI_ANALYSIS_ENABLED=true`; los fallos se degradan sin bloquear la bandeja.
- Los mensajes libres solo se envían dentro de la ventana de atención de 24 horas. Fuera de ella, el panel exige una plantilla aprobada y una confirmación explícita del consentimiento.
- La plantilla inicial es `confirmacion_solicitud_liira`, idioma `es_CO`, con variables `nombre` y `consulta`.

## Configuración rápida de un nuevo cliente

1. Crear o seleccionar el Business Portfolio y la app de Meta.
2. Agregar WhatsApp, registrar el número de producción y verificarlo por SMS o llamada.
3. Generar un token permanente de usuario del sistema con los permisos mínimos de WhatsApp.
4. Configurar en Producción: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_VERIFY_TOKEN` y `META_APP_SECRET`.
5. Configurar el callback HTTPS, verificarlo y suscribir `messages`.
6. Completar dominio, contacto, privacidad, términos, eliminación de datos, ícono y categoría; publicar la app solo con autorización.
7. Crear la plantilla transaccional, esperar estado **Activa** y configurar `WHATSAPP_INIT_TEMPLATE_NAME` y `WHATSAPP_INIT_TEMPLATE_LANGUAGE`.
8. Aplicar migraciones, desplegar y probar recepción, idempotencia, firma inválida, consentimiento y visualización en Admin.

## Riesgos controlados al iniciar conversaciones

- El número se normaliza a E.164 colombiano y se valida antes de llamar a Meta.
- El panel no permite enviar si hubo una plantilla aceptada o pendiente en las últimas 24 horas.
- Una clave de idempotencia impide que recargas o dobles clics repitan el envío.
- Se registra consentimiento, origen, versión, operador, plantilla, mensaje externo y error sanitizado.
- Meta recibe únicamente nombre, teléfono y motivo autorizado; ningún secreto llega al navegador.
- Si Meta acepta el mensaje pero falla el registro local, la reserva conserva el identificador externo y evita reenvíos automáticos.

## Prueba antes de producción

1. Usar un contacto controlado que haya autorizado el mensaje.
2. Enviar la plantilla y comprobar `accepted → sent → delivered → read` cuando aplique.
3. Responder desde el teléfono y verificar que se abre la ventana de 24 horas, aparece el mensaje en vivo y Amanda continúa.
4. Repetir el envío y confirmar que no se duplica.
5. Probar firma inválida, webhook repetido y caída temporal de Meta.

## Teléfono y coexistencia

No asumir que un número de Cloud API puede abrirse simultáneamente en WhatsApp Business. La coexistencia depende de que Meta ofrezca el flujo oficial para esa cuenta y debe elegirse durante el alta correspondiente. Confirmar elegibilidad vigente antes de registrar o migrar el número; nunca automatizar WhatsApp Web.
