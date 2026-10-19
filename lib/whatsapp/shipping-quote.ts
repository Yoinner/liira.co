export type ShippingQuote = {
  destination: string;
  item_summary: string;
  amount_cop: number;
  delivery_estimate: string;
  conditions: string;
  source_last_inbound_at: string;
  expires_at: string;
  order_id: string | null;
};

export function shippingQuoteIsCurrent(quote: ShippingQuote, lastInboundAt: string | null, now = Date.now()) {
  return Boolean(lastInboundAt && Date.parse(quote.source_last_inbound_at) <= Date.parse(lastInboundAt) && Date.parse(quote.expires_at) > now);
}

export function provisionalShippingReplyIsSafe(reply: string) {
  const mentionsValue = /\$\s*[\d.,]+|\b\d+\s*(?:d[ií]as?|horas?)\b/iu.test(reply);
  return !/\b(?:definitiv[oa]|confirmad[oa]|garantizad[oa])\b/iu.test(reply)
    && (!mentionsValue || /\b(?:aproximad[oa]s?|estimad[oa]s?|referencial|sujeto a confirmaci[oó]n)\b/iu.test(reply));
}

export function hasAmbiguousShippingAmount(guidance: string) {
  return /\b\d+[.,]\d{4,}\b/u.test(guidance);
}

export function shippingQuoteGuidance(quote: ShippingQuote) {
  return `Cotización aprobada para ${quote.item_summary}, destino ${quote.destination}: envío $${quote.amount_cop.toLocaleString("es-CO")} COP; tiempo estimado ${quote.delivery_estimate}; condiciones ${quote.conditions}. Vigente hasta ${quote.expires_at}. No prometas una fecha de llegada exacta.`;
}
