# Amanda · operación comercial autónoma de Liira

> Estado de implementación y límites de la reconstrucción: [núcleo conversacional](agent-core/README.md). Las secciones de arquitectura y despliegue gradual de esta página son una propuesta histórica, no una verificación de producción.

## Contrato operativo implementado

- Amanda responde desde el número oficial de Liira cuando `AMANDA_ENABLED=true` y la conversación está en modo `autonomous`.
- Daniela opera un canal privado. Dentro de 24 horas recibe texto libre; fuera de la ventana la alerta queda en cola hasta configurar una plantilla interna específica aprobada por Meta. Hay que verificar su entrega real antes de publicar esta reconstrucción.
- Las consultas humanas llevan código `LIR-XXXXXX`. Daniela responde con ese código y su recomendación; Amanda la transforma en una respuesta coherente para la clienta sin inventar información.
- Imágenes y videos entrantes se descargan desde Meta, se guardan en un bucket privado y se sirven únicamente al panel autenticado. Las referencias multimedia requieren revisión humana; el sistema no finge haberlas analizado visualmente.
- Cuando la clienta está lista para comprar, Amanda solicita el enlace a Daniela. Una captura nunca confirma el pago: únicamente la respuesta explícita `pago confirmado` de Daniela habilita la recolección de nombre, dirección, barrio y ciudad.
- Los seguimientos se guardan en base de datos y Supabase Cron consulta cada minuto los vencidos. Solo se envía un microseguimiento si la última intervención fue de Liira y la ventana de servicio sigue abierta.
- La eliminación de mensajes y conversaciones es local y auditable; no borra el contenido del dispositivo del cliente.

## Objetivo

Convertir conversaciones de WhatsApp en ventas con atención cálida, rápida y útil, sin presión ni engaño. El agente hablará como **asistente virtual de Liira** en el primer contacto y después mantendrá un tono humano y natural; no fingirá ser una persona.

## Experiencia de conversación

- Español colombiano cercano, elegante y breve; una pregunta por mensaje y máximo un emoji cuando aporte tono.
- Primero entiende intención, ocasión, color, presupuesto, fecha y ciudad; después recomienda hasta tres piezas reales.
- Usa fotos, disponibilidad y datos existentes. Nunca inventa stock, precios, tiempos, materiales, descuentos ni políticas.
- Ante “luego” o “dame un momento”, identifica con suavidad si falta tiempo, confianza, presupuesto o decisión; ofrece guardar opciones y pregunta cuándo puede retomar. Solo agenda seguimiento con consentimiento.
- Resume la elección antes del cierre y solicita únicamente los datos imprescindibles.
- Transfiere a una persona cuando haya molestia, excepción de política, negociación no autorizada, personalización compleja, pago dudoso o baja confianza.

## Estados comerciales

1. `nuevo`: saluda, se identifica y entiende la necesidad.
2. `descubrimiento`: recoge ocasión, estilo, colores, presupuesto y fecha.
3. `recomendacion`: presenta pocas opciones justificadas con imagen y enlace.
4. `objecion`: responde dudas y detecta el freno real sin insistencia.
5. `cotizacion`: confirma producto, personalización, cantidad, envío y total autorizado.
6. `esperando_cliente`: fija el siguiente paso y, con permiso, una fecha de seguimiento.
7. `listo_para_cerrar`: entrega el enlace o instrucción de pago cuando exista ese sistema.
8. `ganado`, `perdido` o `humano_requerido`: registra el resultado y su evidencia.

## Arquitectura propuesta

```text
Webhook firmado de Meta
  → persistencia idempotente
  → cola durable por conversación
  → constructor de contexto comercial
  → agente con salida estructurada y herramientas limitadas
  → validador de política y ventana de 24 horas
  → envío por Cloud API
  → CRM, auditoría, métricas y seguimiento
```

El agente usará Vercel AI Gateway con una identidad dedicada, presupuesto mensual, observabilidad y modelo de respaldo. La conversación y sus trabajos deben ser durables para sobrevivir reinicios y despliegues; Eve es una opción apropiada cuando se implemente el ciclo autónomo completo. El modelo nunca recibirá secretos ni acceso directo a la base de datos.

## Herramientas permitidas

- `buscar_productos`: nombre, categoría, color, disponibilidad, imágenes y enlace público.
- `consultar_inventario`: lectura exacta, sin modificar unidades.
- `consultar_politicas`: envíos, cambios, personalización y privacidad vigentes.
- `leer_cliente`: historial, preferencias, consentimiento y conversaciones relevantes.
- `actualizar_pipeline`: etapa, intención, prioridad, resumen y próximo paso.
- `programar_seguimiento`: solo con fecha razonable y consentimiento registrado.
- `enviar_respuesta`: aplica ventana de servicio, plantilla aprobada, longitud y rate limit.
- `solicitar_humano`: bloquea la automatización y crea una alerta visible.

Las acciones de descuento, devolución, cambio de precio, ajuste de inventario, declaración de venta y cobro permanecerán bajo aprobación humana hasta contar con reglas e integraciones verificadas.

## Memoria y conocimiento

- Memoria corta: últimos mensajes y estado de la conversación.
- Memoria comercial: preferencias confirmadas, compras, objeciones y compromisos futuros.
- Fuente de verdad: productos, inventario, políticas y configuración del negocio desde Supabase.
- Resumen estructurado después de cada turno para evitar enviar historiales completos al modelo.
- Datos sensibles minimizados, retenidos según política y nunca reutilizados entre clientes.

## Seguridad y control

- Firma del webhook, deduplicación, idempotencia y orden por conversación.
- Una ejecución activa por conversación para evitar respuestas cruzadas o duplicadas.
- Salida validada con esquema: `intent`, `stage`, `confidence`, `reply`, `tool`, `follow_up_at`, `handoff_reason`.
- Respuestas automáticas únicamente dentro de la ventana permitida; fuera de ella, solo plantillas aprobadas y consentimiento aplicable.
- Presupuesto, límite de pasos, tiempo máximo, rate limiting, circuit breaker y modelo de respaldo.
- Registro de modelo, versión de instrucciones, herramientas usadas, costo, latencia, respuesta y decisión.
- Botón global de pausa, pausa por conversación y recuperación manual desde Mission Control.

## Despliegue gradual

### Fase 1 — sombra

Analiza conversaciones reales y propone respuestas sin enviarlas. El equipo califica exactitud, tono y oportunidad.

### Fase 2 — copiloto

El panel muestra borrador, razón, confianza y fuentes. Una persona aprueba o edita cada respuesta.

### Fase 3 — autonomía limitada

Responde automáticamente saludos, disponibilidad, catálogo, preguntas frecuentes y descubrimiento. Objeciones, cotizaciones y seguimientos requieren aprobación.

### Fase 4 — autonomía comercial controlada

Puede recomendar, cotizar bajo reglas fijas, hacer seguimiento consentido y llevar al cierre. Pagos, descuentos, devoluciones y excepciones siguen requiriendo persona.

El paso entre fases exige un conjunto de evaluación aprobado y al menos dos semanas sin incidentes críticos.

## Evaluación obligatoria

- Casos felices, ambiguos, molestos, adversariales, fuera de horario y fuera de la ventana de 24 horas.
- Productos agotados, precios cambiados, datos incompletos, personalización imposible y mensajes duplicados.
- No alucinar, no presionar, no prometer, no repetir y no escribir cuando el humano tomó control.
- Métricas: tiempo a primera respuesta, conversación a cotización, cotización a venta, recuperación de “luego”, transferencias correctas, correcciones humanas, bloqueos de política, costo por conversación y satisfacción.
- Comparar contra la operación humana mediante pruebas A/B controladas; optimizar venta y satisfacción, nunca solo cantidad de mensajes.

## Activación responsable

El código soporta autonomía controlada, atención humana y pausa por conversación. La salida a producción debe empezar con conversaciones reales supervisadas y conservar `AMANDA_ENABLED=false` hasta que la migración, el canal privado de Daniela, los medios, los permisos y los casos de prueba estén verificados. Las recomendaciones de Daniela se guardan como candidatos de aprendizaje; no reescriben silenciosamente las reglas del agente.
