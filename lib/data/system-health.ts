import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/server";

export type HealthState = "connected" | "configured" | "degraded" | "unavailable";

export async function getSystemHealth() {
  const client = getSupabaseAdmin();
  const [databaseResult, storageResult, auditResult] = client
    ? await Promise.all([
        client.from("categories").select("id", { count: "exact", head: true }),
        client.storage.listBuckets(),
        client.from("audit_events").select("id,action,entity_type,created_at").order("created_at", { ascending: false }).limit(8),
      ])
    : [{ error: new Error("not configured"), count: null }, { error: new Error("not configured"), data: null }, { error: new Error("not configured"), data: null }];

  const storageReady = !storageResult.error && Boolean(storageResult.data?.some((bucket) => bucket.id === "products"));
  const isVercel = Boolean(process.env.VERCEL);

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
        name: "WhatsApp",
        state: (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ? "configured" : "unavailable") as HealthState,
        detail: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ? "Canal de pedidos configurado" : "Número no configurado",
      },
    ],
    security: [
      { label: "Sesiones firmadas", ok: Boolean(process.env.AUTH_SECRET) },
      { label: "Contraseña con hash", ok: Boolean(process.env.ADMIN_PASSWORD_HASH) },
      { label: "Acceso privado", ok: Boolean(process.env.ADMIN_USERNAME) },
      { label: "HTTPS en producción", ok: isVercel },
    ],
    audit: auditResult.data || [],
    auditAvailable: !auditResult.error,
  };
}

