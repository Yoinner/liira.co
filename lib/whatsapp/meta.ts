import "server-only";

import { contactTemplatePayload } from "@/lib/whatsapp/contact-template";

const GRAPH_VERSION = process.env.META_GRAPH_API_VERSION || "v26.0";

function credentials() {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!accessToken || !phoneNumberId) throw new Error("whatsapp_not_configured");
  return { accessToken, phoneNumberId };
}

export async function sendMetaText(to: string, body: string) {
  const { accessToken, phoneNumberId } = credentials();
  if (!/^\d{10,15}$/.test(to) || !body.trim() || body.length > 2000) throw new Error("invalid_whatsapp_message");
  const response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { preview_url: true, body: body.trim() } }),
    signal: AbortSignal.timeout(10_000),
  });
  const payload = await response.json() as { messages?: Array<{ id?: string }> };
  const messageId = payload.messages?.[0]?.id;
  if (!response.ok || !messageId) throw new Error("meta_message_rejected");
  return messageId;
}

export async function sendMetaContactTemplate(to: string, customerName: string, topic: string) {
  const { accessToken, phoneNumberId } = credentials();
  const templateName = process.env.WHATSAPP_INIT_TEMPLATE_NAME;
  if (!templateName) throw new Error("whatsapp_template_not_configured");
  const response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify(contactTemplatePayload(to, customerName, topic, templateName, process.env.WHATSAPP_INIT_TEMPLATE_LANGUAGE || "es_CO")),
    signal: AbortSignal.timeout(10_000),
  });
  const payload = await response.json() as { messages?: Array<{ id?: string }> };
  const messageId = payload.messages?.[0]?.id;
  if (!response.ok || !messageId) throw new Error("meta_template_rejected");
  return { messageId, templateName };
}

export async function downloadMetaMedia(mediaId: string) {
  const { accessToken } = credentials();
  if (!/^[A-Za-z0-9_-]{6,200}$/.test(mediaId)) throw new Error("invalid_media_id");
  const metadata = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}`, {
    headers: { authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  });
  const info = await metadata.json() as { url?: string; mime_type?: string; file_size?: number };
  if (!metadata.ok || !info.url || !info.mime_type) throw new Error("media_metadata_unavailable");
  if (!/^(image\/(jpeg|png|webp|gif)|video\/(mp4|quicktime|3gpp))$/.test(info.mime_type)) throw new Error("unsupported_media_type");
  if (Number(info.file_size || 0) > 20 * 1024 * 1024) throw new Error("media_too_large");
  const response = await fetch(info.url, {
    headers: { authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error("media_download_failed");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 20 * 1024 * 1024) throw new Error("invalid_media_size");
  return { bytes, mimeType: info.mime_type };
}
