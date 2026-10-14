import assert from "node:assert/strict";
import test from "node:test";
import { hasDependents, matchesDeletionConfirmation } from "../lib/validation/deletion.ts";

test("la eliminación exige coincidencia exacta y cero dependencias", () => {
  assert.equal(matchesDeletionConfirmation("Denarios", "Denarios"), true);
  assert.equal(matchesDeletionConfirmation("denarios", "Denarios"), false);
  assert.equal(hasDependents(null), false);
  assert.equal(hasDependents(1), true);
});
