import assert from "node:assert/strict";
import test from "node:test";
import { amandaSafeFallback } from "../lib/whatsapp/amanda-copy.ts";

test("responde saludos simples aunque AI Gateway no esté disponible", () => {
  assert.match(amandaSafeFallback("buena", "Daniela García").reply, /Hola Daniela.*Soy Amanda.*disponible.*personalizado/s);
  assert.match(amandaSafeFallback("ola", "Daniela", true).reply, /Hola de nuevo.*en qué te gustaría/s);
});

test("pide contexto sin inventar cuando falla la IA", () => {
  assert.match(amandaSafeFallback("Quiero eso pero no sé", "Daniela").reply, /Quiero entenderte bien.*producto disponible.*personalizado.*pedido/s);
  assert.equal(amandaSafeFallback("La verdad", "Daniela", true).reply, "Entiendo. Para ayudarte bien, ¿qué te gustaría saber o conseguir en este momento?");
  assert.equal(amandaSafeFallback("   ", "Daniela"), null);
});

test("escala consultas de envío sin abandonar ni repetir al cliente", () => {
  const fallback = amandaSafeFallback("Quisiera ordenar una prenda, pero quiero saber del envío antes", "Yoinner", true);
  assert.match(fallback.reply, /persona encargada de los envíos.*costo.*tiempo/s);
  assert.doesNotMatch(fallback.reply, /Dani|💛/);
  assert.match(fallback.handoffQuestion, /proceso de envío.*Indícame qué debo explicarle/s);
});

test("mantiene una conversación de compra útil durante una caída de IA", () => {
  assert.match(amandaSafeFallback("Ajá y cómo haría para comprar una prenda", "Yoinner", true).reply, /compra la hacemos por este chat.*qué accesorio/s);
  assert.match(amandaSafeFallback("Un denario", "Yoinner", true).reply, /Te ayudo con denario.*disponibles.*personalizarlo/s);
  assert.match(amandaSafeFallback("Un denario o un collar", "Yoinner", true).reply, /denario o collar.*disponibles.*personalizarlo/s);
});
