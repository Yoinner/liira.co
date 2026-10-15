import assert from "node:assert/strict";
import test from "node:test";
import { normalizePhone } from "../lib/validation/crm.ts";

test("adds Colombia's prefix to a local mobile number", () => {
  assert.equal(normalizePhone("3215056443"), "573215056443");
  assert.equal(normalizePhone("321 505 6443"), "573215056443");
});

test("keeps an already normalized Colombian mobile number", () => {
  assert.equal(normalizePhone("+57 321 505 6443"), "573215056443");
});
