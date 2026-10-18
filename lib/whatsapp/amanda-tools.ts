import { z } from "zod";
import type { AgentTool } from "@/lib/agent-core/gateway";
import { shippingPolicy } from "@/lib/config";
import { liiraAgentBusiness } from "@/lib/whatsapp/amanda-business";

type CatalogProduct = { name: string; slug: string; description: string | null; price: number; sale_price: number | null; stock: number; category?: { name: string } | null };
type CatalogSnapshot = { products: CatalogProduct[]; available: boolean };
type PendingRequest = { kind: string; status: string; question: string };

function productView(product: CatalogProduct) {
  return {
    name: product.name,
    slug: product.slug,
    category: product.category?.name || null,
    description: product.description,
    price_cop: product.price,
    sale_price_cop: product.sale_price,
    available: product.stock > 0,
    low_stock: product.stock > 0 && product.stock < 5,
    url: `${liiraAgentBusiness.website.replace(/\/catalogo$/, "")}/producto/${product.slug}`,
  };
}

export function amandaTools(catalog: CatalogSnapshot, requests: PendingRequest[]): Record<string, AgentTool> {
  const find = (slug: string) => catalog.products.find((product) => product.slug === slug);
  return {
    searchProducts: {
      description: "Busca accesorios activos del catálogo público. Úsala antes de afirmar disponibilidad, precio u opciones concretas.",
      parameters: z.object({ query: z.string().trim().max(80).default("") }),
      execute: async (input) => {
        if (!catalog.available) return { error: "catalog_unavailable" };
        const query = (input as { query: string }).query.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        const terms = query.match(/[a-z0-9]+/g) || [];
        const matches = catalog.products.filter((product) => {
          const text = `${product.name} ${product.description || ""} ${product.category?.name || ""}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
          return terms.every((term) => text.includes(term));
        });
        return { total: matches.length, products: matches.slice(0, 8).map(productView) };
      },
    },
    getProductDetails: {
      description: "Consulta los datos públicos vigentes de un producto por slug.",
      parameters: z.object({ slug: z.string().trim().min(1).max(120) }),
      execute: async (input) => {
        if (!catalog.available) return { error: "catalog_unavailable" };
        const product = find((input as { slug: string }).slug);
        return product ? productView(product) : { found: false };
      },
    },
    getProductAvailability: {
      description: "Verifica si queda inventario; no revela existencias exactas salvo stock bajo.",
      parameters: z.object({ slug: z.string().trim().min(1).max(120) }),
      execute: async (input) => {
        if (!catalog.available) return { error: "catalog_unavailable" };
        const product = find((input as { slug: string }).slug);
        return product ? { found: true, available: product.stock > 0, low_stock: product.stock > 0 && product.stock < 5 } : { found: false };
      },
    },
    getCatalogLink: {
      description: "Obtiene el enlace oficial del catálogo público.",
      parameters: z.object({}),
      execute: async () => ({ url: liiraAgentBusiness.website }),
    },
    getBusinessPolicies: {
      description: "Consulta hechos publicados sobre envíos, personalización, pagos y cambios. No infiere tarifas ni tiempos.",
      parameters: z.object({}),
      execute: async () => ({
        shipping: shippingPolicy.coverage,
        custom: shippingPolicy.custom,
        changes: shippingPolicy.changes,
        pending: shippingPolicy.pending,
        payment: "No hay checkout automático; el enlace de pago y su comprobación requieren confirmación humana.",
        policy_url: `${liiraAgentBusiness.website.replace(/\/catalogo$/, "")}/politicas/envios-y-cambios`,
      }),
    },
    getPendingCustomerRequests: {
      description: "Consulta las gestiones humanas todavía abiertas para esta conversación, sin crear nuevas alertas.",
      parameters: z.object({}),
      execute: async () => ({ requests: requests.filter((request) => request.status === "pending").map((request) => ({ kind: request.kind, question: request.question.slice(0, 300) })) }),
    },
  };
}
