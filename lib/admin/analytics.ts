import type { Customer, Inquiry, PipelineStage, Product } from "@/lib/types";

export type PeriodKey = "today" | "yesterday" | "7d" | "month" | "90d" | "custom";

export function getServerNow() { return Date.now(); }

export function resolvePeriod(period: string | undefined, from?: string, to?: string) {
  const now = new Date();
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  let start = new Date(now);
  let end = endOfToday;
  let key: PeriodKey = ["today", "yesterday", "7d", "month", "90d", "custom"].includes(period || "") ? period as PeriodKey : "month";

  if (key === "today") start.setHours(0, 0, 0, 0);
  if (key === "yesterday") {
    start.setDate(start.getDate() - 1); start.setHours(0, 0, 0, 0);
    end = new Date(start); end.setHours(23, 59, 59, 999);
  }
  if (key === "7d") { start.setDate(start.getDate() - 6); start.setHours(0, 0, 0, 0); }
  if (key === "month") start = new Date(now.getFullYear(), now.getMonth(), 1);
  if (key === "90d") { start.setDate(start.getDate() - 89); start.setHours(0, 0, 0, 0); }
  if (key === "custom") {
    const parsedStart = from ? new Date(`${from}T00:00:00-05:00`) : null;
    const parsedEnd = to ? new Date(`${to}T23:59:59-05:00`) : null;
    if (!parsedStart || !parsedEnd || Number.isNaN(parsedStart.valueOf()) || Number.isNaN(parsedEnd.valueOf()) || parsedStart > parsedEnd) {
      key = "month"; start = new Date(now.getFullYear(), now.getMonth(), 1); end = endOfToday;
    } else { start = parsedStart; end = parsedEnd; }
  }
  const duration = Math.max(end.getTime() - start.getTime(), 86_400_000);
  return { key, start, end, now, previousStart: new Date(start.getTime() - duration - 1), previousEnd: new Date(start.getTime() - 1) };
}

function inRange(date: string | null | undefined, start: Date, end: Date) {
  if (!date) return false;
  const value = new Date(date).getTime();
  return value >= start.getTime() && value <= end.getTime();
}

export function summarizePeriod(inquiries: Inquiry[], start: Date, end: Date) {
  const created = inquiries.filter((item) => inRange(item.created_at, start, end));
  const won = inquiries.filter((item) => item.status === "vendido" && inRange(item.sold_at, start, end));
  const resolved = inquiries.filter((item) => {
    if (item.status === "vendido") return inRange(item.sold_at, start, end);
    if (item.status === "no_vendido") return inRange(item.updated_at, start, end);
    return false;
  });
  const revenue = won.reduce((sum, item) => sum + (item.sale_amount || 0), 0);
  return { created, won, revenue, averageTicket: won.length ? revenue / won.length : 0, closeRate: resolved.length ? (won.length / resolved.length) * 100 : 0 };
}

export function percentChange(current: number, previous: number) {
  if (!previous) return current ? 100 : 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function dailyRevenue(inquiries: Inquiry[], start: Date, end: Date) {
  const day = 86_400_000;
  const count = Math.min(Math.ceil((end.getTime() - start.getTime()) / day) + 1, 31);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(start.getTime() + index * day);
    const localKey = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(date);
    const rows = inquiries.filter((item) => item.status === "vendido" && item.sold_at && new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date(item.sold_at)) === localKey);
    return { key: localKey, label: new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", timeZone: "America/Bogota" }).format(date), total: rows.reduce((sum, item) => sum + (item.sale_amount || 0), 0), count: rows.length };
  });
}

export const stageLabels: Record<PipelineStage, string> = {
  nuevo: "Nuevas", contactado: "Contactadas", cotizado: "Cotizadas", seguimiento: "Seguimiento", ganado: "Ganadas", perdido: "Perdidas",
};

export function pipelineCounts(inquiries: Inquiry[]) {
  return (Object.keys(stageLabels) as PipelineStage[]).map((stage) => ({
    stage, label: stageLabels[stage], count: inquiries.filter((item) => (item.pipeline_stage || (item.status === "vendido" ? "ganado" : item.status === "no_vendido" ? "perdido" : "nuevo")) === stage).length,
  }));
}

export function productPerformance(products: Product[], inquiries: Inquiry[]) {
  return products.map((product) => {
    const leads = inquiries.filter((item) => item.product_id === product.id);
    const sales = leads.filter((item) => item.status === "vendido");
    return { product, leads: leads.length, sales: sales.length, revenue: sales.reduce((sum, item) => sum + (item.sale_amount || 0), 0) };
  }).sort((a, b) => b.revenue - a.revenue || b.leads - a.leads);
}

export function customerMetrics(customers: Customer[], inquiries: Inquiry[]) {
  return customers.map((customer) => {
    const rows = inquiries.filter((item) => item.customer_id === customer.id);
    const sales = rows.filter((item) => item.status === "vendido");
    const ltv = sales.reduce((sum, item) => sum + (item.sale_amount || 0), 0);
    const last = rows[0]?.created_at || customer.last_contact_at || customer.created_at;
    const daysSince = Math.floor((Date.now() - new Date(last).getTime()) / 86_400_000);
    const automaticSegment = ltv >= 300_000 || sales.length >= 3 ? "VIP" : daysSince >= 180 && sales.length ? "En riesgo" : sales.length > 1 ? "Recurrente" : rows.length > 1 && !sales.length ? "Por convertir" : "Nuevo";
    return { customer, inquiries: rows.length, purchases: sales.length, ltv, last, automaticSegment };
  }).sort((a, b) => b.ltv - a.ltv || new Date(b.last).getTime() - new Date(a.last).getTime());
}
