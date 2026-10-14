import { timingSafeEqual } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { extractInboundMessages, verifyMetaSignature, type WhatsAppInboundMessage } from "@/lib/whatsapp/webhook";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BODY_BYTES = 1_000_000;

function equalSecret(left: string, right: string) {
  if (!left || left.length !== right.length) return false;
  return timingSafeEqual(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

async function persistInboundMessage(message: WhatsAppInboundMessage) {
  const client = getSupabaseAdmin();
  if (!client) throw new Error("database_unavailable");

  const duplicate = await client.from("customer_activities").select("id").contains("metadata", { provider_message_id: message.messageId }).limit(1);
  if (duplicate.error) throw new Error("idempotency_check_failed");
  if (duplicate.data?.length) return;

  const now = new Date().toISOString();
  const existing = await client.from("customers").select("id").eq("normalized_phone", message.phone).maybeSingle();
  if (existing.error) throw new Error("customer_lookup_failed");

  let customerId = existing.data?.id;
  if (customerId) {
    const updated = await client.from("customers").update({ last_contact_at: now, updated_at: now }).eq("id", customerId);
    if (updated.error) throw new Error("customer_update_failed");
  } else {
    const created = await client.from("customers").insert({
      normalized_phone: message.phone,
      phone: message.phone,
      name: message.contactName,
      last_contact_at: now,
    }).select("id").single();
    if (created.error || !created.data) {
      const raced = await client.from("customers").select("id").eq("normalized_phone", message.phone).maybeSingle();
      if (raced.error || !raced.data) throw new Error("customer_create_failed");
      customerId = raced.data.id;
    } else {
      customerId = created.data.id;
    }
  }

  const summary = message.text ? `WhatsApp: ${message.text}` : `Mensaje de WhatsApp (${message.messageType})`;
  const inserted = await client.from("customer_activities").insert({
    customer_id: customerId,
    activity_type: "whatsapp_inbound",
    summary: summary.slice(0, 300),
    metadata: {
      message_type: message.messageType,
      phone_number_id: message.phoneNumberId,
      provider_message_id: message.messageId,
      provider_timestamp: message.providerTimestamp,
    },
  });
  if (inserted.error) throw new Error("message_persist_failed");
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode") || "";
  const token = url.searchParams.get("hub.verify_token") || "";
  const challenge = url.searchParams.get("hub.challenge") || "";
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || "";

  if (!verifyToken) return new Response("Webhook no configurado", { status: 503 });
  if (mode !== "subscribe" || !equalSecret(token, verifyToken)) return new Response("Verificación rechazada", { status: 403 });
  return new Response(challenge, { status: 200, headers: { "content-type": "text/plain", "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const declaredSize = Number(request.headers.get("content-length") || 0);
  if (declaredSize > MAX_BODY_BYTES) return new Response("Payload demasiado grande", { status: 413 });

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) return new Response("Payload demasiado grande", { status: 413 });

  const appSecret = process.env.META_APP_SECRET || "";
  if (!appSecret) return new Response("Webhook no configurado", { status: 503 });
  if (!verifyMetaSignature(rawBody, request.headers.get("x-hub-signature-256"), appSecret)) {
    return new Response("Firma inválida", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Payload inválido", { status: 400 });
  }

  try {
    for (const message of extractInboundMessages(payload)) await persistInboundMessage(message);
  } catch {
    return new Response("Procesamiento temporalmente no disponible", { status: 503 });
  }

  return new Response("EVENT_RECEIVED", { status: 200, headers: { "cache-control": "no-store" } });
}
