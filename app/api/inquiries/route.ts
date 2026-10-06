import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { inquiryPayloadSchema } from "@/lib/validation/crm";

function hashIp(ip: string) {
  const secret = process.env.AUTH_SECRET || "liira-development-rate-limit";
  return createHmac("sha256", secret).update(ip).digest("hex");
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const parsed = inquiryPayloadSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Revisa la información enviada." }, { status: 400 });

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
  const { data: customer, error: customerError } = await client.from("customers").upsert({
    normalized_phone: payload.customerPhone,
    phone: payload.customerPhone,
    name: payload.customerName,
    last_contact_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "normalized_phone", ignoreDuplicates: false }).select("id").single();

  if (customerError || !customer) return NextResponse.json({ error: "No se pudo registrar el contacto." }, { status: 503 });

  const { data: inquiry, error } = await client.from("inquiries").insert({
    product_id: payload.productId || null,
    product_name: payload.productName,
    customer_id: customer.id,
    customer_name: payload.customerName,
    customer_phone: payload.customerPhone,
    color_preference: payload.colorPreference || null,
    customization: payload.customization || null,
    status: "contacto",
    pipeline_stage: "nuevo",
    priority: "normal",
    source: "whatsapp_web",
  }).select("id").single();

  if (error || !inquiry) return NextResponse.json({ error: "No se pudo registrar la solicitud." }, { status: 503 });
  await client.from("customer_activities").insert({
    customer_id: customer.id,
    inquiry_id: inquiry.id,
    activity_type: "inquiry_created",
    summary: `Solicitó información sobre ${payload.productName}`,
  });
  return NextResponse.json({ ok: true }, { status: 201 });
}
