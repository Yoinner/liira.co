import assert from "node:assert/strict";
import test from "node:test";
import { shippingQuoteGuidance, shippingQuoteIsCurrent } from "../lib/whatsapp/shipping-quote.ts";

const quote = { destination: "Bucaramanga, Cabecera", item_summary: "Denario rosa", amount_cop: 12000, delivery_estimate: "2 a 4 días hábiles", conditions: "Sujeto a cobertura de la transportadora", source_last_inbound_at: "2026-10-18T12:00:00.000Z", expires_at: "2026-10-19T12:00:00.000Z", order_id: null };

test("la cotización solo sirve para el estado y vigencia aprobados", () => {
  assert.equal(shippingQuoteIsCurrent(quote, quote.source_last_inbound_at, Date.parse("2026-10-18T18:00:00Z")), true);
  assert.equal(shippingQuoteIsCurrent(quote, "2026-10-18T12:05:00.000Z", Date.parse("2026-10-18T18:00:00Z")), false);
  assert.equal(shippingQuoteIsCurrent(quote, quote.source_last_inbound_at, Date.parse(quote.expires_at)), false);
  assert.equal(shippingQuoteIsCurrent({ ...quote, expires_at: "invalid" }, quote.source_last_inbound_at), false);
  assert.match(shippingQuoteGuidance(quote), /Bucaramanga, Cabecera.*12\.000 COP.*2 a 4 días hábiles/);
});
