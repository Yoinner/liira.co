import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { gatewayJson, gatewayRetryDelay } from "../lib/agent-core/gateway.ts";
import { decisionSchema } from "../lib/whatsapp/amanda-decision.ts";

const schema = z.object({ reply: z.string().min(1) });
const base = { schema, system: "Responde JSON", user: "Hola", token: "fake-test-token", model: "google/gemini-2.5-flash" };

test("403 RestrictedModelsError es incidente técnico definitivo, nunca una consulta comercial", async () => {
  const result = await gatewayJson({ ...base, fetcher: async () => new Response(JSON.stringify({ error: { type: "no_providers_available", param: { name: "RestrictedModelsError" } } }), { status: 403 }) });
  assert.equal(result.value, null);
  assert.equal(result.errorCode, "model_restricted_free_tier");
  assert.equal(gatewayRetryDelay(result.errorCode, 1), null);
});

test("JSON inválido, salida vacía y timeout son recuperables con tope", async () => {
  const invalid = await gatewayJson({ ...base, fetcher: async () => new Response(JSON.stringify({ choices: [{ message: { content: "no-json" } }] })) });
  assert.equal(invalid.errorCode, "invalid_json");
  const empty = await gatewayJson({ ...base, fetcher: async () => new Response(JSON.stringify({ choices: [] })) });
  assert.equal(empty.errorCode, "empty_model_output");
  const timeout = await gatewayJson({ ...base, fetcher: async () => { throw new DOMException("timed out", "TimeoutError"); } });
  assert.equal(timeout.errorCode, "gateway_timeout");
  assert.equal(gatewayRetryDelay("gateway_timeout", 1), 60_000);
  assert.equal(gatewayRetryDelay("gateway_timeout", 2), 120_000);
  assert.equal(gatewayRetryDelay("gateway_timeout", 3), null);
});

test("tool calling usa resultado real de una herramienta antes de redactar", async () => {
  let calls = 0;
  const result = await gatewayJson({
    ...base,
    tools: { searchProducts: { description: "Busca productos", parameters: z.object({ query: z.string() }), execute: async ({ query }) => ({ query, found: 1, name: "Denario" }) } },
    fetcher: async (_url, request) => {
      const body = JSON.parse(request.body);
      calls += 1;
      assert.equal(body.response_format, undefined);
      if (calls === 1) return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "call_1", type: "function", function: { name: "searchProducts", arguments: '{"query":"denario"}' } }] } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }));
      assert.equal(body.messages.at(-1).role, "tool");
      assert.equal(JSON.parse(body.messages.at(-1).content).name, "Denario");
      return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: '{"reply":"Tenemos un denario disponible."}' } }], usage: { prompt_tokens: 12, completion_tokens: 6 } }));
    },
  });
  assert.equal(result.value.reply, "Tenemos un denario disponible.");
  assert.equal(result.inputTokens, 22);
  assert.equal(result.outputTokens, 11);
  assert.equal(calls, 2);
});

test("presupuesto compartido bloquea antes de consumir Gateway y registra cada ronda autorizada", async () => {
  let requests = 0;
  const blocked = await gatewayJson({ ...base, budget: { reserve: async () => null, record: async () => assert.fail("sin reserva") }, fetcher: async () => { requests += 1; throw new Error("no debe llamarse"); } });
  assert.equal(blocked.errorCode, "gateway_rate_limited");
  assert.equal(requests, 0);
  const records = [];
  const allowed = await gatewayJson({ ...base, budget: { reserve: async () => "slot-1", record: async (id, record) => records.push({ id, record }) }, fetcher: async () => { requests += 1; return new Response(JSON.stringify({ choices: [{ message: { content: '{"reply":"Hola"}' } }], usage: { prompt_tokens: 3, completion_tokens: 2 } })); } });
  assert.equal(allowed.value.reply, "Hola");
  assert.equal(records[0].id, "slot-1");
  assert.equal(records[0].record.input_tokens, 3);
  assert.equal(requests, 1);
});

test("salida de herramientas fuera del esquema se revalida sin herramientas", async () => {
  let calls = 0;
  const result = await gatewayJson({
    ...base,
    tools: { getPolicy: { description: "Política de envíos", parameters: z.object({}), execute: async () => ({ shipping: "Cotización pendiente" }) } },
    fetcher: async (_url, request) => {
      const body = JSON.parse(request.body);
      calls += 1;
      if (calls === 1) return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "call_1", type: "function", function: { name: "getPolicy", arguments: "{}" } }] } }] }));
      if (calls === 2) return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: '{"reply":null}' } }] }));
      assert.equal(body.tools, undefined);
      assert.equal(body.response_format.type, "json_schema");
      assert.match(body.messages[1].content, /Cotización pendiente/);
      return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: '{"reply":"La cotización está pendiente."}' } }] }));
    },
  });
  assert.equal(result.value.reply, "La cotización está pendiente.");
  assert.equal(calls, 3);
});

test("la decisión de entrada siempre responde y no puede cerrar una venta perdida", () => {
  const decision = { action: "reply", stage: "discovery", reply: "Te ayudo.", handoff_kind: null, operator_question: null, follow_up_in_minutes: null, memory: { focus: "", preferences: [], pending: [] }, analysis: { summary: "Consulta", intent: "consulta", sentiment: "neutral", next_action: "responder" } };
  assert.equal(decisionSchema.safeParse(decision).success, true);
  assert.equal(decisionSchema.safeParse({ ...decision, action: "close_lost" }).success, false);
  assert.equal(decisionSchema.safeParse({ ...decision, action: "handoff", reply: null }).success, false);
});
