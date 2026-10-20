import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { inquiryPayloadSchema } from "@/lib/validation/crm";
import { marketingConsentText, privacyVersion } from "@/lib/privacy";
import { verifyTurnstile } from "@/lib/turnstile";

function hashIp(ip: string) {
  const secret = process.env.AUTH_SECRET || "liira-development-rate-limit";
  return createHmac("sha256", secret).update(ip).digest("hex");
}

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Origen no permitido." }, { status: 403 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const parsed = inquiryPayloadSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Revisa la información enviada." }, { status: 400 });
  if (!await verifyTurnstile(parsed.data.turnstileToken, request)) return NextResponse.json({ error: "Completa nuevamente la verificación de seguridad." }, { status: 403 });

  const client = getSupabaseAdmin();
  if (!client) return NextResponse.json({ error: "Registro temporalmente no disponible." }, { status: 503 });

  const ipHash = hashIp(ip);
  const since = new Date(Date.now() - 60_000).toISOString();
  const rateLimit = await client.from("public_form_attempts").select("id", { count: "exact", head: true }).eq("form_name", "inquiry").eq("ip_hash", ipHash).gte("created_at", since);
  if (rateLimit.error) return NextResponse.json({ error: "Registro temporalmente no disponible." }, { status: 503 });
  if ((rateLimit.count || 0) >= 8) return NextResponse.json({ error: "Intenta de nuevo en un momento." }, { status: 429 });
  const attempt = await client.from("public_form_attempts").insert({ form_name: "inquiry", ip_hash: ipHash });
  if (attempt.error) return NextResponse.json({ error: "Registro temporalmente no disponible." }, { status: 503 });

  const payload = parsed.data;
  if (payload.kind === "restock" && (!payload.productId || !payload.restockConsent)) return NextResponse.json({ error: "Autoriza este aviso para poder registrarlo." }, { status: 400 });
  const existing = await client.from("inquiries").select("id").eq("request_key", payload.requestKey).maybeSingle();
  if (existing.error) return NextResponse.json({ error: "Registro temporalmente no disponible." }, { status: 503 });
  if (existing.data) return NextResponse.json({ ok: true, duplicate: true });
  const selected = payload.productId ? await client.from("products").select("name,stock,active").eq("id", payload.productId).maybeSingle() : null;
  if (selected?.error || (payload.productId && (!selected?.data || !selected.data.active))) return NextResponse.json({ error: "La pieza ya no está disponible para esta solicitud." }, { status: 409 });
  if (payload.kind === "restock" && selected?.data?.stock !== 0) return NextResponse.json({ error: "Esta pieza ya está disponible; revisa su ficha actualizada." }, { status: 409 });
  if (payload.kind === "standard" && selected?.data?.stock === 0) return NextResponse.json({ error: "Esta pieza se agotó; revisa su ficha para solicitar un aviso o consultar alternativas." }, { status: 409 });
  const { data: customer, error: customerError } = await client.from("customers").upsert({
    normalized_phone: payload.customerPhone,
    phone: payload.customerPhone,
    name: payload.customerName,
    last_contact_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "normalized_phone", ignoreDuplicates: false }).select("id").single();

  if (customerError || !customer) return NextResponse.json({ error: "No se pudo registrar el contacto." }, { status: 503 });

  if (payload.marketingConsent) {
    const consent = await client.from("customer_activities").insert({ customer_id: customer.id, activity_type: "marketing_consent_granted", summary: "Autorizó mensajes comerciales de Liira desde el formulario web.", metadata: { purpose: "whatsapp_marketing", source: "web_inquiry", notice_version: privacyVersion, notice_text: marketingConsentText } });
    if (consent.error) return NextResponse.json({ error: "No se pudo registrar el consentimiento." }, { status: 503 });
    const grant = await client.from("customers").update({ marketing_consent: true }).eq("id", customer.id);
    if (grant.error) return NextResponse.json({ error: "No se pudo guardar el consentimiento." }, { status: 503 });
  }

  const { data: inquiry, error } = await client.from("inquiries").insert({
    request_key: payload.requestKey,
    product_id: payload.productId || null,
    product_name: selected?.data?.name || payload.productName,
    customer_id: customer.id,
    customer_name: payload.customerName,
    customer_phone: payload.customerPhone,
    color_preference: payload.colorPreference || null,
    customization: payload.kind === "restock" ? `Solicita un aviso único cuando vuelva a estar disponible ${selected?.data?.name}.` : payload.customization || null,
    status: "contacto",
    pipeline_stage: "nuevo",
    priority: "normal",
    source: payload.kind === "restock" ? "restock_web" : "whatsapp_web",
    restock_consent_at: payload.kind === "restock" ? new Date().toISOString() : null,
    restock_consent_version: payload.kind === "restock" ? privacyVersion : null,
  }).select("id").single();

  if (error?.code === "23505") {
    const duplicate = await client.from("inquiries").select("id").eq("request_key", payload.requestKey).maybeSingle();
    if (duplicate.data) return NextResponse.json({ ok: true, duplicate: true });
  }
  if (error || !inquiry) return NextResponse.json({ error: "No se pudo registrar la solicitud." }, { status: 503 });
  if (payload.kind === "restock") await client.from("customer_activities").insert({
    customer_id: customer.id, inquiry_id: inquiry.id, activity_type: "restock_notice_requested",
    summary: `Solicitó un aviso único si vuelve ${selected?.data?.name || payload.productName}.`,
    metadata: { source: "web_restock", product_id: payload.productId, notice_version: privacyVersion, request_key: payload.requestKey, automatic_delivery: false },
  });
  await client.from("customer_activities").insert({
    customer_id: customer.id,
    inquiry_id: inquiry.id,
    activity_type: "inquiry_created",
    summary: payload.kind === "restock" ? `Se registró interés en ${selected?.data?.name || payload.productName} agotado` : `Solicitó información sobre ${selected?.data?.name || payload.productName}`,
  });
  return NextResponse.json({ ok: true }, { status: 201 });
}
