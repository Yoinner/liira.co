import assert from "node:assert/strict";
import test from "node:test";
import { amandaGreetingFallback } from "../lib/whatsapp/amanda-copy.ts";

test("responde saludos simples aunque AI Gateway no esté disponible", () => {
  assert.match(amandaGreetingFallback("buena", "Daniela García"), /Hola Daniela.*Soy Amanda.*disponible.*personalizado/s);
  assert.match(amandaGreetingFallback("Buenas noches", "Daniela", true), /¡Hola, Daniela!.*disponible.*personalizado/s);
});

test("no improvisa respuestas comerciales fuera de un saludo", () => {
  assert.equal(amandaGreetingFallback("¿Cuánto cuesta el rosario?", "Daniela"), null);
});
