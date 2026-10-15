# Conectar WhatsApp Cloud API en Liira

Estado actual: la tienda abre WhatsApp mediante `wa.me` y registra el contacto en el CRM. La bandeja bidireccional, las confirmaciones automáticas y los estados de entrega quedan pendientes hasta conectar un número oficial mediante Meta WhatsApp Cloud API.

## Lo que debe preparar la clienta

1. Crear o abrir su **Portafolio comercial** en Meta Business Suite.
2. Crear una app de tipo negocio en Meta for Developers y añadir el producto **WhatsApp**.
3. Crear o seleccionar la cuenta de WhatsApp Business (WABA).
4. Añadir el número que usará Liira, validar el código recibido y aprobar el nombre visible.
5. Activar la verificación en dos pasos del número y guardar su PIN fuera del repositorio.
6. Crear un usuario del sistema con acceso mínimo a la app y generar un token permanente con `whatsapp_business_management` y `whatsapp_business_messaging`. No usar el token temporal del panel para producción.
7. Crear y enviar a revisión las plantillas transaccionales necesarias, empezando por `confirmacion_solicitud_liira` y, cuando existan pagos, `pago_confirmado_liira`.

## Datos que necesita la integración

No envíes el token en un documento, captura o commit. Lo más seguro es añadirlo directamente como secreto en Vercel o introducirlo durante una sesión compartida sin mostrarlo.

- `WHATSAPP_ACCESS_TOKEN`: token permanente del usuario del sistema.
- `WHATSAPP_PHONE_NUMBER_ID`: identificador del número, no el número visible.
- `WHATSAPP_BUSINESS_ACCOUNT_ID`: identificador de la WABA.
- `WHATSAPP_VERIFY_TOKEN`: frase aleatoria larga creada para verificar el webhook.
- `META_APP_SECRET`: secreto de la app usado exclusivamente en el servidor para verificar `X-Hub-Signature-256`.
- Número visible de Liira en formato E.164, actualmente configurado mediante `NEXT_PUBLIC_WHATSAPP_NUMBER`.

## Lo que se conectará en la web

1. Crear el endpoint HTTPS `/api/webhooks/whatsapp`.
2. En Meta, registrar esa URL y el mismo `WHATSAPP_VERIFY_TOKEN`.
3. Suscribir la app al campo `messages` de la WABA.
4. Verificar la firma de cada webhook, procesar eventos de forma idempotente y responder rápido con `200`.
5. Guardar mensajes y estados `sent`, `delivered`, `read` o `failed` sin datos bancarios ni secretos.
6. Vincular las conversaciones al cliente por teléfono normalizado y mostrarlas en su ficha 360°.
7. Enviar plantillas aprobadas fuera de la ventana de atención permitida y mensajes libres solo cuando Meta lo permita.
8. Registrar consentimiento, plantilla, identificador externo, intentos y error sanitizado.

El endpoint ya preparado rechaza firmas inválidas, limita el cuerpo a 1 MB, evita duplicados por identificador del mensaje y registra cada mensaje entrante en la línea de tiempo del cliente. La recepción de producción permanece cerrada hasta configurar `META_APP_SECRET` y publicar la app en Meta.

## Prueba antes de producción

- Enviar y recibir con el número de prueba de Meta.
- Probar verificación del webhook, firma inválida, evento repetido y eventos fuera de orden.
- Enviar una plantilla aprobada a un número autorizado y comprobar `sent → delivered → read` cuando aplique.
- Confirmar que un fallo de WhatsApp queda como incidencia reintentable y no altera una venta.
- Repetir con el número real y un contacto controlado antes de habilitar automatizaciones.

Referencias oficiales: colección de Meta para WhatsApp Cloud API en Postman, Meta Blueprint y las políticas de WhatsApp Business. Verificar versión vigente de Graph API y requisitos del número el día de la conexión.
# WhatsApp Cloud API en Liira

## Estado operativo

- Webhook firmado: `/api/webhooks/whatsapp`.
- Suscripción requerida: `messages`.
- Los mensajes entrantes crean o actualizan el cliente, la conversación y su línea de tiempo.
- La bandeja está en `/admin/conversaciones`; Tech ve además el estado del proveedor.
- El análisis con IA está desactivado hasta autorizar proveedor, tratamiento de conversaciones y presupuesto. Al activarlo usa `WHATSAPP_AI_ANALYSIS_ENABLED=true` y Vercel AI Gateway mediante OIDC.

## Configuración rápida de un nuevo cliente

1. Crear o seleccionar el Business Portfolio y la app de Meta.
2. Agregar WhatsApp, registrar el número de producción y verificarlo por SMS o llamada.
3. Generar un token permanente de usuario del sistema con los permisos mínimos de WhatsApp.
4. Configurar en Producción: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_VERIFY_TOKEN` y `META_APP_SECRET`.
5. Configurar el callback HTTPS, verificarlo y suscribir `messages`.
6. Completar dominio, contacto, privacidad, términos, eliminación de datos, ícono y categoría; publicar la app solo con autorización.
7. Aplicar la migración de la bandeja, desplegar una vez y probar recepción, idempotencia, firma inválida y visualización en Admin.
8. Probar un envío únicamente con autorización y dentro de la ventana de atención; fuera de ella se requiere una plantilla aprobada.

## Teléfono y coexistencia

No asumir que un número de Cloud API puede abrirse simultáneamente en WhatsApp Business. La coexistencia depende de que Meta ofrezca el flujo oficial para esa cuenta y debe elegirse durante el alta correspondiente. Confirmar elegibilidad vigente antes de registrar o migrar el número; nunca automatizar WhatsApp Web.
