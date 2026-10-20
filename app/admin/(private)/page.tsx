import Link from "next/link";
import { ArrowRight, CalendarClock, CircleDollarSign, MessageCircleMore, PackageSearch, Percent, ShoppingBag, Sparkles, TrendingDown, TrendingUp, UsersRound } from "lucide-react";
import { dailyRevenue, percentChange, pipelineCounts, resolvePeriod, summarizePeriod } from "@/lib/admin/analytics";
import { formatCop } from "@/lib/config";
import { getAdminData } from "@/lib/data/catalog";
import { getCrmData, getWhatsAppInbox } from "@/lib/data/crm";
import { requireAdmin } from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/supabase/server";

type Search = Promise<{ period?: string; from?: string; to?: string }>;

function Trend({ value, baseline }: { value: number; baseline: number }) {
  if (baseline === 0) return <span className="kpi-trend neutral">Sin base comparable</span>;
  const positive = value >= 0;
  return <span className={`kpi-trend ${positive ? "positive" : "negative"}`}>{positive ? <TrendingUp /> : <TrendingDown />}{Math.abs(value).toFixed(0)}% vs. periodo anterior</span>;
}

function RevenueLine({ points }: { points: ReturnType<typeof dailyRevenue> }) {
  const max = Math.max(...points.map((point) => point.total), 1);
  const width = 720;
  const height = 210;
  const path = points.map((point, index) => `${(index / Math.max(points.length - 1, 1)) * width},${height - (point.total / max) * 175 - 15}`).join(" ");
  return <div className="revenue-line"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Ingresos confirmados por día"><title>Ingresos confirmados por día</title><defs><linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#b43b5b" stopOpacity=".28"/><stop offset="1" stopColor="#b43b5b" stopOpacity="0"/></linearGradient></defs><polygon points={`0,${height} ${path} ${width},${height}`} fill="url(#revenueFill)"/><polyline points={path} fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/></svg><div className="revenue-axis">{points.filter((_, index) => index === 0 || index === points.length - 1 || index === Math.floor(points.length / 2)).map((point) => <span key={point.key}>{point.label}</span>)}</div></div>;
}

export default async function AdminDashboard({ searchParams }: { searchParams: Search }) {
  await requireAdmin("business");
  const params = await searchParams;
  const [{ products, inquiries: fallbackInquiries, available }, crm, inbox, handoffs] = await Promise.all([
    getAdminData(), getCrmData(), getWhatsAppInbox(),
    getSupabaseAdmin()?.from("amanda_handoffs").select("id", { count: "exact", head: true }).eq("status", "pending") ?? Promise.resolve(null),
  ]);
  const inquiries = crm.inquiries.length ? crm.inquiries : fallbackInquiries;
  const period = resolvePeriod(params.period, params.from, params.to);
  const current = summarizePeriod(inquiries, period.start, period.end);
  const previous = summarizePeriod(inquiries, period.previousStart, period.previousEnd);
  const revenue = dailyRevenue(inquiries, period.start, period.end);
  const pipeline = pipelineCounts(inquiries);
  const now = period.now.getTime();
  const due = inquiries.filter((item) => item.status === "contacto" && item.next_follow_up_at && new Date(item.next_follow_up_at).getTime() <= now).sort((a, b) => new Date(a.next_follow_up_at || 0).getTime() - new Date(b.next_follow_up_at || 0).getTime());
  const newLeads = inquiries.filter((item) => (item.pipeline_stage || "nuevo") === "nuevo");
  const lowStock = products.filter((product) => product.stock < 5);
  const needsReply = inbox.conversations.filter((item) => item.status === "requiere_respuesta");
  const sourceCounts = [...new Set(current.created.map((item) => item.source || "whatsapp_web"))].map((source) => ({ source, count: current.created.filter((item) => (item.source || "whatsapp_web") === source).length })).sort((a, b) => b.count - a.count);
  const sourceMax = Math.max(...sourceCounts.map((item) => item.count), 1);

  return <main className="admin-content admin-dashboard">
    <div className="admin-title dashboard-title"><div><p className="admin-kicker">Liira / Centro de operaciones</p><h1>Tu negocio, de un vistazo.</h1><p className="admin-lead">Lo urgente primero. Las cifras, con su contexto. Cada decisión a un clic.</p></div><div className="title-actions"><Link href="/admin/solicitudes" className="admin-secondary">Ver pipeline</Link><Link href="/admin/productos?new=1" className="admin-primary"><Sparkles size={16} /> Nuevo producto</Link></div></div>
    {!available && <div className="admin-unavailable">Supabase no está disponible. El panel conserva su estructura, pero no mostrará datos hasta recuperar la conexión.</div>}
    {available && !crm.schemaReady && <div className="admin-unavailable">La actualización CRM todavía no está aplicada en Supabase. El catálogo sigue activo, pero clientes, seguimientos y trazabilidad necesitan la nueva migración.</div>}

    <form className="period-filter" method="get"><div className="period-presets">{[["today","Hoy"],["yesterday","Ayer"],["7d","7 días"],["month","Este mes"],["90d","90 días"]].map(([value,label]) => <Link key={value} href={`/admin?period=${value}`} className={period.key === value ? "active" : ""}>{label}</Link>)}</div><div className="custom-period"><label>Desde<input type="date" name="from" defaultValue={params.from} /></label><label>Hasta<input type="date" name="to" defaultValue={params.to} /></label><input type="hidden" name="period" value="custom"/><button type="submit">Aplicar rango</button></div></form>

    <section className="admin-kpis strategic-kpis">
      <article><span><CircleDollarSign /></span><div><small>Ventas confirmadas</small><strong>{formatCop(current.revenue)}</strong><Trend value={percentChange(current.revenue, previous.revenue)} baseline={previous.revenue} /></div></article>
      <article><span><ShoppingBag /></span><div><small>Cierres</small><strong>{current.won.length}</strong><Trend value={percentChange(current.won.length, previous.won.length)} baseline={previous.won.length} /></div></article>
      <article><span><Percent /></span><div><small>Tasa de cierre</small><strong>{current.closeRate.toFixed(1)}%</strong><p>Ganadas ÷ solicitudes resueltas</p></div></article>
      <article><span><UsersRound /></span><div><small>Ticket promedio</small><strong>{formatCop(current.averageTicket)}</strong><p>Promedio de ventas confirmadas</p></div></article>
    </section>

    <section className="dashboard-main-grid">
      <article className="admin-panel revenue-panel"><div className="panel-heading"><div><p className="admin-kicker">Ingresos</p><h2>Ritmo del periodo</h2></div><strong>{formatCop(current.revenue)}</strong></div><RevenueLine points={revenue}/></article>
      <article className="admin-panel attention-panel"><div className="panel-heading"><div><p className="admin-kicker">Cola de trabajo</p><h2>Requiere atención</h2></div></div><div className="attention-list"><Link href="/admin/conversaciones"><span className="attention-icon urgent"><MessageCircleMore /></span><div><strong>{inbox.available ? needsReply.length : "—"} chats por responder</strong><small>{inbox.available ? "Conversaciones marcadas para atención" : "Bandeja no disponible"}</small></div><ArrowRight /></Link><Link href="/admin/conversaciones"><span className="attention-icon"><Sparkles /></span><div><strong>{handoffs && !handoffs.error ? handoffs.count : "—"} consultas a Daniela</strong><small>Orientaciones pendientes por caso</small></div><ArrowRight /></Link><Link href="/admin/solicitudes?view=overdue"><span className="attention-icon warning"><CalendarClock /></span><div><strong>{due.length} seguimientos vencidos</strong><small>Solicitudes con fecha de seguimiento pasada</small></div><ArrowRight /></Link><Link href="/admin/solicitudes?stage=nuevo"><span className="attention-icon"><UsersRound /></span><div><strong>{newLeads.length} solicitudes nuevas</strong><small>Aún no marcadas como contactadas</small></div><ArrowRight /></Link><Link href="/admin/productos?stock=low"><span className="attention-icon warning"><PackageSearch /></span><div><strong>{lowStock.length} alertas de inventario</strong><small>Agotados o con menos de cinco unidades</small></div><ArrowRight /></Link></div></article>
    </section>

    <section className="dashboard-bottom-grid">
      <article className="admin-panel pipeline-panel"><div className="panel-heading"><div><p className="admin-kicker">Embudo comercial</p><h2>Solicitudes por etapa</h2></div><Link href="/admin/solicitudes">Gestionar <ArrowRight /></Link></div><div className="pipeline-strip">{pipeline.map((item) => <Link href={`/admin/solicitudes?stage=${item.stage}`} key={item.stage} className={`pipeline-${item.stage}`}><small>{item.label}</small><strong>{item.count}</strong><span style={{ width: `${Math.max((item.count / Math.max(inquiries.length, 1)) * 100, item.count ? 8 : 0)}%` }}/></Link>)}</div><p className="metric-definition">Este embudo empieza cuando una persona envía una solicitud desde la web. No representa todavía visitas, carritos ni pagos.</p></article>
      <article className="admin-panel source-panel"><div className="panel-heading"><div><p className="admin-kicker">Origen</p><h2>Canales registrados</h2></div></div>{sourceCounts.length ? <div className="source-bars">{sourceCounts.map((item) => <div key={item.source}><div><strong>{item.source === "whatsapp_web" ? "Web → WhatsApp" : item.source === "restock_web" ? "Aviso de disponibilidad" : item.source}</strong><span>{item.count}</span></div><i><span style={{ width: `${(item.count / sourceMax) * 100}%` }}/></i></div>)}</div> : <div className="admin-empty compact"><p>Sin solicitudes en el periodo.</p><span>Los canales aparecerán cuando existan contactos registrados.</span></div>}</article>
    </section>
  </main>;
}
