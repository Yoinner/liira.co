import assert from "node:assert/strict";
import test from "node:test";
import { amandaPhoneAllowed } from "../lib/whatsapp/amanda-rollout.ts";

test("el piloto solo atiende números autorizados y falla cerrado sin lista", () => {
  assert.equal(amandaPhoneAllowed("573215056443", "true", "pilot", "3215056443, 3174639218"), true);
  assert.equal(amandaPhoneAllowed("573001112233", "true", "pilot", "3215056443"), false);
  assert.equal(amandaPhoneAllowed("573215056443", "true", undefined, undefined), false);
  assert.equal(amandaPhoneAllowed("573215056443", "false", "all", undefined), false);
  assert.equal(amandaPhoneAllowed("573215056443", "true", "all", undefined), true);
});
