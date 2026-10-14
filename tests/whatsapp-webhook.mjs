import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { extractInboundMessages, verifyMetaSignature } from "../lib/whatsapp/webhook.ts";

test("valida la firma de Meta sin aceptar firmas alteradas", () => {
  const body = JSON.stringify({ object: "whatsapp_business_account" });
  const secret = "test-secret";
  const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  assert.equal(verifyMetaSignature(body, signature, secret), true);
  assert.equal(verifyMetaSignature(`${body}x`, signature, secret), false);
  assert.equal(verifyMetaSignature(body, null, secret), false);
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
  }]);
});
