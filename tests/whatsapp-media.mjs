import assert from "node:assert/strict";
import test from "node:test";
import { inspectOutboundMedia, mediaMessagePayload } from "../lib/whatsapp/outbound-media.ts";

test("valida la firma real de una imagen y crea el mensaje de Meta", () => {
  const media = inspectOutboundMedia(new Uint8Array([0xff, 0xd8, 0xff, 0x00]), "image/jpeg");
  assert.deepEqual(media, { kind: "image", extension: "jpg", mimeType: "image/jpeg" });
  assert.deepEqual(mediaMessagePayload("573001234567", "image", "media_123", "  Muestra  "), {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: "573001234567",
    type: "image",
    image: { id: "media_123", caption: "Muestra" },
  });
});

test("rechaza archivos disfrazados y destinatarios inválidos", () => {
  assert.throws(() => inspectOutboundMedia(new Uint8Array([1, 2, 3]), "image/jpeg"), /invalid_whatsapp_media/);
  assert.throws(() => mediaMessagePayload("número-inválido", "video", "media_123"), /invalid_whatsapp_media_message/);
});
