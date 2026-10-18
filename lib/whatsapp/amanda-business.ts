import type { AgentBusiness } from "@/lib/agent-core/conversation";

export const liiraAgentBusiness: AgentBusiness = {
  name: "Liira",
  agentName: "Amanda",
  locale: "es-CO",
  website: "https://liira-co.vercel.app/catalogo",
  description: "Accesorios de murano hechos a mano en Bucaramanga; envíos a Colombia.",
  boundaries: "No hay checkout, reservas de inventario ni tarifa de envío automática. No prometas apartar una pieza. El equipo aprueba cada pedido y medio de pago, verifica fondos reales y cotiza costo y tiempo de envío. No declares un pago confirmado por una imagen o por palabras del cliente.",
};

export function supportedCatalogReply(reply: string, products: Array<{ slug: string; price: number; sale_price: number | null }>) {
  if (/\b(pago|transferencia)\s+(ya\s+)?(confirmado|aprobado|recibido)\b/iu.test(reply)) return false;
  const allowedPrices = new Set(products.flatMap((product) => [product.price, product.sale_price].filter((price): price is number => typeof price === "number")));
  for (const match of reply.matchAll(/\$\s*([\d.,]+)/g)) {
    const amount = Number(match[1].replace(/\D/g, ""));
    if (!allowedPrices.has(amount)) return false;
  }
  const base = liiraAgentBusiness.website.replace(/\/catalogo$/, "");
  const allowedUrls = new Set([liiraAgentBusiness.website, `${base}/politicas/envios-y-cambios`, ...products.map((product) => `${base}/producto/${product.slug}`)]);
  for (const match of reply.matchAll(/https?:\/\/[^\s)]+/g)) {
    try {
      if (!allowedUrls.has(new URL(match[0].replace(/[.,;!?]+$/, "")).href)) return false;
    } catch { return false; }
  }
  return true;
}

export function supportedOperatorReply(reply: string, guidance: string, paymentConfirmed: boolean, approvedUrls: string[] = []) {
  for (const match of reply.matchAll(/https?:\/\/[^\s)]+/g)) {
    const url = match[0].replace(/[.,;!?]+$/, "");
    if (!guidance.includes(url) || !approvedUrls.includes(url)) return false;
  }
  const approvedAmounts = new Set([...guidance.matchAll(/\$\s*([\d.,]+)/g)].map((match) => match[1].replace(/\D/g, "")));
  for (const match of reply.matchAll(/\$\s*([\d.,]+)/g)) if (!approvedAmounts.has(match[1].replace(/\D/g, ""))) return false;
  const approvedNumbers = new Set([...guidance.matchAll(/\b\d[\d.,]*\b/g)].map((match) => match[0].replace(/\D/g, "")));
  for (const match of reply.matchAll(/\b\d[\d.,]*\b/g)) if (!approvedNumbers.has(match[0].replace(/\D/g, ""))) return false;
  if (!paymentConfirmed && /\b(pago|transferencia)\s+(ya\s+)?(confirmado|aprobado|recibido)\b/iu.test(reply)) return false;
  return true;
}
