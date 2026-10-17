import assert from "node:assert/strict";
import test from "node:test";
import { allowedAgentStage, conversationTranscript, operatorCaseCode, shouldResumeAfterGuidance } from "../lib/agent-core/conversation.ts";
import { supportedCatalogReply } from "../lib/whatsapp/amanda-business.ts";
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
  const products = [{ price: 45000, sale_price: null }];
  assert.equal(supportedCatalogReply("Cuesta $45.000: https://liira-co.vercel.app/producto/denario", products), true);
  assert.equal(supportedCatalogReply("Cuesta $48.000", products), false);
  assert.equal(supportedCatalogReply("Paga en https://otro-sitio.co/checkout", products), false);
});

test("un caso solo se reanuda con su respuesta, contexto vigente y modo autónomo", () => {
  assert.equal(operatorCaseCode("Re: lir-a1b2c3, tarifa de envío"), "LIR-A1B2C3");
  assert.equal(shouldResumeAfterGuidance("autonomous", "source-1", "source-1"), true);
  assert.equal(shouldResumeAfterGuidance("human", "source-1", "source-1"), false);
  assert.equal(shouldResumeAfterGuidance("autonomous", "source-1", "source-2"), false);
});

test("un modelo no puede declarar por sí mismo pago o venta confirmados", () => {
  assert.equal(allowedAgentStage("closed_won"), "recommendation");
  assert.equal(allowedAgentStage("closed_lost"), "recommendation");
  assert.equal(allowedAgentStage("awaiting_payment_proof"), "recommendation");
  assert.equal(allowedAgentStage("awaiting_shipping_quote"), "awaiting_shipping_quote");
});
