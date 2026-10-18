import "server-only";

import { siteConfig } from "@/lib/config";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { defaultAgentModel } from "@/lib/agent-core/gateway";

export type HealthState = "connected" | "configured" | "degraded" | "unavailable";

export async function getSystemHealth() {
  const client = getSupabaseAdmin();
  const [databaseResult, storageResult, auditResult, crmResult, operatorResult, queuedAlerts, agentQueue, failedRuns, gatewayUsage, manualOrders, operatorInbound] = client
    ? await Promise.all([
        client.from("categories").select("id", { count: "exact", head: true }),
        client.storage.listBuckets(),
        client.from("audit_events").select("id,action,entity_type,created_at").order("created_at", { ascending: false }).limit(8),
        client.from("customers").select("id", { count: "exact", head: true }),
        client.from("amanda_operator_messages").select("delivery_status,created_at").eq("direction", "outbound").order("created_at", { ascending: false }).limit(1).maybeSingle(),
        client.from("amanda_handoffs").select("id", { count: "exact", head: true }).eq("status", "pending").neq("operator_delivery_status", "sent"),
        client.from("whatsapp_conversations").select("id", { count: "exact", head: true }).not("agent_due_at", "is", null),
        client.from("amanda_agent_runs").select("source_message_id", { count: "exact", head: true }).eq("status", "failed").gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
        client.from("amanda_gateway_requests").select("id", { count: "exact", head: true }).gte("reserved_at", new Date(Date.now() - 60_000).toISOString()),
        client.from("amanda_manual_orders").select("id", { count: "exact", head: true }).eq("status", "awaiting_payment"),
        client.from("amanda_operator_messages").select("id", { count: "exact", head: true }).eq("direction", "inbound").is("processed_at", null),
      ])
    : [{ error: new Error("not configured"), count: null }, { error: new Error("not configured"), data: null }, { error: new Error("not configured"), data: null }, { error: new Error("not configured"), count: null }, { error: new Error("not configured"), data: null }, { error: new Error("not configured"), count: null }, { error: new Error("not configured"), count: null }, { error: new Error("not configured"), count: null }, { error: new Error("not configured"), count: null }, { error: new Error("not configured"), count: null }, { error: new Error("not configured"), count: null }];

  const storageReady = !storageResult.error && Boolean(storageResult.data?.some((bucket) => bucket.id === "products"));
  const isVercel = Boolean(process.env.VERCEL);
  const whatsappWebhookReady = Boolean(process.env.WHATSAPP_VERIFY_TOKEN && process.env.META_APP_SECRET);
  const whatsappMessagingReady = Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_BUSINESS_ACCOUNT_ID);
  const whatsappTemplateReady = Boolean(process.env.WHATSAPP_INIT_TEMPLATE_NAME && process.env.WHATSAPP_INIT_TEMPLATE_LANGUAGE);
  const operatorStatus = operatorResult.data?.delivery_status;
  const operatorReady = operatorStatus === "delivered" || operatorStatus === "read";
  const operatorTemplateReady = Boolean(process.env.WHATSAPP_OPERATOR_TEMPLATE_NAME);

  return {
    checkedAt: new Date().toISOString(),
    release: {
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "unknown",
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "Despliegue directo",
      region: process.env.VERCEL_REGION || "Local",
      runtime: process.version,
    },
    services: [
      {
        name: "Vercel Hosting",
        state: (isVercel ? "connected" : "configured") as HealthState,
        detail: isVercel ? `Producción activa · ${process.env.VERCEL_REGION || "región administrada"}` : "Entorno local preparado",
      },
      {
        name: "Supabase Database",
        state: (!client ? "unavailable" : databaseResult.error ? "degraded" : "connected") as HealthState,
        detail: !client ? "Variables ausentes" : databaseResult.error ? "No respondió la consulta de salud" : `${databaseResult.count ?? 0} categorías accesibles`,
      },
      {
        name: "Supabase Storage",
        state: (!client ? "unavailable" : storageReady ? "connected" : "degraded") as HealthState,
        detail: !client ? "Variables ausentes" : storageReady ? "Bucket products disponible" : "Bucket products no disponible",
      },
      {
        name: "CRM operativo",
        state: (!client ? "unavailable" : crmResult.error ? "degraded" : "connected") as HealthState,
        detail: !client ? "Supabase no configurado" : crmResult.error ? "Migración CRM pendiente o consulta degradada" : `${crmResult.count ?? 0} clientes identificados`,
      },
      {
        name: "WhatsApp manual",
        state: (siteConfig.whatsapp ? "configured" : "unavailable") as HealthState,
        detail: siteConfig.whatsapp ? "Enlaces wa.me activos; apertura registrada en CRM" : "Número no configurado",
      },
      {
        name: "WhatsApp Cloud API",
        state: (whatsappWebhookReady && whatsappMessagingReady && whatsappTemplateReady ? "configured" : whatsappWebhookReady || whatsappMessagingReady ? "degraded" : "unavailable") as HealthState,
        detail: whatsappWebhookReady && whatsappMessagingReady && whatsappTemplateReady ? "Webhook firmado, mensajería y plantilla de inicio configurados" : whatsappWebhookReady && whatsappMessagingReady ? "Mensajería activa; falta la plantilla aprobada para iniciar conversaciones" : whatsappWebhookReady ? "Webhook preparado; faltan credenciales del número" : "Webhook y credenciales pendientes",
      },
      {
        name: "Canal Amanda → Daniela",
        state: (!client || operatorResult.error || queuedAlerts.error || operatorInbound.error ? "unavailable" : !operatorTemplateReady || (operatorInbound.count || 0) > 0 ? "degraded" : operatorReady ? "connected" : operatorStatus ? "configured" : "degraded") as HealthState,
        detail: !client ? "Supabase no configurado" : operatorResult.error || queuedAlerts.error || operatorInbound.error ? "No se pudo consultar el canal privado o su cola" : `${operatorStatus ? `Último aviso: ${operatorStatus}` : "Aún no hay avisos enviados"} · ${queuedAlerts.count ?? 0} alertas en cola · ${operatorInbound.count ?? 0} orientaciones pendientes${operatorTemplateReady ? "" : " · falta plantilla interna aprobada para fuera de 24 h"}`,
      },
      {
        name: "Amanda · motor conversacional",
        state: (!client || agentQueue.error || failedRuns.error || gatewayUsage.error ? "unavailable" : process.env.AMANDA_ENABLED !== "true" ? "configured" : (failedRuns.count || 0) > 0 ? "degraded" : "configured") as HealthState,
        detail: !client || agentQueue.error || failedRuns.error || gatewayUsage.error ? "Cola o historial no accesible; revisa las migraciones" : process.env.AMANDA_ENABLED !== "true" ? "Automatización desactivada" : `${agentQueue.count ?? 0} conversaciones en cola · ${failedRuns.count ?? 0} ejecuciones fallidas en 24 h · ${gatewayUsage.count ?? 0} solicitudes al Gateway en el último minuto · modelo ${process.env.AI_GATEWAY_MODEL || defaultAgentModel}`,
      },
      {
        name: "Pagos manuales de Amanda",
        state: (!client || manualOrders.error ? "unavailable" : "configured") as HealthState,
        detail: !client || manualOrders.error ? "Módulo no disponible; migración o configuración pendiente" : `${manualOrders.count ?? 0} pedidos pendientes de pago · sin confirmación automática por comprobante`,
      },
    ],
    security: [
      { label: "Sesiones firmadas", ok: Boolean(process.env.AUTH_SECRET) },
      { label: "Credenciales comerciales cifradas", ok: Boolean(process.env.BUSINESS_ADMIN_USERNAME && process.env.BUSINESS_ADMIN_PASSWORD_HASH) },
      { label: "Acceso técnico separado", ok: Boolean(process.env.TECH_ADMIN_USERNAME && process.env.TECH_ADMIN_PASSWORD_HASH) },
      { label: "HTTPS en producción", ok: isVercel },
    ],
    audit: auditResult.data || [],
    auditAvailable: !auditResult.error,
  };
}
