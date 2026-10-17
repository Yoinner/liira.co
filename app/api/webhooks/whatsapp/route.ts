import { timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { analyzeWhatsAppConversation } from "@/lib/whatsapp/classify";
import { handleAmandaOperatorInbound, isAmandaOperator, persistWhatsAppMedia, runAmandaForInbound } from "@/lib/whatsapp/amanda";
import { extractInboundMessages, extractMessageStatuses, verifyMetaSignature, type WhatsAppInboundMessage } from "@/lib/whatsapp/webhook";

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

  const duplicate = await client.from("whatsapp_messages").select("conversation_id").eq("provider_message_id", message.messageId).maybeSingle();
  if (duplicate.error) throw new Error("idempotency_check_failed");
  if (duplicate.data) return null;

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
  const conversation = await client.from("whatsapp_conversations").upsert({
    customer_id: customerId,
    normalized_phone: message.phone,
    status: "requiere_respuesta",
    status_manual_at: null,
    last_message_at: now,
    last_inbound_at: now,
    agent_follow_up_at: null,
    agent_follow_up_source_message_id: null,
    agent_due_at: new Date(Date.now() + 3_000).toISOString(),
    ai_status: "pending",
    ai_error_code: null,
    updated_at: now,
  }, { onConflict: "normalized_phone" }).select("id,unread_count").single();
  if (conversation.error || !conversation.data) throw new Error("conversation_upsert_failed");
  const unread = await client.rpc("increment_whatsapp_unread", { conversation: conversation.data.id });
  if (unread.error) throw new Error("conversation_counter_failed");
  const stored = await client.from("whatsapp_messages").insert({
    conversation_id: conversation.data.id,
    customer_id: customerId,
    provider_message_id: message.messageId,
    direction: "inbound",
    message_type: message.messageType,
    body: message.text,
    media_id: message.mediaId,
    media_caption: message.mediaCaption,
    provider_timestamp: message.providerTimestamp ? new Date(Number(message.providerTimestamp) * 1000).toISOString() : null,
    metadata: { phone_number_id: message.phoneNumberId },
  }).select("id").single();
  if (stored.error || !stored.data) throw new Error("message_persist_failed");
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
  if (inserted.error) throw new Error("activity_persist_failed");
  return { conversationId: conversation.data.id as string, messageId: stored.data.id as string };
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
    const customerMessages: Array<{ conversationId: string; messageId: string }> = [];
    const operatorMessages: WhatsAppInboundMessage[] = [];
    for (const message of extractInboundMessages(payload)) {
      if (isAmandaOperator(message.phone)) operatorMessages.push(message);
      else {
        const stored = await persistInboundMessage(message);
        if (stored) customerMessages.push(stored);
      }
    }
    const client = getSupabaseAdmin();
    for (const status of extractMessageStatuses(payload)) {
      if (!client) throw new Error("database_unavailable");
      const [customerMessage, operatorMessage] = await Promise.all([
        client.from("whatsapp_messages").update({ delivery_status: status.status }).eq("provider_message_id", status.messageId),
        client.from("amanda_operator_messages").update({ delivery_status: status.status }).eq("provider_message_id", status.messageId),
      ]);
      if (customerMessage.error || operatorMessage.error) throw new Error("status_update_failed");
    }
    const oidcToken = request.headers.get("x-vercel-oidc-token");
    after(async () => {
      for (const message of operatorMessages) await handleAmandaOperatorInbound(message, oidcToken);
      for (const item of customerMessages) {
        await persistWhatsAppMedia(item.messageId);
      }
      if (customerMessages.length) await new Promise((resolve) => setTimeout(resolve, 3_200));
      for (const conversationId of new Set(customerMessages.map((item) => item.conversationId))) {
        if (process.env.AMANDA_ENABLED === "true") await runAmandaForInbound(conversationId, oidcToken);
        else await analyzeWhatsAppConversation(conversationId, oidcToken);
      }
    });
  } catch {
    return new Response("Procesamiento temporalmente no disponible", { status: 503 });
  }

  return new Response("EVENT_RECEIVED", { status: 200, headers: { "cache-control": "no-store" } });
}
