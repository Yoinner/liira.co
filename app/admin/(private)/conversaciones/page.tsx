import Link from "next/link";
import { Bot, MessageCircleMore, PhoneCall, UserRound } from "lucide-react";
import { openWhatsAppConversation } from "@/app/admin/actions";
import { LiveConversationRefresh } from "@/components/admin/live-conversation-refresh";
import { requireAdmin } from "@/lib/auth/session";
import { getWhatsAppInbox } from "@/lib/data/crm";

const labels = { requiere_respuesta: "Requiere respuesta", esperando_cliente: "Esperando cliente", cotizando: "Cotizando", cerrada_ganada: "Venta cerrada", cerrada_perdida: "No cerrada" } as const;

export default async function ConversationsPage() {
  await requireAdmin("business");
  const { conversations, available } = await getWhatsAppInbox();
  return <main className="admin-content whatsapp-inbox-page">
    <div className="admin-title whatsapp-title"><div><p className="admin-kicker">WhatsApp Business conectado</p><h1>Conversaciones vivas.</h1><p className="admin-lead">Mensajes recibidos, prioridad comercial y siguiente acción en una sola bandeja.</p></div><LiveConversationRefresh /></div>
    {!available && <div className="admin-unavailable">La bandeja quedará disponible al aplicar la migración de WhatsApp.</div>}
    <form action={openWhatsAppConversation} className="admin-panel whatsapp-new-conversation">
      <div><span><PhoneCall /></span><div><strong>Nueva conversación</strong><p>Ingresa un celular colombiano. Lo validamos y abrimos su ficha dentro de la bandeja.</p></div></div>
      <label><span>Número de WhatsApp</span><input name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="300 123 4567" minLength={10} maxLength={30} required /></label>
      <label><span>Nombre, si lo conoces</span><input name="name" type="text" autoComplete="name" placeholder="Nombre del cliente" maxLength={100} /></label>
      <button type="submit">Verificar y abrir</button>
      <small>Si el cliente aún no ha escrito, Meta solo permite iniciar el contacto con una plantilla aprobada. El panel te avisará antes de enviar.</small>
    </form>
    <section className="whatsapp-queue">{conversations.length ? conversations.map((item) => <Link className="admin-panel whatsapp-thread-card" href={`/admin/conversaciones/${item.id}`} key={item.id}>
      <span className="whatsapp-avatar"><UserRound/></span><div><div className="whatsapp-thread-title"><strong>{item.customer?.name || item.normalized_phone}</strong>{item.unread_count > 0 && <b>{item.unread_count}</b>}</div><p>{item.ai_summary || "La conversación está lista para revisión."}</p><small>{item.ai_intent ? `Intención: ${item.ai_intent}` : "Clasificación pendiente"} · {new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Bogota" }).format(new Date(item.last_message_at))}</small></div><span className={`conversation-state state-${item.status}`}>{labels[item.status]}</span>
    </Link>) : <div className="admin-panel admin-empty tall"><MessageCircleMore/><p>Aún no hay conversaciones recibidas.</p><span>Cuando un cliente escriba al número conectado aparecerá aquí automáticamente.</span></div>}</section>
    <aside className="ai-boundary"><Bot/><div><strong>Análisis asistido</strong><p>La IA resume intención y próximo paso cuando el proveedor está autorizado. Sus sugerencias son editables y nunca cambian ventas ni consentimientos por sí solas.</p></div></aside>
  </main>;
}
