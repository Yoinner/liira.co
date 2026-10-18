import Link from "next/link";
import { approveAmandaPaymentMethod } from "@/app/admin/actions";
import { requireAdmin } from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export default async function ManualPaymentsPage() {
  await requireAdmin("business");
  const client = getSupabaseAdmin();
  const [methods, orders] = client ? await Promise.all([
    client.from("amanda_payment_methods").select("method,recipient,updated_at").order("method"),
    client.from("amanda_manual_orders").select("id,reference,summary,amount_cop,payment_method,status,conversation_id,verified_at").order("created_at", { ascending: false }).limit(100),
  ]) : [null, null];
  const ready = Boolean(methods && orders && !methods.error && !orders.error);
  return <main className="admin-content"><p className="admin-kicker">Operación comercial verificada</p><h1>Pagos manuales</h1><p>Registrar un medio no confirma dinero recibido. La aprobación y cada verificación quedan auditadas; Amanda solo usa pedidos ligados a una conversación.</p>
    {!ready && <aside className="admin-panel">Configuración de pagos pendiente: faltan las migraciones de prueba y su aplicación autorizada. No apruebes métodos todavía.</aside>}
    {ready && <><section className="admin-panel"><h2>Medios autorizados</h2><p>Comprueba en la cuenta del negocio la titularidad de cada destino y confirma que puede divulgarse a clientes.</p>
      {(["nequi", "breb"] as const).map((method) => { const current = methods?.data?.find((item) => item.method === method); return <form key={method} action={approveAmandaPaymentMethod}><h3>{method === "nequi" ? "Nequi" : "Bre-B"}</h3><input type="hidden" name="method" value={method}/><label>Destino<input name="recipient" defaultValue={current?.recipient || ""} minLength={3} maxLength={80} required autoComplete="off"/></label><label><input type="checkbox" name="ownership" value="confirmed" required/> Verifiqué que pertenece al negocio.</label><label><input type="checkbox" name="disclosure" value="approved" required/> Autorizo divulgar este dato de pago a clientes.</label><button type="submit">Aprobar {method === "nequi" ? "Nequi" : "Bre-B"}</button></form>; })}
    </section><section className="admin-panel"><h2>Pedidos manuales recientes</h2>{orders?.data?.length ? <ul>{orders.data.map((order) => <li key={order.id}><Link href={`/admin/conversaciones/${order.conversation_id}`}>{order.reference}</Link> · {order.summary} · ${order.amount_cop.toLocaleString("es-CO")} · {order.payment_method} · {order.status === "paid" ? "Pago verificado" : order.status === "cancelled" ? "Cancelado" : "Pendiente de pago"}</li>)}</ul> : <p>Sin pedidos aprobados.</p>}</section></>}
  </main>;
}
