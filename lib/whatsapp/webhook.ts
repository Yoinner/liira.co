import { createHmac, timingSafeEqual } from "node:crypto";

type JsonRecord = Record<string, unknown>;

export type WhatsAppInboundMessage = {
  contactName: string;
  messageId: string;
  messageType: string;
  phone: string;
  phoneNumberId: string;
  providerTimestamp: string | null;
  text: string | null;
  mediaId: string | null;
  mediaCaption: string | null;
};

export type WhatsAppMessageStatus = {
  messageId: string;
  status: string;
  providerTimestamp: string | null;
};

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function messageText(message: JsonRecord) {
  const direct = text(record(message.text)?.body);
  if (direct) return direct;

  const button = text(record(message.button)?.text);
  if (button) return button;

  const interactive = record(message.interactive);
  const reply = record(interactive?.button_reply) || record(interactive?.list_reply);
  return text(reply?.title) || null;
}

function messageMedia(message: JsonRecord) {
  const type = text(message.type);
  if (type !== "image" && type !== "video") return { id: null, caption: null };
  const media = record(message[type]);
  return {
    id: text(media?.id) || null,
    caption: text(media?.caption).slice(0, 500) || null,
  };
}

export function verifyMetaSignature(rawBody: string, signature: string | null, appSecret: string) {
  if (!signature?.startsWith("sha256=") || !appSecret) return false;
  const received = signature.slice(7);
  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  if (received.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(received, "utf8"), Buffer.from(expected, "utf8"));
}

export function extractInboundMessages(payload: unknown): WhatsAppInboundMessage[] {
  const root = record(payload);
  const entries = Array.isArray(root?.entry) ? root.entry : [];
  const result: WhatsAppInboundMessage[] = [];

  for (const entryValue of entries) {
    const entry = record(entryValue);
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const changeValue of changes) {
      const change = record(changeValue);
      if (text(change?.field) !== "messages") continue;
      const value = record(change?.value);
      const metadata = record(value?.metadata);
      const contacts = Array.isArray(value?.contacts) ? value.contacts.map(record).filter(Boolean) as JsonRecord[] : [];
      const messages = Array.isArray(value?.messages) ? value.messages : [];

      for (const messageValue of messages) {
        const message = record(messageValue);
        if (!message) continue;
        const phone = text(message.from).replace(/\D/g, "");
        const messageId = text(message.id);
        if (!/^\d{7,15}$/.test(phone) || !messageId) continue;
        const contact = contacts.find((item) => text(item.wa_id).replace(/\D/g, "") === phone) || contacts[0];
        const contactName = text(record(contact?.profile)?.name) || "Contacto de WhatsApp";
        const media = messageMedia(message);

        result.push({
          contactName: contactName.slice(0, 100),
          messageId,
          messageType: text(message.type) || "unknown",
          phone,
          phoneNumberId: text(metadata?.phone_number_id),
          providerTimestamp: text(message.timestamp) || null,
          text: messageText(message)?.slice(0, 240) || null,
          mediaId: media.id,
          mediaCaption: media.caption,
        });
      }
    }
  }

  return result;
}

export function extractMessageStatuses(payload: unknown): WhatsAppMessageStatus[] {
  const root = record(payload);
  const entries = Array.isArray(root?.entry) ? root.entry : [];
  const result: WhatsAppMessageStatus[] = [];
  for (const entryValue of entries) {
    const entry = record(entryValue);
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const changeValue of changes) {
      const change = record(changeValue);
      if (text(change?.field) !== "messages") continue;
      const statuses = Array.isArray(record(change?.value)?.statuses) ? record(change?.value)?.statuses as unknown[] : [];
      for (const statusValue of statuses) {
        const status = record(statusValue);
        const messageId = text(status?.id);
        const state = text(status?.status);
        if (messageId && ["sent", "delivered", "read", "failed", "deleted"].includes(state)) result.push({ messageId, status: state, providerTimestamp: text(status?.timestamp) || null });
      }
    }
  }
  return result;
}
