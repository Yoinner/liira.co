import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { extractInboundMessages, extractMessageStatuses, verifyMetaSignature } from "../lib/whatsapp/webhook.ts";

test("valida la firma de Meta sin aceptar firmas alteradas", () => {
  const body = JSON.stringify({ object: "whatsapp_business_account" });
  const secret = "test-secret";
  const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  assert.equal(verifyMetaSignature(body, signature, secret), true);
  assert.equal(verifyMetaSignature(`${body}x`, signature, secret), false);
  assert.equal(verifyMetaSignature(body, null, secret), false);
});

test("extrae estados de entrega conocidos y descarta estados inválidos", () => {
  const statuses = extractMessageStatuses({ entry: [{ changes: [{ field: "messages", value: { statuses: [
    { id: "wamid.1", status: "delivered", timestamp: "1792010100" },
    { id: "wamid.2", status: "inventado" },
  ] } }] }] });
  assert.deepEqual(statuses, [{ messageId: "wamid.1", status: "delivered", providerTimestamp: "1792010100" }]);
});

test("extrae únicamente mensajes entrantes válidos y normalizados", () => {
  const messages = extractInboundMessages({
    entry: [{ changes: [{ field: "messages", value: {
      metadata: { phone_number_id: "12345" },
      contacts: [{ wa_id: "+57 301 555 0101", profile: { name: "Daniela" } }],
      messages: [{ from: "+57 301 555 0101", id: "wamid.demo", timestamp: "1792010000", type: "text", text: { body: "  Hola Liira  " } }],
    } }] }],
  });

  assert.deepEqual(messages, [{
    contactName: "Daniela",
    messageId: "wamid.demo",
    messageType: "text",
    phone: "573015550101",
    phoneNumberId: "12345",
    providerTimestamp: "1792010000",
    text: "Hola Liira",
    mediaId: null,
    mediaCaption: null,
  }]);
});

test("extrae imágenes y videos con su identificador y pie", () => {
  const messages = extractInboundMessages({ entry: [{ changes: [{ field: "messages", value: {
    metadata: { phone_number_id: "12345" },
    contacts: [{ wa_id: "573015550101", profile: { name: "Laura" } }],
    messages: [
      { from: "573015550101", id: "wamid.image", type: "image", image: { id: "media_123456", caption: "Referencia rosada" } },
      { from: "573015550101", id: "wamid.video", type: "video", video: { id: "media_654321" } },
    ],
  } }] }] });
  assert.deepEqual(messages.map(({ messageType, mediaId, mediaCaption }) => ({ messageType, mediaId, mediaCaption })), [
    { messageType: "image", mediaId: "media_123456", mediaCaption: "Referencia rosada" },
    { messageType: "video", mediaId: "media_654321", mediaCaption: null },
  ]);
});
