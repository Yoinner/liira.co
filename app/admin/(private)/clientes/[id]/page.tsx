import Link from "next/link";
import { ArrowLeft, CalendarClock, CircleDollarSign, Clock3, MessageCircle, NotebookPen, ShoppingBag, UserRound } from "lucide-react";
import { notFound } from "next/navigation";
import { addCustomerNote, updateCustomer } from "@/app/admin/actions";
import { formatCop } from "@/lib/config";
import { getCustomerDetail } from "@/lib/data/crm";
import { requireAdmin } from "@/lib/auth/session";
import { normalizePhone } from "@/lib/validation/crm";

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin("business");
  const { id } = await params;
  const detail = await getCustomerDetail(id);
  if (!detail) notFound();
  const { customer, inquiries, notes, activities } = detail;
  const sales = inquiries.filter((item) => item.status === "vendido");
  const ltv = sales.reduce((sum, item) => sum + (item.sale_amount || 0), 0);
  const whatsappPhone = normalizePhone(customer.normalized_phone || customer.phone || "");
  const timeline = [
    ...activities.map((item) => ({ id: `a-${item.id}`, date: item.created_at, title: item.summary, kind: "activity" })),
    ...notes.map((item) => ({ id: `n-${item.id}`, date: item.created_at, title: item.note, kind: "note" })),
    ...inquiries.map((item) => ({ id: `i-${item.id}`, date: item.created_at, title: `Solicitó ${item.product_name}`, kind: "inquiry" })),
  ].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return <main className="admin-content customer-detail-page">
    <Link href="/admin/clientes" className="admin-back"><ArrowLeft/> Volver a clientes</Link>
    <div className="customer-hero"><div className="customer-monogram">{customer.name.slice(0,1).toUpperCase()}</div><div><p className="admin-kicker">Cliente 360°</p><h1>{customer.name}</h1><div className="customer-contact-line">{customer.phone && <span>{customer.phone}</span>}{customer.email && <span>{customer.email}</span>}{customer.instagram_handle && <span>@{customer.instagram_handle.replace(/^@/, "")}</span>}</div></div>{/^57\d{10}$/.test(whatsappPhone) && <a className="admin-primary" href={`https://wa.me/${whatsappPhone}`} target="_blank" rel="noreferrer"><MessageCircle/> WhatsApp</a>}</div>
    <section className="customer-kpis"><article><CircleDollarSign/><div><small>LTV registrado</small><strong>{formatCop(ltv)}</strong></div></article><article><ShoppingBag/><div><small>Compras</small><strong>{sales.length}</strong></div></article><article><Clock3/><div><small>Solicitudes</small><strong>{inquiries.length}</strong></div></article><article><CalendarClock/><div><small>Primera vez</small><strong>{new Intl.DateTimeFormat("es-CO", { month: "short", year: "numeric", timeZone: "America/Bogota" }).format(new Date(customer.first_seen_at))}</strong></div></article></section>
    <section className="customer-detail-grid"><div className="customer-main-column"><article className="admin-panel customer-timeline"><div className="panel-heading"><div><p className="admin-kicker">Historia completa</p><h2>Línea de tiempo</h2></div></div>{timeline.length ? <div className="timeline-list">{timeline.map((event) => <div key={event.id} className={`timeline-event ${event.kind}`}><span>{event.kind === "note" ? <NotebookPen/> : event.kind === "inquiry" ? <ShoppingBag/> : <MessageCircle/>}</span><div><strong>{event.title}</strong><time>{new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Bogota" }).format(new Date(event.date))}</time></div></div>)}</div> : <div className="admin-empty compact"><p>Sin actividad registrada.</p></div>}</article><article className="admin-panel note-composer"><div><p className="admin-kicker">Memoria del equipo</p><h2>Nueva nota interna</h2><p>Guarda preferencias, contexto o el mejor momento para volver a contactar.</p></div><form action={addCustomerNote}><input type="hidden" name="customer_id" value={customer.id}/><textarea name="note" minLength={2} maxLength={2000} rows={4} required placeholder="Ej. Prefiere tonos cálidos y responder después de las 5 p. m."/><button className="admin-primary" type="submit"><NotebookPen/> Guardar nota</button></form></article></div>
      <aside className="admin-panel customer-profile-editor"><div className="panel-heading"><div><p className="admin-kicker">Perfil</p><h2>Datos y preferencias</h2></div><UserRound/></div><form action={updateCustomer}><input type="hidden" name="id" value={customer.id}/><label>Nombre<input name="name" defaultValue={customer.name} minLength={2} maxLength={100} required/></label><label>WhatsApp<input name="phone" type="tel" defaultValue={customer.phone || ""} maxLength={30}/></label><label>Correo<input name="email" type="email" defaultValue={customer.email || ""} maxLength={160}/></label><label>Instagram<input name="instagram_handle" defaultValue={customer.instagram_handle || ""} maxLength={80}/></label><label>Ciudad<input name="city" defaultValue={customer.city || ""} maxLength={100}/></label><label>Etiquetas <small>Separadas por comas</small><input name="tags" defaultValue={customer.tags?.join(", ") || ""} maxLength={400}/></label><label>Preferencias<textarea name="preferences" rows={5} defaultValue={customer.preferences || ""} maxLength={1200}/></label><label className="checkbox-label"><input type="checkbox" name="transactional_consent" defaultChecked={customer.transactional_consent}/> Consiente mensajes sobre sus pedidos</label><label className="checkbox-label"><input type="checkbox" name="marketing_consent" defaultChecked={customer.marketing_consent}/> Consiente mensajes promocionales</label><button className="admin-primary" type="submit">Guardar perfil</button></form></aside>
    </section>
  </main>;
}
