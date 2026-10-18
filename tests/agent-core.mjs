import assert from "node:assert/strict";
import test from "node:test";
import { allowedAgentStage, conversationTranscript, handoffNamedInMessage, operatorCaseCode } from "../lib/agent-core/conversation.ts";
import { supportedCatalogReply, supportedOperatorReply } from "../lib/whatsapp/amanda-business.ts";
import { safeGeneralRule } from "../lib/agent-core/knowledge.ts";

test("el núcleo conserva fragmentos y leyendas multimedia en orden", () => {
  assert.equal(conversationTranscript([
    { direction: "inbound", body: "Un denario", message_type: "text" },
    { direction: "inbound", body: "pero azul", message_type: "text" },
    { direction: "inbound", body: null, media_caption: "Así de pequeño", message_type: "image" },
  ]), "Cliente: Un denario\nCliente: pero azul\nCliente: Así de pequeño");
});

test("una regla general requiere aprobación sin contacto privado ni enlace", () => {
  assert.equal(safeGeneralRule("Para cotizar un envío, solicita primero la ciudad de destino."), "Para cotizar un envío, solicita primero la ciudad de destino.");
  assert.equal(safeGeneralRule("Escribe al 3016399833 para pagar."), null);
  assert.equal(safeGeneralRule("Ve a https://pago.example/cliente"), null);
});

test("el validador no deja cotizar montos ni enlaces ajenos al catálogo", () => {
  const products = [{ slug: "denario", price: 45000, sale_price: null }];
  assert.equal(supportedCatalogReply("Cuesta $45.000: https://liira-co.vercel.app/producto/denario", products), true);
  assert.equal(supportedCatalogReply("Mira https://liira-co.vercel.app/producto/denario.", products), true);
  assert.equal(supportedCatalogReply("Cuesta $48.000", products), false);
  assert.equal(supportedCatalogReply("Paga en https://otro-sitio.co/checkout", products), false);
  assert.equal(supportedCatalogReply("Paga en https://liira-co.vercel.app/pago/orden-inventada", products), false);
  assert.equal(supportedCatalogReply("Pago confirmado", products), false);
});

test("la guía humana no permite inventar enlace, monto ni confirmar pago", () => {
  const guidance = "Envío $15.000; enlace https://pago.example/orden-1";
  assert.equal(supportedOperatorReply("El envío cuesta $15.000; paga en https://pago.example/orden-1", guidance, false), false);
  assert.equal(supportedOperatorReply("El envío cuesta $15.000; paga en https://pago.example/orden-1", guidance, false, ["https://pago.example/orden-1"]), true);
  assert.equal(supportedOperatorReply("Paga en https://pago.example/orden-1.", guidance, false, ["https://pago.example/orden-1"]), true);
  assert.equal(supportedOperatorReply("El envío cuesta $20.000", guidance, false), false);
  assert.equal(supportedOperatorReply("Llega en 2 días", guidance, false), false);
  assert.equal(supportedOperatorReply("Paga en https://otro.example", guidance, false), false);
  assert.equal(supportedOperatorReply("Paga en http://pago.example/orden-1", guidance, false), false);
  assert.equal(supportedOperatorReply("Pago confirmado", guidance, false), false);
});

test("la referencia del caso identifica orientaciones de la operadora", () => {
  assert.equal(operatorCaseCode("Re: lir-a1b2c3, tarifa de envío"), "LIR-A1B2C3");
  assert.equal(handoffNamedInMessage("Para Yoinner, el envío depende de la ciudad", [{ id: "1", customerName: "Yoinner Gándara" }]), "1");
  assert.equal(handoffNamedInMessage("Para Yoinner, cotiza primero", [{ id: "1", customerName: "Yoinner Gándara" }, { id: "2", customerName: "Yoinner Gándara" }]), null);
  assert.equal(handoffNamedInMessage("Mañana te digo", [{ id: "1", customerName: "Ana" }]), null);
});

test("un modelo no puede declarar por sí mismo pago o venta confirmados", () => {
  assert.equal(allowedAgentStage("closed_won"), "recommendation");
  assert.equal(allowedAgentStage("closed_lost"), "recommendation");
  assert.equal(allowedAgentStage("awaiting_payment_proof"), "recommendation");
  assert.equal(allowedAgentStage("awaiting_shipping_quote"), "awaiting_shipping_quote");
});
