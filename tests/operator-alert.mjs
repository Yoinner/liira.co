import assert from "node:assert/strict";
import test from "node:test";
import { shouldRetryOperatorAlert } from "../lib/whatsapp/operator-alert.ts";

test("reintenta una alerta antigua aceptada pero no entregada", () => {
  assert.equal(shouldRetryOperatorAlert([{ body: "Amanda necesita tu ayuda · LIR-ABC123", delivery_status: "accepted" }]), true);
});

test("no duplica una alerta entregada ni una plantilla ya intentada", () => {
  assert.equal(shouldRetryOperatorAlert([{ body: "Amanda necesita tu ayuda · LIR-ABC123", delivery_status: "delivered" }]), false);
  assert.equal(shouldRetryOperatorAlert([{ body: "Alerta iniciada con plantilla: LIR-ABC123", delivery_status: "accepted" }]), false);
});
