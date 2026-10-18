# Amanda · preparación de liberación (18/10/2026)

**Estado: no apta para producción todavía.** Todo lo nuevo permanece en `codex/amanda-gateway-recovery`. No hubo push, migración productiva, cambio de variables ni envío de WhatsApp en esta fase.

## Evidencia ya obtenida

- `google/gemini-2.5-flash` respondió desde el adaptador real de Liira: HTTP 200, herramienta ficticia `searchProducts` invocada, respuesta JSON validada por Zod. Tres solicitudes, 339 tokens de entrada y 515 de salida, ~7 s; logs de Vercel: US$0,0002 + US$0,0007 + US$0,0005 = **US$0,0014**. Clave temporal limitada a US$1 revocada y retirada del portapapeles.
- Conversaciones multimensaje ficticias se habían probado en la fase anterior; no prueban recepción ni entrega real por Meta. El código no depende de regex para decidir la intención; las expresiones deterministas son barreras para afirmaciones financieras y asociación de casos.
- El catálogo público muestra tres categorías y 0 productos activos. No se verificó el inventario interno.
- El 18/10/2026, Meta mostraba `alerta_interna_amanda_liira` **En revisión**. La plantilla de inicio de clientes sí estaba activa; la primera no puede darse por entregada.
- Vercel Production mantiene `AI_GATEWAY_MODEL=openai/gpt-6-luna`, restringido con HTTP 403 para el crédito gratuito. No se observó otra variable con ese nombre en Preview/Development. El código toma la variable antes del valor predeterminado Gemini.
- La integración usa `fetch` con el API compatible de AI Gateway; no hay dependencia `ai`/Vercel AI SDK instalada. Node local 24.13.0 y Next 16.3.7.

## Migraciones y verificación local aislada

Se instaló Docker Desktop en modo usuario y se inició Supabase local en una carpeta temporal, sin conectar los dos proyectos alojados. La copia local de `20261015010000_amanda_agent.sql` sustituyó **solo en el entorno de prueba** la URL del cron público por `127.0.0.1:1`; el archivo original no cambió. Las 10 migraciones del repositorio aplicaron en Postgres local y las tres nuevas se reejecutaron sin error. `20261017010000_amanda_conversation_queue.sql` ya se aplicó manualmente en Production en la fase anterior, pero no consta en su historial. Estas tres siguen **sin aplicar en Production**:

1. `20261017020000_amanda_retry_attempts.sql`: intentos y vencimientos recuperables.
2. `20261017030000_amanda_gateway_budget.sql`: cupo global bajo 5 solicitudes/minuto, registro de tokens, webhook entrante transaccional y unicidad de casos pendientes.
3. `20261017040000_amanda_manual_commerce.sql`: medios de pago aprobados, pedidos manuales, confirmación humana con referencia única y cotizaciones de envío asociadas al caso, pedido/destino e instante del último mensaje, con vencimiento.

Pruebas reales con datos ficticios y `ROLLBACK` en Supabase local: webhook repetido, pedido idempotente, confirmación de pago ligada a imagen y referencia, cotización ligada a caso/pedido/vigencia, recuperación de alerta incierta con auditoría y rechazo de una ya entregada, RLS y RPC ejecutables solo por `service_role`. Dos webhooks concurrentes dejaron **1** mensaje, **1** no leído y **1** actividad. Cuatro reservas concurrentes de cupo de cliente produjeron **3** admisiones y **1** rechazo. Un fallo de auditoría forzado revirtió íntegramente la creación de un pedido y el rearmado de una alerta. Las pruebas no ejercitaron Meta ni AI Gateway reales, ni demuestran que Vercel Preview esté aislado.

Además, el servidor Next compilado corrió en `localhost:3100` conectado únicamente a ese Supabase local, con Amanda y análisis AI desactivados. Un webhook ficticio firmado obtuvo HTTP **200**, repetirlo obtuvo **200**, y una firma inválida obtuvo **401**. La base terminó con **1 mensaje, 1 no leído y 1 actividad**; la repetición no duplicó datos. Esta prueba sí recorre HTTP → ruta Next → RPC → Postgres, pero no Meta ni una respuesta autónoma.

La prueba transaccional reproducible está en `tests/amanda-local.sql`; ejecutar únicamente contra una base local aislada con `psql -v ON_ERROR_STOP=1`. El archivo finaliza con `ROLLBACK`. Las pruebas concurrentes se ejecutaron desde cuatro sesiones locales independientes.

Antes de migrar Production, comprobar backups/restauración e historial; aplicar en orden, revisar concurrencia y esta precondición del índice único:

```sql
select source_message_id, kind, count(*)
from public.amanda_handoffs
where status = 'pending' and source_message_id is not null
group by source_message_id, kind having count(*) > 1;
```

No eliminar duplicados históricos automáticamente: revisarlos caso por caso. Si la precondición falla, detener migración y planear reparación no destructiva. El comportamiento SQL concurrente ya se probó localmente; quedan pendientes las alertas y respuestas del flujo Meta → aplicación → Daniela, así como un Preview cuya base **no** sea Production.

## Pagos manuales y límites

El panel local permite confirmar titularidad/divulgación de Nequi o Bre-B y crear un pedido con importe y resumen. Para enlaces, `AMANDA_PAYMENT_LINK_HOSTS` debe contener **solo** dominios de proveedores que el negocio verificó; si está vacía, no se aprueba ningún enlace. Una URL del dominio Liira por sí sola no basta. Amanda toma el importe y destino del pedido aprobado, no de texto libre de WhatsApp. Un archivo del cliente abre revisión, pero no cambia la venta a pagada; la administradora debe verificar fondos en su cuenta y registrar una referencia de transacción única. El código asocia el comprobante al caso y pedido de esa conversación.

Estos formularios **no prueban la recepción bancaria**. La aprobación administrativa es una declaración humana; no hay API de banco/pasarela. Pedido, orientación y auditoría se agrupan en funciones SQL transaccionales; verificar su rollback y concurrencia en staging antes de producción. La cotización de envíos ya tiene entidad por caso con destino, producto/pedido y vencimiento; el backend comprueba mensaje, pedido y vigencia antes de enviarla. No hay descuentos de inventario ni cobro automático.

El código incluye un piloto cerrado: `AMANDA_ENABLED=true` no basta; `AMANDA_ROLLOUT_MODE=pilot` admite solo `AMANDA_TEST_PHONE_ALLOWLIST`. Sin lista, no hay respuesta autónoma. El panel permite rearmar manualmente un aviso privado de resultado incierto tras comprobar el chat, con confirmación y auditoría; no se reenvía de forma automática. La entrega real y el riesgo residual de estados tardíos de Meta deben probarse con números autorizados.

## Puertas de producción

1. Supabase local superó las migraciones y pruebas SQL, pero para Preview desplegado hace falta un proyecto alojado aislado o una alternativa equivalente; Vercel Preview actual apunta a Production. Revisar históricos y tener backup/restauración antes de aplicar nada allí.
2. Activar la plantilla interna de Meta y comprobar **entrega**, no solo aceptación; hacer prueba controlada cliente → Amanda → Daniela → Amanda con números autorizados, multimedia y ventana de 24 horas.
3. Publicar productos reales para validar herramientas con catálogo no vacío. Probar memoria, varios clientes simultáneos, orientación tardía y estados del CRM.
4. Repetir desde la aplicación desplegada el pedido manual, origen de enlace, importe, comprobante, referencia y cotización; las invariantes SQL y el rollback ya pasaron localmente.
5. Solo con autorización: configurar Vercel Production `AI_GATEWAY_MODEL=google/gemini-2.5-flash`, verificar credencial OIDC/clave y `AMANDA_PAYMENT_LINK_HOSTS`; no comprar crédito ni activar recarga. Desplegar por Git tras las migraciones, observar logs/costo y enviar una prueba controlada.
6. Reversión: `AMANDA_ENABLED=false` detiene la autonomía mientras el panel manual sigue disponible; revertir commit o restaurar deployment si hay error, sin borrar las tablas ni los mensajes. No usar `openai/gpt-6-luna` como fallback en el plan gratuito.
