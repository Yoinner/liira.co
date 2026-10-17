import type { AgentBusiness } from "@/lib/agent-core/conversation";

export const liiraAgentBusiness: AgentBusiness = {
  name: "Liira",
  agentName: "Amanda",
  locale: "es-CO",
  website: "https://liira-co.vercel.app/catalogo",
  description: "Accesorios de murano hechos a mano en Bucaramanga; envíos a Colombia.",
  boundaries: "No hay checkout ni tarifa de envío automática. Daniela confirma enlaces de pago, comprobantes, costos y tiempos de envío. No declarar un pago confirmado por una imagen o por palabras del cliente.",
};

export function supportedCatalogReply(reply: string, products: Array<{ price: number; sale_price: number | null }>) {
  const allowedPrices = new Set(products.flatMap((product) => [product.price, product.sale_price].filter((price): price is number => typeof price === "number")));
  for (const match of reply.matchAll(/\$\s*([\d.,]+)/g)) {
    const amount = Number(match[1].replace(/\D/g, ""));
    if (!allowedPrices.has(amount)) return false;
  }
  for (const match of reply.matchAll(/https?:\/\/[^\s)]+/g)) {
    try {
      if (new URL(match[0]).origin !== new URL(liiraAgentBusiness.website).origin) return false;
    } catch { return false; }
  }
  return true;
}
