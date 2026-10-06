import Link from "next/link";
import { ArrowRight, Search, ShieldCheck, Sparkles, UserRound, UsersRound } from "lucide-react";
import { customerMetrics } from "@/lib/admin/analytics";
import { formatCop } from "@/lib/config";
import { getCrmData } from "@/lib/data/crm";
import { requireAdmin } from "@/lib/auth/session";

type Search = Promise<{ q?: string; segment?: string }>;

export default async function CustomersPage({ searchParams }: { searchParams: Search }) {
  await requireAdmin("business");
  const params = await searchParams;
  const { customers, inquiries, schemaReady } = await getCrmData();
  const metrics = customerMetrics(customers, inquiries);
  const query = (params.q || "").trim().toLowerCase();
  const filtered = metrics.filter((item) => {
    if (params.segment && item.automaticSegment.toLowerCase().replace(" ", "-") !== params.segment) return false;
    if (query && ![item.customer.name, item.customer.phone, item.customer.email, item.customer.instagram_handle].some((value) => value?.toLowerCase().includes(query))) return false;
    return true;
  });
  const vip = metrics.filter((item) => item.automaticSegment === "VIP").length;
  const recurrent = metrics.filter((item) => item.purchases > 1).length;
  const atRisk = metrics.filter((item) => item.automaticSegment === "En riesgo").length;

  return <main className="admin-content">
    <div className="admin-title"><div><p className="admin-kicker">CRM Liira</p><h1>Personas, no filas.</h1><p className="admin-lead">Historia, valor, preferencias y próxima conversación de cada cliente.</p></div></div>
    {!schemaReady && <div className="admin-unavailable">El CRM necesita la migración de base de datos antes de crear las fichas 360°.</div>}
    <section className="crm-overview"><article><span><UsersRound/></span><div><small>Clientes identificados</small><strong>{customers.length}</strong></div></article><article><span><Sparkles/></span><div><small>Segmento VIP</small><strong>{vip}</strong></div></article><article><span><UserRound/></span><div><small>Clientes recurrentes</small><strong>{recurrent}</strong></div></article><article><span><ShieldCheck/></span><div><small>En riesgo</small><strong>{atRisk}</strong></div></article></section>
    <div className="customer-toolbar"><form className="admin-filterbar" method="get"><label><Search/><input name="q" defaultValue={params.q} placeholder="Nombre, teléfono, correo o Instagram" maxLength={80}/></label>{params.segment && <input type="hidden" name="segment" value={params.segment}/>}<button type="submit">Buscar</button>{(params.q || params.segment) && <Link href="/admin/clientes">Limpiar</Link>}</form><div className="segment-links"><Link href="/admin/clientes" className={!params.segment ? "active" : ""}>Todos</Link><Link href="/admin/clientes?segment=vip" className={params.segment === "vip" ? "active" : ""}>VIP</Link><Link href="/admin/clientes?segment=recurrente" className={params.segment === "recurrente" ? "active" : ""}>Recurrentes</Link><Link href="/admin/clientes?segment=en-riesgo" className={params.segment === "en-riesgo" ? "active" : ""}>En riesgo</Link></div></div>
    <section className="admin-panel customer-table-panel">{filtered.length ? <div className="admin-table-wrap"><table className="admin-table customer-table"><thead><tr><th>Cliente</th><th>Segmento</th><th>Solicitudes</th><th>Compras</th><th>LTV registrado</th><th>Última actividad</th><th/></tr></thead><tbody>{filtered.map((item) => <tr key={item.customer.id}><td><div className="customer-cell"><span>{item.customer.name.slice(0,1).toUpperCase()}</span><div><strong>{item.customer.name}</strong><small>{item.customer.phone || item.customer.email || "Sin canal guardado"}</small></div></div></td><td><span className={`segment-badge segment-${item.automaticSegment.toLowerCase().replace(" ", "-")}`}>{item.automaticSegment}</span></td><td>{item.inquiries}</td><td>{item.purchases}</td><td><strong>{formatCop(item.ltv)}</strong></td><td>{new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeZone: "America/Bogota" }).format(new Date(item.last))}</td><td><Link href={`/admin/clientes/${item.customer.id}`} aria-label={`Abrir ficha de ${item.customer.name}`}><ArrowRight/></Link></td></tr>)}</tbody></table></div> : <div className="admin-empty tall"><UsersRound/><p>No hay clientes en esta vista.</p><span>Las personas se crean al enviar una solicitud con un WhatsApp válido.</span></div>}</section>
  </main>;
}
