# Liira Experience 2.1 — estado de QA

Rama local: `codex/liira-experience-2-1`, separada del commit 2.0 `b809921`. Ni 2.0 ni 2.1 están publicados al 20-10-2026. Mantener Production y el piloto de Amanda sin cambios hasta pasar Preview aislado.

## Implementado

- Hero editorial de secuencia finita con frase final estable, navegación con transición de ruta y alternativa de movimiento reducido.
- Modal de privacidad de primera visita ya existente en 2.0, corregido para no quedar detrás del encabezado y no desplazarse al enfocar. Consentimiento de cookies y permiso de WhatsApp siguen separados.
- Borrador de personalización guardado **solo por clic** en este dispositivo, recuperable y borrable sin enviar nombre o teléfono; compartirlo por WhatsApp requiere otra acción explícita.
- Solicitud de disponibilidad para producto agotado, con permiso específico, verificación Turnstile, idempotencia, control de stock y registro en CRM; ninguna notificación automática nueva. El permiso de marketing continúa opcional y separado.
- Referencia creativa reutilizable y acotada incorporada a Slone desde Refero Styles.

## Aislamiento y verificaciones

- Supabase Staging QA `ctmxzvpqjykbigcopakw` recibió la migración aditiva `20261020020000_interest_requests.sql`. Se comprobaron tres columnas nuevas y el índice único. Production `gzadywngvobftdzckocx` no recibió esa migración.
- Pruebas locales finales: 40/40, TypeScript, ESLint y build. Recorrido local de guardar, recargar y borrar un borrador ficticio confirmado. No se envió contacto ni WhatsApp de prueba desde el formulario local.
- `Turnstile` usa claves de prueba oficiales solo en desarrollo o Preview aislado; Production debe tener claves reales del dominio antes de publicar 2.1. Sin ellas, el formulario falla cerrado.

## Puerta de publicación

1. Desplegar 2.0 y 2.1 por separado en `liira-staging-qa`, con sus variables Supabase de QA y claves Turnstile de QA, nunca como Preview del proyecto productivo porque allí Preview comparte variables de Production.
2. Probar en Preview rutas, consentimiento, formularios con datos ficticios, permisos CRM, duplicados, producto agotado/disponible, móvil, teclado, reducción de movimiento, WhatsApp administrativo y Amanda/Daniela sin emitir mensajes reales fuera del piloto.
3. Obtener respaldo productivo recuperable reciente, verificar conteos y rollback; aplicar **solo** las migraciones aditivas que correspondan al código que se publicará.
4. Publicar primero 2.0 solo si Preview pasa; dejar 2.1 en revisión visual. Para 2.1 obtener widget Turnstile real, probarlo en Preview con dominio permitido y publicar solo tras aprobación específica del usuario.

Reversión: revertir el despliegue de interfaz; conservar las columnas y la tabla de eventos sin uso hasta una limpieza autorizada. No borrar datos ni ampliar Amanda automáticamente.
