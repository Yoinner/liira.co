import Link from "next/link";
import { ArrowUpRight, BadgeCheck, CircleAlert, CreditCard, ShieldCheck } from "lucide-react";
import { approveAmandaPaymentMethod } from "@/app/admin/actions";
import { requireAdmin } from "@/lib/auth/session";
import { formatCop } from "@/lib/config";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export default async function ManualPaymentsPage() {
  await requireAdmin("business");
  const client = getSupabaseAdmin();
  const [methods, orders] = client ? await Promise.all([
    client.from("amanda_payment_methods").select("method,recipient,updated_at").order("method"),
    client.from("amanda_manual_orders").select("id,reference,summary,amount_cop,payment_method,status,conversation_id,verified_at").order("created_at", { ascending: false }).limit(100),
  ]) : [null, null];
  const ready = Boolean(methods && orders && !methods.error && !orders.error);
  const pending = orders?.data?.filter((order) => order.status === "awaiting_payment") || [];
  const verified = orders?.data?.filter((order) => order.status === "paid") || [];

  return <main className="admin-content payments-page">
    <div className="admin-title"><div><p className="admin-kicker">Operación comercial / Finanzas</p><h1>Pagos con criterio.</h1><p className="admin-lead">Un destino autorizado, un pedido aprobado y dinero verificado son tres pasos distintos.</p></div></div>
    <div className="payment-boundary"><ShieldCheck aria-hidden="true"/><p><strong>La seguridad es parte del flujo.</strong> Aprobar Nequi o Bre-B solo permite que Amanda comunique un destino comprobado. Nunca confirma que entró dinero; cada pago se verifica por separado en la cuenta receptora.</p></div>
    {!ready && <aside className="admin-panel admin-unavailable">Configuración de pagos no disponible. No apruebes medios ni confirmes fondos hasta verificar las migraciones y la conexión.</aside>}
    {ready && <>
      <section className="payment-summary" aria-label="Estado de pedidos manuales">
        <article className="admin-panel"><span><CreditCard aria-hidden="true"/></span><div><small>Pendientes de pago</small><strong>{pending.length}</strong><p>Pedidos aprobados, sin fondos verificados.</p></div></article>
        <article className="admin-panel"><span><BadgeCheck aria-hidden="true"/></span><div><small>Pagos verificados</small><strong>{verified.length}</strong><p>Confirmados por una persona autorizada.</p></div></article>
      </section>
      <section className="payment-grid">
        <article className="admin-panel payment-methods"><div className="panel-heading"><div><p className="admin-kicker">01 / Configuración</p><h2>Destinos autorizados</h2></div></div><p className="payment-intro">Comprueba la titularidad del destino antes de permitir que Amanda lo comparta. Esta acción no mueve dinero.</p>
          {(["nequi", "breb"] as const).map((method) => { const current = methods?.data?.find((item) => item.method === method); const name = method === "nequi" ? "Nequi" : "Bre-B"; return <details key={method} className="payment-method" open={!current}><summary><span><CreditCard aria-hidden="true"/><strong>{name}</strong></span><em className={current ? "is-approved" : ""}>{current ? "Destino autorizado" : "Sin configurar"}</em></summary><form action={approveAmandaPaymentMethod}><label>Destino de pago<input name="recipient" defaultValue={current?.recipient || ""} minLength={3} maxLength={80} required autoComplete="off"/></label><input type="hidden" name="method" value={method}/><label className="payment-check"><input type="checkbox" name="ownership" value="confirmed" required/> Verifiqué que el destino pertenece al negocio.</label><label className="payment-check"><input type="checkbox" name="disclosure" value="approved" required/> Autorizo divulgarlo a clientes.</label><button type="submit" className="admin-primary">{current ? "Actualizar autorización" : `Autorizar ${name}`}</button></form></details>; })}
        </article>
        <article className="admin-panel payment-orders"><div className="panel-heading"><div><p className="admin-kicker">02 / Seguimiento</p><h2>Pedidos manuales</h2></div></div><p className="payment-intro">El estado «pendiente» no representa un pago recibido. Abre la conversación para revisar cada caso y su comprobante.</p>
          {orders?.data?.length ? <div className="payment-order-list">{orders.data.map((order) => <Link key={order.id} href={`/admin/conversaciones/${order.conversation_id}`}><span><strong>{order.reference}</strong><small>{order.summary}</small></span><span className="payment-order-meta"><b>{formatCop(order.amount_cop)}</b><em className={order.status === "paid" ? "is-paid" : order.status === "cancelled" ? "is-cancelled" : ""}>{order.status === "paid" ? "Fondos verificados" : order.status === "cancelled" ? "Cancelado" : "Pendiente de pago"}</em></span><ArrowUpRight aria-hidden="true"/></Link>)}</div> : <div className="admin-empty compact"><CircleAlert aria-hidden="true"/><p>Sin pedidos aprobados.</p><span>Aparecerán aquí cuando se aprueben desde una conversación.</span></div>}
        </article>
      </section>
    </>}
  </main>;
}
