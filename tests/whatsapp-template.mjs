import assert from "node:assert/strict";
import test from "node:test";
import { contactTemplatePayload } from "../lib/whatsapp/contact-template.ts";

test("construye la plantilla aprobada con variables nombradas y teléfono colombiano", () => {
  const payload = contactTemplatePayload("573001234567", "  Laura  ", " Denario personalizado ", "confirmacion_solicitud_liira");
  assert.equal(payload.to, "573001234567");
  assert.equal(payload.template.language.code, "es_CO");
  assert.deepEqual(payload.template.components[0].parameters.map((item) => item.text), ["Laura", "Denario personalizado"]);
});

test("rechaza destinatarios y plantillas no válidas antes de llamar a Meta", () => {
  assert.throws(() => contactTemplatePayload("3215056443", "Laura", "Denario", "confirmacion_solicitud_liira"), /invalid_whatsapp_template/);
  assert.throws(() => contactTemplatePayload("573001234567", "Laura", "Denario", "Plantilla con espacios"), /invalid_whatsapp_template/);
});
