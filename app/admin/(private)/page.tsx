import Link from "next/link";
import { ArrowRight, CircleDollarSign, PackageSearch, ShoppingBag, Sparkles } from "lucide-react";
import { formatCop } from "@/lib/config";
import { getAdminData } from "@/lib/data/catalog";
import { requireAdmin } from "@/lib/auth/session";

function monthKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`; }
function monthLabel(date: Date) { return new Intl.DateTimeFormat("es-CO", { month: "short" }).format(date).replace(".", ""); }

export default async function AdminDashboard() {
  await requireAdmin("business");
  const { products, inquiries, available } = await getAdminData();
  const now = new Date();
  const months = [2, 1, 0].map((offset) => new Date(now.getFullYear(), now.getMonth() - offset, 1));
  const sales = months.map((month) => {
    const rows = inquiries.filter((item) => item.status === "vendido" && item.sold_at && monthKey(new Date(item.sold_at)) === monthKey(month));
    return { label: monthLabel(month), total: rows.reduce((sum, item) => sum + (item.sale_amount || 0), 0), count: rows.length };
  });
  const maxSale = Math.max(...sales.map((sale) => sale.total), 1);
  const current = sales[2];
  const pending = inquiries.filter((item) => item.status === "contacto");
  const lowStock = products.filter((product) => product.stock > 0 && product.stock < 5);

  return <main className="admin-content"><div className="admin-title"><div><p className="admin-kicker">Hoy en Liira</p><h1>Resumen del negocio</h1></div><Link href="/admin/productos?new=1" className="admin-primary"><Sparkles size={16} /> Nuevo producto</Link></div>{!available && <div className="admin-unavailable">El panel está listo, pero Supabase no está conectado. Los datos aparecerán cuando se configuren las variables.</div>}<section className="admin-kpis"><article><span><MessageSquareIcon /></span><div><small>Por contactar</small><strong>{pending.length}</strong><p>Solicitudes activas</p></div></article><article><span><ShoppingBag /></span><div><small>Ventas este mes</small><strong>{current.count}</strong><p>{formatCop(current.total)}</p></div></article><article><span><PackageSearch /></span><div><small>Stock bajo</small><strong>{lowStock.length}</strong><p>Piezas con menos de 5</p></div></article><article><span><CircleDollarSign /></span><div><small>Ingresos · 3 meses</small><strong>{formatCop(sales.reduce((sum, sale) => sum + sale.total, 0))}</strong><p>Solo ventas confirmadas</p></div></article></section><section className="admin-grid"><article className="admin-panel sales-panel"><div className="panel-heading"><div><p className="admin-kicker">Últimos 3 meses</p><h2>Ventas confirmadas</h2></div></div><div className="sales-chart">{sales.map((sale) => <div className="bar-column" key={sale.label}><div className="bar-value">{sale.total ? formatCop(sale.total) : "$0"}</div><div className="bar-track"><span style={{ height: `${Math.max((sale.total / maxSale) * 100, 3)}%` }} /></div><strong>{sale.label}</strong><small>{sale.count} {sale.count === 1 ? "venta" : "ventas"}</small></div>)}</div></article><article className="admin-panel queue-panel"><div className="panel-heading"><div><p className="admin-kicker">Siguiente acción</p><h2>Solicitudes recientes</h2></div><Link href="/admin/solicitudes">Ver todas <ArrowRight size={15} /></Link></div>{pending.length ? <div className="mini-queue">{pending.slice(0, 5).map((item) => <div key={item.id}><span>{item.customer_name?.slice(0, 1).toUpperCase() || "L"}</span><div><strong>{item.customer_name || "Contacto de WhatsApp"}</strong><small>{item.product_name}</small></div><time>{new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short" }).format(new Date(item.created_at))}</time></div>)}</div> : <div className="admin-empty"><MessageSquareIcon /><p>No hay solicitudes pendientes.</p><span>Las consultas enviadas desde la web aparecerán aquí.</span></div>}</article></section></main>;
}

function MessageSquareIcon() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" /></svg>; }
