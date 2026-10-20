import assert from "node:assert/strict";
import test from "node:test";
import { classifyVisit } from "../lib/privacy.ts";
import { recoveryCandidate } from "../lib/admin/recovery.ts";

test("only known, anonymous browsing events are classified", () => {
  assert.deepEqual(classifyVisit("/catalogo", "?categoria=denarios"), { eventType: "category_view", reference: "denarios" });
  assert.deepEqual(classifyVisit("/producto/denario-azul", ""), { eventType: "product_view", reference: "denario-azul" });
  assert.deepEqual(classifyVisit("/personaliza", ""), { eventType: "personalization_view", reference: "personaliza" });
  assert.equal(classifyVisit("/catalogo", ""), null);
  assert.equal(classifyVisit("/admin/clientes", ""), null);
  assert.equal(classifyVisit("/catalogo", "?categoria=../../clientes"), null);
});

test("commercial recovery stays read-only and requires explicit evidence", () => {
  const customer = { id: "c1", marketing_consent: true };
  const inquiry = { id: "i1", customer_id: "c1", product_name: "Denario", pipeline_stage: "seguimiento", status: "contacto", created_at: "2026-10-20T01:00:00Z" };
  const granted = { id: "a1", customer_id: "c1", activity_type: "marketing_consent_granted", created_at: "2026-10-20T00:00:00Z" };
  assert.deepEqual(recoveryCandidate(customer, [inquiry], [granted]), { product: "Denario", inquiryId: "i1", createdAt: inquiry.created_at });
  assert.equal(recoveryCandidate(customer, [inquiry], []), null);
  assert.equal(recoveryCandidate(customer, [inquiry], [granted, { ...granted, id: "a2", activity_type: "marketing_consent_revoked", created_at: "2026-10-20T02:00:00Z" }]), null);
  assert.equal(recoveryCandidate(customer, [inquiry, { ...inquiry, id: "i2", status: "vendido", sold_at: "2026-10-20T03:00:00Z" }], [granted]), null);
});
