import type { Product } from "@/lib/types";

const headers = ["id", "title", "description", "availability", "condition", "price", "link", "image_link", "brand"];

function csvCell(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function buildMetaCatalogFeed(products: Product[], origin: string) {
  const rows = products.flatMap((product) => {
    const image = product.images[0]?.url;
    if (!image) return [];
    return [[
      product.id,
      product.name,
      product.description || "Accesorio de murano hecho a mano por Liira.",
      product.stock > 0 ? "in stock" : "out of stock",
      "new",
      "",
      `${origin}/producto/${product.slug}`,
      image,
      "Liira",
    ].map(csvCell).join(",")];
  });
  return [headers.join(","), ...rows].join("\n");
}
