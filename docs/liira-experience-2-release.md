# Liira Experience 2.0 — revisión y salida

Estado: implementación local en `codex/liira-experience-2`. Sin push, Preview ni cambios en Production.

## Antes de publicar

1. Revisar visualmente la tienda y el panel local en `http://localhost:3001/`. Las capturas locales son de un entorno sin Supabase: no demuestran una bandeja poblada ni acciones Meta.
2. Aplicar `supabase/migrations/20261020010000_visitor_events.sql` **primero en Supabase Staging QA**. Confirmar tabla, RLS, permisos de `service_role` y tarea diaria `liira-visitor-events-retention`; probar inserción, lectura y depuración con datos ficticios. La migración es aditiva y no toca mensajes, clientes ni pedidos.
3. Desplegar la rama como Preview conectado **solo a Supabase Staging QA**. Comprobar bandeja poblada (mensajes cortos/largos y medios), búsqueda, filtros, contexto, móvil y permisos, sin usar números comerciales para mensajes de prueba.
4. Probar categorías con 0, 1, 3, 4, 7 y 12 registros; producto disponible, promocional y agotado; preferencias rechazadas/aceptadas/revocadas; solicitud con y sin permiso comercial; cron de retención. Verificar en red que no se emiten eventos al rechazar.
5. Solo con la aprobación del usuario: respaldar Supabase Production, aplicar la migración aditiva y verificar los conteos existentes; hacer push y dejar que Vercel despliegue. No intercambiar credenciales de Staging/Production ni ampliar el piloto de Amanda.

## Reversión

- Si falla la interfaz, volver al despliegue anterior de Vercel o revertir el commit. El catálogo, CRM y WhatsApp históricos permanecen intactos.
- Deshabilitar el endpoint de eventos con el despliegue anterior. La tabla `visitor_events` puede quedar sin uso hasta evaluar su eliminación; no borrarla ni deshacer la migración de forma automática.
- No hay nuevos mensajes proactivos ni cron de Amanda en este cambio. El motor de oportunidades es solo lectura y revisión humana.

## Límites observados

- El entorno local no tiene Supabase. Las pruebas de categorías numerosas y tarjetas agotadas fueron con datos ficticios de DOM; faltan la base y la bandeja reales en Preview aislado.
- Las capturas visuales locales no sustituyen la prueba de accesibilidad con lectores de pantalla ni una medición Lighthouse en Preview.
