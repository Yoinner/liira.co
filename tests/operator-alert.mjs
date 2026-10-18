import assert from "node:assert/strict";
import test from "node:test";
import { canManuallyRequeueOperatorAlert, shouldRetryOperatorAlert } from "../lib/whatsapp/operator-alert.ts";

test("reintenta una alerta antigua aceptada pero no entregada", () => {
  assert.equal(shouldRetryOperatorAlert([{ body: "Amanda necesita tu ayuda · LIR-ABC123", delivery_status: "accepted" }]), true);
});

test("no duplica una alerta entregada ni una plantilla ya intentada", () => {
  assert.equal(shouldRetryOperatorAlert([{ body: "Amanda necesita tu ayuda · LIR-ABC123", delivery_status: "delivered" }]), false);
  assert.equal(shouldRetryOperatorAlert([{ body: "Alerta iniciada con plantilla: LIR-ABC123", delivery_status: "accepted" }]), false);
});

test("la recuperación manual exige resultado incierto y ausencia de entrega", () => {
  assert.equal(canManuallyRequeueOperatorAlert("send_unconfirmed", false), true);
  assert.equal(canManuallyRequeueOperatorAlert("sending", false), true);
  assert.equal(canManuallyRequeueOperatorAlert("send_unconfirmed", true), false);
  assert.equal(canManuallyRequeueOperatorAlert("sent", false), false);
});
