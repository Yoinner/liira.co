import assert from "node:assert/strict";
import test from "node:test";
import { buildMetaCatalogFeed } from "../lib/catalog/meta-feed.ts";

test("exports active catalog data without prices and skips products without images", () => {
  const products = [
    { id: "one", name: 'Denario "Luz"', slug: "denario-luz", description: "Murano, dorado", stock: 2, images: [{ url: "https://example.com/one.jpg" }] },
    { id: "two", name: "Sin foto", slug: "sin-foto", description: null, stock: 0, images: [] },
  ];
  const csv = buildMetaCatalogFeed(products, "https://liira.co");
  assert.match(csv, /one,"Denario ""Luz""","Murano, dorado",in stock,new,,https:\/\/liira\.co\/producto\/denario-luz/);
  assert.doesNotMatch(csv, /Sin foto/);
});
