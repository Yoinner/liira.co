import assert from "node:assert/strict";
import test from "node:test";
import { inquiryPayloadSchema } from "../lib/validation/crm.ts";
import { verifyTurnstile } from "../lib/turnstile.ts";

const base = {
  requestKey: "c9651571-43f9-42f8-bdf9-0b0e9bac5169",
  productId: null,
  productName: "Pieza de prueba",
  customerName: "Persona QA",
  customerPhone: "321 505 6443",
  customization: "Denario azul",
  turnstileToken: "token-ficticio",
};

test("the public form normalizes Colombian numbers and separates permissions", () => {
  const parsed = inquiryPayloadSchema.parse(base);
  assert.equal(parsed.customerPhone, "573215056443");
  assert.equal(parsed.marketingConsent, false);
  assert.equal(parsed.restockConsent, false);
  assert.equal(inquiryPayloadSchema.safeParse({ ...base, website: "bot" }).success, false);
  assert.equal(inquiryPayloadSchema.safeParse({ ...base, customerPhone: "123" }).success, false);
  assert.equal(inquiryPayloadSchema.safeParse({ ...base, requestKey: "reused" }).success, false);
});

test("Turnstile requires successful verification on the same hostname", async () => {
  const oldSecret = process.env.TURNSTILE_SECRET_KEY;
  const oldEnv = process.env.VERCEL_ENV;
  const oldFetch = globalThis.fetch;
  process.env.TURNSTILE_SECRET_KEY = "qa-secret";
  process.env.VERCEL_ENV = "preview";
  const request = new Request("https://qa.liira.test/api/inquiries");
  try {
    globalThis.fetch = async (_url, options) => {
      assert.equal(options.method, "POST");
      assert.equal(new URLSearchParams(options.body).get("secret"), "qa-secret");
      return Response.json({ success: true, hostname: "qa.liira.test" });
    };
    assert.equal(await verifyTurnstile("qa-token", request), true);
    globalThis.fetch = async () => Response.json({ success: true, hostname: "other.test" });
    assert.equal(await verifyTurnstile("qa-token", request), false);
    globalThis.fetch = async () => Response.json({ success: false, hostname: "qa.liira.test" });
    assert.equal(await verifyTurnstile("qa-token", request), false);
    process.env.TURNSTILE_SECRET_KEY = "1x0000000000000000000000000000000AA";
    globalThis.fetch = async () => Response.json({ success: true, hostname: "localhost" });
    assert.equal(await verifyTurnstile("qa-token", request), true);
    process.env.VERCEL_ENV = "production";
    assert.equal(await verifyTurnstile("qa-token", request), false);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldSecret === undefined) delete process.env.TURNSTILE_SECRET_KEY;
    else process.env.TURNSTILE_SECRET_KEY = oldSecret;
    if (oldEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = oldEnv;
  }
});
