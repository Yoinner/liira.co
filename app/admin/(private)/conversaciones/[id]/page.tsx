import Link from "next/link";
import { ArrowLeft, Bot, MessageCircle } from "lucide-react";
import { notFound } from "next/navigation";
import { sendWhatsAppMessage, updateWhatsAppConversation } from "@/app/admin/actions";
import { LiveConversationRefresh } from "@/components/admin/live-conversation-refresh";
import { getServerNow } from "@/lib/admin/analytics";
import { requireAdmin } from "@/lib/auth/session";
import { getWhatsAppConversation } from "@/lib/data/crm";

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin("business");
  const { id } = await params;
  const detail = await getWhatsAppConversation(id);
  if (!detail) notFound();
  const { conversation, messages } = detail;
  const serviceWindowOpen = Boolean(conversation.last_inbound_at && getServerNow() - new Date(conversation.last_inbound_at).getTime() <= 24 * 60 * 60 * 1000);
  return <main className="admin-content whatsapp-conversation-page">
    <Link href="/admin/conversaciones" className="admin-back"><ArrowLeft/> Volver a conversaciones</Link>
    <div className="conversation-header"><div><p className="admin-kicker">WhatsApp Business · Liira</p><h1>{conversation.customer?.name || conversation.normalized_phone}</h1><span>{conversation.normalized_phone}</span></div><div className="conversation-header-actions"><LiveConversationRefresh /><Link className="admin-primary" href={`/admin/clientes/${conversation.customer_id}`}>Ver cliente 360°</Link></div></div>
    <section className="conversation-layout"><div className="conversation-main"><article className="admin-panel message-thread">{messages.length ? messages.map((message) => <div className={`message-bubble ${message.direction}`} key={message.id}><p>{message.body || `Mensaje ${message.message_type}`}</p><time>{new Intl.DateTimeFormat("es-CO", { dateStyle: "short", timeStyle: "short", timeZone: "America/Bogota" }).format(new Date(message.created_at))} · {message.delivery_status}</time></div>) : <div className="admin-empty"><MessageCircle/><p>Sin mensajes guardados.</p></div>}</article>
      <form action={sendWhatsAppMessage} className="admin-panel reply-composer"><input type="hidden" name="id" value={conversation.id}/><textarea name="body" required minLength={1} maxLength={2000} rows={3} disabled={!serviceWindowOpen} placeholder={serviceWindowOpen ? "Escribe una respuesta para enviar desde Liira…" : "La ventana de 24 horas terminó; se requiere una plantilla aprobada."}/><button className="admin-primary" type="submit" disabled={!serviceWindowOpen}>Enviar por WhatsApp</button></form></div>
      <aside className="conversation-side"><article className="admin-panel conversation-ai"><Bot/><p className="admin-kicker">Lectura asistida</p><h2>{conversation.ai_intent || "Pendiente"}</h2><p>{conversation.ai_summary || "El análisis aparecerá después del próximo mensaje entrante."}</p><dl><div><dt>Tono</dt><dd>{conversation.ai_sentiment || "No analizado"}</dd></div><div><dt>Siguiente acción</dt><dd>{conversation.ai_next_action || "Revisar y responder manualmente"}</dd></div><div><dt>Confianza</dt><dd>{conversation.ai_confidence == null ? "No disponible" : `${Math.round(conversation.ai_confidence * 100)}%`}</dd></div></dl></article><form action={updateWhatsAppConversation} className="admin-panel conversation-status-form"><input type="hidden" name="id" value={conversation.id}/><label>Estado<select name="status" defaultValue={conversation.status}><option value="requiere_respuesta">Requiere respuesta</option><option value="esperando_cliente">Esperando cliente</option><option value="cotizando">Cotizando</option><option value="cerrada_ganada">Venta cerrada</option><option value="cerrada_perdida">No cerrada</option></select></label><button type="submit">Guardar y marcar revisada</button></form></aside>
    </section>
  </main>;
}
