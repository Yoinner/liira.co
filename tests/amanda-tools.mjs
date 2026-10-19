import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

registerHooks({ resolve(id, context, next) {
  return next(id.startsWith("@/") ? pathToFileURL(resolve(id.slice(2) + ".ts")).href : id, context);
} });
const { amandaTools } = await import("../lib/whatsapp/amanda-tools.ts");

test("busca atributos del mismo producto aunque no sean una frase contigua", async () => {
  const products = [
    { name: "Collar Nube QA", slug: "collar", description: "Murano blanco", price: 42000, sale_price: null, stock: 0, category: { name: "Collares" } },
    { name: "Rosario Alba QA", slug: "rosario", description: "Murano rosado", price: 35000, sale_price: null, stock: 2, category: { name: "Rosarios" } },
  ];
  const search = amandaTools({ products, available: true }, []).searchProducts.execute;
  const collar = await search({ query: "collar blanco" });
  const rosario = await search({ query: "rosario rosado" });
  assert.equal(collar.total, 0);
  assert.equal(rosario.total, 1);
  assert.equal(rosario.products[0].available, true);
  const details = await amandaTools({ products, available: true }, []).getProductDetails.execute({ slug: "collar" });
  assert.equal(details.available, false);
});
