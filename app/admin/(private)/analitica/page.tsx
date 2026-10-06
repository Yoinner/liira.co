import Link from "next/link";
import { ArrowRight, BarChart3, Info, Repeat2, Target, Trophy } from "lucide-react";
import { customerMetrics, productPerformance, resolvePeriod, summarizePeriod } from "@/lib/admin/analytics";
import { formatCop } from "@/lib/config";
import { getAdminData } from "@/lib/data/catalog";
import { getCrmData } from "@/lib/data/crm";
import { requireAdmin } from "@/lib/auth/session";

type Search = Promise<{ period?: string }>;

export default async function AnalyticsPage({ searchParams }: { searchParams: Search }) {
  await requireAdmin("business");
  const params = await searchParams;
  const [{ products }, crm] = await Promise.all([getAdminData(), getCrmData()]);
  const period = resolvePeriod(params.period);
  const summary = summarizePeriod(crm.inquiries, period.start, period.end);
  const performance = productPerformance(products, summary.created);
  const customers = customerMetrics(crm.customers, crm.inquiries);
  const stageValues = [
    { label: "Solicitudes", value: summary.created.length },
    { label: "Contactadas", value: summary.created.filter((item) => ["contactado","cotizado","seguimiento","ganado","perdido"].includes(item.pipeline_stage)).length },
    { label: "Cotizadas", value: summary.created.filter((item) => ["cotizado","seguimiento","ganado"].includes(item.pipeline_stage)).length },
    { label: "Ganadas", value: summary.created.filter((item) => item.status === "vendido").length },
  ];
  const maxStage = Math.max(stageValues[0].value, 1);
  const repeatCustomers = customers.filter((item) => item.purchases > 1).length;
  const buyingCustomers = customers.filter((item) => item.purchases > 0).length;
  const repeatRate = buyingCustomers ? (repeatCustomers / buyingCustomers) * 100 : 0;

  return <main className="admin-content analytics-page">
    <div className="admin-title"><div><p className="admin-kicker">Inteligencia de negocio</p><h1>Decidir con evidencia.</h1><p className="admin-lead">Métricas construidas solo con solicitudes y ventas que Liira ha registrado.</p></div><div className="period-presets compact">{[["7d","7 días"],["month","Mes"],["90d","90 días"]].map(([value,label]) => <Link key={value} href={`/admin/analitica?period=${value}`} className={period.key === value ? "active" : ""}>{label}</Link>)}</div></div>
    <div className="data-boundary"><Info/><p><strong>Alcance actual:</strong> el análisis empieza en la solicitud enviada desde la web. Visitas, añadir al carrito, checkout, campañas pagas y abandono estarán disponibles cuando se conecten analítica y pagos.</p></div>
    <section className="analytics-grid">
      <article className="admin-panel funnel-card"><div className="panel-heading"><div><p className="admin-kicker">Embudo comercial</p><h2>Del interés al cierre</h2></div><Target/></div><div className="funnel-chart">{stageValues.map((item, index) => <div key={item.label} style={{ width: `${Math.max((item.value / maxStage) * 100, 34)}%` }}><span>{item.label}</span><strong>{item.value}</strong><small>{index ? `${stageValues[index - 1].value ? ((item.value / stageValues[index - 1].value) * 100).toFixed(0) : 0}% avanza` : "Entrada CRM"}</small></div>)}</div></article>
      <article className="admin-panel retention-card"><div className="panel-heading"><div><p className="admin-kicker">Relación</p><h2>Nuevos vs. recurrentes</h2></div><Repeat2/></div><div className="retention-ring" style={{ "--repeat": `${repeatRate * 3.6}deg` } as React.CSSProperties}><div><strong>{repeatRate.toFixed(0)}%</strong><span>recurrentes</span></div></div><div className="retention-legend"><span><i className="repeat"/> {repeatCustomers} recurrentes</span><span><i/> {Math.max(buyingCustomers - repeatCustomers, 0)} de una compra</span></div><p className="metric-definition">Recurrente significa más de una venta confirmada en el historial.</p></article>
    </section>
    <section className="admin-panel product-performance"><div className="panel-heading"><div><p className="admin-kicker">Merchandising</p><h2>Interés y ventas por producto</h2></div><Trophy/></div>{performance.length ? <div className="performance-list">{performance.slice(0, 10).map((item, index) => { const close = item.leads ? (item.sales / item.leads) * 100 : 0; return <div key={item.product.id}><span className="rank">{String(index + 1).padStart(2,"0")}</span><div><strong>{item.product.name}</strong><small>{item.leads} solicitudes · {item.sales} ventas</small></div><div className="performance-track"><i style={{ width: `${close}%` }}/></div><strong>{close.toFixed(0)}%</strong><span>{formatCop(item.revenue)}</span><Link href={`/admin/productos?edit=${item.product.id}`} aria-label={`Editar ${item.product.name}`}><ArrowRight/></Link></div>;})}</div> : <div className="admin-empty"><BarChart3/><p>Aún no hay productos para analizar.</p></div>}</section>
  </main>;
}
