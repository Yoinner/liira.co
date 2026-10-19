# Incidente LIR-975C74 · Daniela → Amanda

Estado: corrección local preparada; sin despliegue ni cambio en Supabase Production.

## Evidencia comprobada en Production

- La alerta de plantilla salió a las 02:29:11 COT con `wamid.HBgMNTczMDE2Mzk5ODMzFQIAERgSNjczOTEzOUFGMkQ2Nzk2M0Q5AA==`; Meta la marcó `delivered`. El registro almacenó `Alerta iniciada con plantilla: LIR-975C74` pero no una FK a la solicitud.
- La primera respuesta de Daniela llegó a las 11:13:07 COT con `wamid.HBgMNTczMDE2Mzk5ODMzFQIAEhgUM0E0Nzg3QTc0NzE1MDEyMDI5QzMA`, texto «Qué precio tiene para Bucaramanga». El campo **persistido** `reply_to_provider_message_id` fue `NULL`; el resultado fue `unmatched_case`. No se conservó el cuerpo crudo del webhook, así que no podemos afirmar si Meta envió o no `context.id`.
- Ni el remitente exacto ni el Business Phone Number ID del evento histórico quedaron en `amanda_operator_messages`. La ruta sí exigía que el remitente coincidiera con el operador configurado. La corrección registra el Phone Number ID y rechaza mensajes de otro número comercial.
- Una respuesta posterior de Daniela a las 11:39:58 COT incluyó `LIR-975C74` y quedó inequívocamente asociada. Se guardó «para Bucaramanga tiene un costo de 15.000 y demora en llegar tres días!». El caso permanece `pending`, con `guidance_error_code=shipping_quote_approval_required`; no existe registro en `amanda_shipping_quotes` para ese caso. No se envió una respuesta al cliente. Esto preservó la barrera contra presentar un texto libre como cotización confirmada, pero dejó sin comunicar siquiera una estimación.
- Había siete solicitudes abiertas del mismo cliente piloto. Por eso su nombre por sí solo no permite seleccionar con seguridad un caso. Los logs históricos de Vercel no estuvieron disponibles en el rango del evento.

## Corrección preparada

- Migración aditiva: FK `handoff_id` y `phone_number_id` en mensajes del operador; enlaza alertas anteriores cuyo cuerpo tiene el patrón exacto del código. No elimina registros. Aplicada y comprobada únicamente en `Liira Staging QA`.
- Una cita de la alerta o del detalle se asocia por `provider_message_id` → `handoff_id`, antes de intentar código/nombre. Si la cita falta, Gemini compara el mensaje con las solicitudes abiertas y solo selecciona un caso inequívoco; la ambigüedad pide aclaración breve, sin exigir código.
- Las preguntas de Daniela reciben el detalle del caso y últimos mensajes relevantes, en un nuevo WhatsApp vinculado a la misma solicitud. Una orientación comercial se guarda y se intenta aplicar inmediatamente; un fallo del modelo deja el mensaje pendiente para reintento, no lo interpreta mediante expresiones regulares.
- La orientación de envío libre puede producir solo una **estimación claramente provisional**; una cotización confirmada sigue exigiendo `amanda_shipping_quotes` aprobada. Una frase de cortesía posterior no invalida automáticamente la solicitud; Gemini revisa cambios de producto/destino o cancelación antes de contestar. El estado de envío incierto no se reintenta automáticamente.
- Una nueva información de envío actualiza el único caso pendiente de la conversación cuando no existe cotización aprobada; si hay ambigüedad o una cotización ya aprobada, no reutiliza ese caso. Los saludos y archivos de referencia reciben contexto adecuado sin inventar contenido visual.

## Liberación y reversión

1. Confirmar un respaldo productivo **actual**, conteos y esquema; aplicar solo `20261019020000_amanda_operator_case_links.sql` en Production.
2. Publicar el commit local de la corrección, manteniendo la allowlist piloto y la plantilla Meta aprobada. No cambiar modelo, pagos, catálogo ni credenciales comerciales.
3. Hacer un caso nuevo con Yoinner y Daniela cuando ambos estén disponibles: comprobar `context.id`, `phone_number_id`, vínculo exacto, mensaje de detalle, respuesta citada, generación, entrega Meta y estado CRM.
4. Recuperar `LIR-975C74` solo tras leer nuevamente su estado y mensajes actuales; si sigue pendiente, autónomo y dentro de la ventana de 24 horas, programar una sola aplicación idempotente de la orientación guardada. Si la ventana expiró o cambió el pedido, mantenerla pendiente y pedir una nueva interacción autorizada. No enviar automáticamente la orientación antigua al desplegar.
5. Ante fallo crítico, poner `AMANDA_ENABLED=false` y volver al despliegue anterior. La migración es compatible hacia atrás y se deja instalada; no borrar sus columnas ni los mensajes históricos durante la reversión.

## Pruebas pendientes para declarar éxito

TypeScript, ESLint, build y pruebas unitarias pasan. La migración se ejecutó en Staging. No se han probado aún el webhook **nuevo** de Meta, generación real de estos prompts con Gemini, respuesta de Daniela citando ambos mensajes, entrega al cliente, ni los estados CRM de extremo a extremo. No declarar aprobadas A–O ni el recorrido real hasta esa prueba piloto.
