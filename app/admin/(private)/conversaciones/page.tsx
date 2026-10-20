import Link from "next/link";
import { ArrowRight, PhoneCall } from "lucide-react";
import { openWhatsAppConversation } from "@/app/admin/actions";
import { LiveConversationRefresh } from "@/components/admin/live-conversation-refresh";
import { ConversationRail, WhatsAppWorkspace } from "@/components/admin/whatsapp-workspace";
import { WhatsAppMark } from "@/components/admin/whatsapp-mark";
import { requireAdmin } from "@/lib/auth/session";
import { getWhatsAppInbox } from "@/lib/data/crm";

export default async function ConversationsPage() {
  await requireAdmin("business");
  const { conversations, available } = await getWhatsAppInbox();
  const pending = conversations.filter((item) => item.status === "requiere_respuesta").length;
  return <main className="admin-content whatsapp-inbox-page">
    <header className="wa-command-header"><div className="wa-command-brand"><span><WhatsAppMark/></span><div><p>LIIRA / CANAL OFICIAL</p><h1>WhatsApp Business</h1><small>Conversaciones, decisiones y contexto en un solo lugar.</small></div></div><div className="wa-command-status"><span>{available ? `${conversations.length} conversaciones` : "Bandeja no disponible"}</span><span>{available ? `${pending} por responder` : "Sin conexión a datos"}</span><LiveConversationRefresh available={available}/></div></header>
    {!available && <div className="admin-unavailable">No se puede leer la bandeja en este entorno. No se mostrarán mensajes ni acciones activas hasta recuperar la conexión.</div>}
    <WhatsAppWorkspace rail={<ConversationRail conversations={conversations}/>} chat={<div className="wa-unselected"><div className="wa-unselected-art" aria-hidden="true"><span>Liira</span><WhatsAppMark/></div><p className="admin-kicker">Tu mesa de atención</p><h2>Cada conversación<br/><em>tiene su historia.</em></h2><p>Elige un contacto de la bandeja para leer sus mensajes, responder desde Liira y consultar su contexto comercial.</p>{conversations[0] && <Link href={`/admin/conversaciones/${conversations[0].id}`}>Abrir conversación más reciente <ArrowRight size={16}/></Link>}</div>} context={<aside className="wa-context-intro"><p className="admin-kicker">Iniciar atención</p><h2>Nuevo contacto</h2><p>Si ya te escribió, encontrarás la conversación en la bandeja. Para empezar una nueva, confirma su número y el permiso de contacto.</p><form action={openWhatsAppConversation} className="whatsapp-new-conversation">
      <div><span><PhoneCall /></span><div><strong>Nueva conversación</strong><p>Ingresa un celular colombiano. Lo validamos y abrimos su ficha dentro de la bandeja.</p></div></div>
      <label><span>Número de WhatsApp</span><input name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="300 123 4567" minLength={10} maxLength={30} required disabled={!available} /></label>
      <label><span>Nombre, si lo conoces</span><input name="name" type="text" autoComplete="name" placeholder="Nombre del cliente" maxLength={100} disabled={!available} /></label>
      <button type="submit" disabled={!available}>Verificar y abrir</button>
      <small>Si el cliente aún no ha escrito, Meta solo permite iniciar el contacto con una plantilla aprobada. El panel te avisará antes de enviar.</small>
    </form></aside>} />
  </main>;
}
