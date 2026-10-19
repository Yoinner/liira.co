import { timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { analyzeWhatsAppConversation } from "@/lib/whatsapp/classify";
import { amandaEnabledForPhone } from "@/lib/whatsapp/amanda-rollout";
import { handleAmandaOperatorInbound, isAmandaOperator, persistAmandaOperatorInbound, persistWhatsAppMedia, runAmandaForInbound } from "@/lib/whatsapp/amanda";
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
  const seconds = Number(message.providerTimestamp);
  const providerAt = message.providerTimestamp && Number.isFinite(seconds) && seconds > 0 && seconds < 4_102_444_800 ? new Date(seconds * 1000).toISOString() : null;
  const result = await client.rpc("persist_liira_whatsapp_inbound", {
    p_phone: message.phone, p_name: message.contactName, p_message_id: message.messageId,
    p_type: message.messageType, p_body: message.text, p_media_id: message.mediaId,
    p_caption: message.mediaCaption, p_provider_at: providerAt, p_phone_number_id: message.phoneNumberId,
  });
  if (result.error || !result.data?.[0]) throw new Error("inbound_persist_failed");
  const row = result.data[0];
  return row.inserted ? { conversationId: row.conversation_id as string, messageId: row.message_id as string, phone: message.phone } : null;
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
    const customerMessages: Array<{ conversationId: string; messageId: string; phone: string }> = [];
    const operatorMessageIds: string[] = [];
    for (const message of extractInboundMessages(payload)) {
      if (!process.env.WHATSAPP_PHONE_NUMBER_ID || message.phoneNumberId !== process.env.WHATSAPP_PHONE_NUMBER_ID) {
        console.warn("whatsapp_unexpected_phone_number_id", { message_id: message.messageId });
        continue;
      }
      if (isAmandaOperator(message.phone)) {
        const id = await persistAmandaOperatorInbound(message);
        if (id) operatorMessageIds.push(id);
      }
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
      for (const id of operatorMessageIds) await handleAmandaOperatorInbound(id, oidcToken);
      for (const item of customerMessages) {
        await persistWhatsAppMedia(item.messageId);
      }
      if (customerMessages.length) await new Promise((resolve) => setTimeout(resolve, 3_200));
      for (const { conversationId, phone } of new Map(customerMessages.map((item) => [item.conversationId, item])).values()) {
        if (amandaEnabledForPhone(phone)) await runAmandaForInbound(conversationId, oidcToken);
        else await analyzeWhatsAppConversation(conversationId, oidcToken);
      }
    });
  } catch {
    return new Response("Procesamiento temporalmente no disponible", { status: 503 });
  }

  return new Response("EVENT_RECEIVED", { status: 200, headers: { "cache-control": "no-store" } });
}
