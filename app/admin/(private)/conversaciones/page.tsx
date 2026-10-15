import Link from "next/link";
import { Bot, MessageCircleMore, UserRound } from "lucide-react";
import { requireAdmin } from "@/lib/auth/session";
import { getWhatsAppInbox } from "@/lib/data/crm";

const labels = { requiere_respuesta: "Requiere respuesta", esperando_cliente: "Esperando cliente", cotizando: "Cotizando", cerrada_ganada: "Venta cerrada", cerrada_perdida: "No cerrada" } as const;

export default async function ConversationsPage() {
  await requireAdmin("business");
  const { conversations, available } = await getWhatsAppInbox();
  return <main className="admin-content whatsapp-inbox-page">
    <div className="admin-title"><div><p className="admin-kicker">WhatsApp conectado</p><h1>Conversaciones vivas.</h1><p className="admin-lead">Mensajes recibidos, prioridad comercial y siguiente acción en una sola bandeja.</p></div></div>
    {!available && <div className="admin-unavailable">La bandeja quedará disponible al aplicar la migración de WhatsApp.</div>}
    <section className="whatsapp-queue">{conversations.length ? conversations.map((item) => <Link className="admin-panel whatsapp-thread-card" href={`/admin/conversaciones/${item.id}`} key={item.id}>
      <span className="whatsapp-avatar"><UserRound/></span><div><div className="whatsapp-thread-title"><strong>{item.customer?.name || item.normalized_phone}</strong>{item.unread_count > 0 && <b>{item.unread_count}</b>}</div><p>{item.ai_summary || "La conversación está lista para revisión."}</p><small>{item.ai_intent ? `Intención: ${item.ai_intent}` : "Clasificación pendiente"} · {new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Bogota" }).format(new Date(item.last_message_at))}</small></div><span className={`conversation-state state-${item.status}`}>{labels[item.status]}</span>
    </Link>) : <div className="admin-panel admin-empty tall"><MessageCircleMore/><p>Aún no hay conversaciones recibidas.</p><span>Cuando un cliente escriba al número conectado aparecerá aquí automáticamente.</span></div>}</section>
    <aside className="ai-boundary"><Bot/><div><strong>Análisis asistido</strong><p>La IA resume intención y próximo paso cuando el proveedor está autorizado. Sus sugerencias son editables y nunca cambian ventas ni consentimientos por sí solas.</p></div></aside>
  </main>;
}
