import assert from "node:assert/strict";
import test from "node:test";
import { amandaSafeFallback } from "../lib/whatsapp/amanda-copy.ts";

test("responde saludos simples aunque AI Gateway no esté disponible", () => {
  assert.match(amandaSafeFallback("buena", "Daniela García"), /Hola Daniela.*Soy Amanda.*disponible.*personalizado/s);
  assert.match(amandaSafeFallback("ola", "Daniela", true), /Hola de nuevo.*en qué te gustaría/s);
});

test("pide contexto sin inventar cuando falla la IA", () => {
  assert.match(amandaSafeFallback("Quiero eso pero no sé", "Daniela"), /Quiero entenderte bien.*producto disponible.*personalizado.*pedido/s);
  assert.equal(amandaSafeFallback("La verdad", "Daniela", true), "Te leo 💛 Cuéntame un poco más para poder orientarte bien.");
  assert.equal(amandaSafeFallback("   ", "Daniela"), null);
});
