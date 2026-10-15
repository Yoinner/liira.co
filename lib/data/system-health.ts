import "server-only";

import { siteConfig } from "@/lib/config";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export type HealthState = "connected" | "configured" | "degraded" | "unavailable";

export async function getSystemHealth() {
  const client = getSupabaseAdmin();
  const [databaseResult, storageResult, auditResult, crmResult] = client
    ? await Promise.all([
        client.from("categories").select("id", { count: "exact", head: true }),
        client.storage.listBuckets(),
        client.from("audit_events").select("id,action,entity_type,created_at").order("created_at", { ascending: false }).limit(8),
        client.from("customers").select("id", { count: "exact", head: true }),
      ])
    : [{ error: new Error("not configured"), count: null }, { error: new Error("not configured"), data: null }, { error: new Error("not configured"), data: null }, { error: new Error("not configured"), count: null }];

  const storageReady = !storageResult.error && Boolean(storageResult.data?.some((bucket) => bucket.id === "products"));
  const isVercel = Boolean(process.env.VERCEL);
  const whatsappWebhookReady = Boolean(process.env.WHATSAPP_VERIFY_TOKEN && process.env.META_APP_SECRET);
  const whatsappMessagingReady = Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_BUSINESS_ACCOUNT_ID);

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
        state: (whatsappWebhookReady && whatsappMessagingReady ? "configured" : whatsappWebhookReady ? "degraded" : "unavailable") as HealthState,
        detail: whatsappWebhookReady && whatsappMessagingReady ? "Webhook firmado y credenciales de producción presentes" : whatsappWebhookReady ? "Webhook preparado; faltan credenciales del número" : "Webhook y credenciales pendientes",
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
