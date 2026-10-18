import assert from "node:assert/strict";
import test from "node:test";
import { approvedPaymentUrl, paymentHandoffApproved } from "../lib/whatsapp/payment-safety.ts";

test("solo se autoriza un enlace HTTPS exacto de un proveedor aprobado", () => {
  const hosts = ["checkout.example.com"];
  assert.equal(approvedPaymentUrl("https://checkout.example.com/order/123", hosts), "https://checkout.example.com/order/123");
  for (const url of ["http://checkout.example.com/order/123", "https://checkout.example.com.evil.test/order/123", "https://user@checkout.example.com/order/123", "https://checkout.example.com:444/order/123", "https://checkout.example.com/order/123#fake"]) {
    assert.equal(approvedPaymentUrl(url, hosts), null);
  }
  assert.equal(approvedPaymentUrl("https://checkout.example.com/order/123", []), null);
});

test("ni un comprobante ni un texto de Daniela aprueban un pago sin registro verificado del mismo caso", () => {
  assert.equal(paymentHandoffApproved("payment_link", null, "msg-1"), false);
  assert.equal(paymentHandoffApproved("payment_link", { status: "awaiting_payment" }, "msg-1"), true);
  assert.equal(paymentHandoffApproved("payment_verification", { status: "paid", verified_at: "2026-10-18T00:00:00Z", proof_message_id: "otro" }, "msg-1"), false);
  assert.equal(paymentHandoffApproved("payment_verification", { status: "paid", verified_at: "2026-10-18T00:00:00Z", proof_message_id: "msg-1" }, "msg-1"), true);
  assert.equal(paymentHandoffApproved("shipping_quote", null, null), true);
});
