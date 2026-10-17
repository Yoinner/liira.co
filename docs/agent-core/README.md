# Núcleo conversacional · contrato y estado

## Separación reutilizable

`lib/agent-core/conversation.ts` contiene reglas independientes del negocio: construcción de transcript, asociación de respuestas internas y barreras de estados financieros. `lib/whatsapp/amanda-business.ts` aporta la identidad y los límites verificados de Liira. El canal de WhatsApp, la base y las políticas de Liira permanecen fuera del núcleo; esto no convierte el repositorio en un SaaS multiempresa.

Para otro negocio se requiere un perfil propio, fuentes de conocimiento y herramientas autorizadas, una base aislada, pruebas con sus conversaciones y aprobación de sus políticas. No se reutilizan clientes, orientaciones, mensajes ni credenciales de Liira.

## Flujo implementado

Webhook firmado → persistencia idempotente por `provider_message_id` → `agent_due_at` a tres segundos → reclamación atómica por conversación → contexto de hasta 40 mensajes y memoria de trabajo → una generación estructurada de decisión y lectura asistida → comprobación de modo y último mensaje → envío oficial. El cron existente recupera hasta cuatro conversaciones vencidas por minuto. Una ejecución que llegó a la fase `sending` no se reenvía automáticamente si falla: el resultado ante Meta podría ser incierto y duplicar el mensaje.

Las orientaciones resueltas se consultan solo dentro de la misma conversación. El modelo recibe productos activos y estado operativo, pero no puede alterar inventario, crear pagos ni cerrar ventas. Una solicitud de Daniela no cambia el modo `autonomous`; solo la toma manual desde el panel lo hace. Si Daniela responde a una alerta con la función «Responder» de WhatsApp, se conserva `context.id` para relacionarla con el caso. Una respuesta tardía, una ventana cerrada o una conversación en modo humano se registra sin enviarse automáticamente al cliente.

`agent_context` guarda un resumen de trabajo que el modelo propone; el historial de mensajes sigue siendo la fuente original. La lectura asistida expone estado real (`pending`, `processing`, `completed`, `error`) y se puede recalcular sin enviar un mensaje. No se muestra una confianza porcentual sin calibración. Los estados financieros y ventas cerradas requieren evidencia externa o corrección humana; una cotización de envío nunca es una venta.

## Límites actuales y liberación

- La migración `20261017010000_amanda_conversation_queue.sql` debe aplicarse antes de desplegar el código; no se ha aplicado a producción.
- El respaldo cuando falla AI Gateway solo responde hechos seguros y deriva lo demás; no sustituye al modelo.
- El envío de Meta no aporta una clave de idempotencia de aplicación: la fase `sending` bloquea reintentos automáticos inciertos. Mission Control muestra ejecuciones fallidas para revisión.
- Las alertas fuera de 24 horas ya no reutilizan la plantilla comercial del cliente: quedan en cola hasta configurar `WHATSAPP_OPERATOR_TEMPLATE_NAME` con una plantilla interna aprobada por Meta. Esa plantilla debe tener las variables nombradas `nombre` y `consulta` en español Colombia; su aprobación y entrega real están pendientes. Dentro de ventana se envía el detalle libre.
- Imágenes y videos se almacenan y revisan por Daniela; no se realiza análisis visual automático ni verificación de comprobantes por IA.
- La memoria de trabajo es sugerida por el modelo. Una orientación solo se vuelve regla general si una persona redacta y aprueba expresamente el procedimiento en el panel; queda ligada al caso, auditada, versionada desde la primera versión y puede revocarse. No se promueve automáticamente ni se comparte con otros negocios. Todavía falta un flujo editorial para editar versiones posteriores de una regla.
- No existe pasarela de pago ni integración con transportadora. Amanda nunca debe inventar enlaces, tarifas o comprobaciones.
- El modelo por defecto sigue siendo `openai/gpt-6-luna`; la configuración `AI_GATEWAY_MODEL` permite cambiarlo sin reescribir el motor. Vercel documenta también `openai/gpt-6-sol`, `anthropic/claude-sonnet-4.6` y `google/gemini-3.1-pro-preview`, pero no se sustituyó el modelo sin una evaluación comparativa real de calidad, latencia y costo con conversaciones autorizadas. La ruta REST de AI Gateway ya usada por el proyecto es oficial; no se añadió AI SDK solo para duplicarla. Las herramientas delegadas por el modelo siguen pendientes.
- Antes de producción: probar migración en entorno de prueba, generación real del modelo configurado, conversaciones multimensaje, respuesta tardía de Daniela, aceptación/entrega de plantilla y revisión de estados tras fallos.

## Regla de adaptación

El modelo conversa y propone; el backend valida ventanas de WhatsApp, modo humano, actualidad del contexto, formato, idempotencia y acciones permitidas. Toda empresa aporta identidad, tono, catálogo o servicios, políticas, responsables, datos aislados y pruebas propias. No reutilizar textos comerciales ni datos de clientes de este proyecto.
