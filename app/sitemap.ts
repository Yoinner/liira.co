import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/config";
import { getCatalog } from "@/lib/data/catalog";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { products } = await getCatalog();
  const routes = ["", "/catalogo", "/personaliza", "/nosotros", "/politicas/envios-y-cambios", "/politicas/privacidad", "/politicas/terminos"];
  return [...routes.map((route) => ({ url: `${siteConfig.url}${route}`, lastModified: new Date(), changeFrequency: route === "/catalogo" ? "weekly" as const : "monthly" as const, priority: route === "" ? 1 : 0.7 })), ...products.map((product) => ({ url: `${siteConfig.url}/producto/${product.slug}`, lastModified: new Date(product.updated_at), changeFrequency: "weekly" as const, priority: 0.8 }))];
}
