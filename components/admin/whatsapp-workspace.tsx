"use client";

import Link from "next/link";
import { Bot, MessageCircleMore, Search, UserRound } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { WhatsAppConversation } from "@/lib/types";
import { WhatsAppMark } from "@/components/admin/whatsapp-mark";

type InboxItem = WhatsAppConversation & { lastMessagePreview?: string | null };
type Filter = "all" | "pending" | "amanda" | "human";

const statusLabels: Record<WhatsAppConversation["status"], string> = {
  requiere_respuesta: "Por responder", esperando_cliente: "Esperando cliente", cotizando: "Cotizando", cerrada_ganada: "Venta cerrada", cerrada_perdida: "Cerrada",
};

export function ConversationRail({ conversations, selectedId }: { conversations: InboxItem[]; selectedId?: string }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const normalized = query.trim().toLocaleLowerCase("es-CO");
  const visible = conversations.filter((item) => {
    const matches = !normalized || `${item.customer?.name || ""} ${item.normalized_phone} ${item.lastMessagePreview || ""}`.toLocaleLowerCase("es-CO").includes(normalized);
    return matches && (filter === "all" || filter === "pending" && item.status === "requiere_respuesta" || filter === "amanda" && item.automation_mode === "autonomous" || filter === "human" && item.automation_mode === "human");
  });
  const pending = conversations.filter((item) => item.status === "requiere_respuesta").length;

  return <aside className="wa-rail" aria-label="Bandeja de conversaciones">
    <div className="wa-rail-heading"><div><span className="wa-rail-label">Bandeja comercial</span><h2>Conversaciones <span>{conversations.length}</span></h2></div><WhatsAppMark className="wa-rail-mark" /></div>
    <label className="wa-search"><Search size={17} aria-hidden="true"/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar conversación" aria-label="Buscar nombre, número o mensaje" type="search" /></label>
    <div className="wa-filters" aria-label="Filtrar conversaciones">{([
      ["all", "Todas", conversations.length], ["pending", "Pendientes", pending], ["amanda", "Amanda", null], ["human", "Humana", null],
    ] as const).map(([value, label, count]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}{count !== null && <span>{count}</span>}</button>)}</div>
    <div className="wa-contact-list">{visible.length ? visible.map((item) => {
      const name = item.customer?.name || item.normalized_phone;
      return <Link href={`/admin/conversaciones/${item.id}`} key={item.id} className={`wa-contact ${selectedId === item.id ? "selected" : ""}`} aria-current={selectedId === item.id ? "page" : undefined}>
        <span className="wa-contact-avatar" aria-hidden="true">{name.trim().charAt(0).toLocaleUpperCase("es-CO") || <UserRound size={19}/>}</span>
        <span className="wa-contact-copy"><span className="wa-contact-top"><strong>{name}</strong><time dateTime={item.last_message_at}>{new Intl.DateTimeFormat("es-CO", { hour: "numeric", minute: "2-digit", timeZone: "America/Bogota" }).format(new Date(item.last_message_at))}</time></span>
          <span className="wa-contact-preview">{item.lastMessagePreview || (item.ai_summary ? `Resumen: ${item.ai_summary}` : "Sin vista previa disponible")}</span>
          <span className="wa-contact-meta"><span className={`wa-status wa-status-${item.status}`}>{statusLabels[item.status]}</span><span>{item.automation_mode === "autonomous" ? <><Bot size={12}/> Amanda</> : item.automation_mode === "human" ? "Atención humana" : "Pausada"}</span></span>
        </span>{item.unread_count > 0 && <span className="wa-unread" aria-label={`${item.unread_count} mensajes sin leer`}>{item.unread_count}</span>}
      </Link>;
    }) : <div className="wa-list-empty"><MessageCircleMore size={24}/><strong>{conversations.length ? "Sin resultados" : "Aún no hay conversaciones"}</strong><p>{conversations.length ? "Prueba otro nombre o cambia el filtro." : "Los mensajes del número conectado aparecerán aquí."}</p></div>}</div>
  </aside>;
}

export function WhatsAppWorkspace({ rail, chat, context, selected = false, pendingCount = 0 }: { rail: ReactNode; chat: ReactNode; context: ReactNode; selected?: boolean; pendingCount?: number }) {
  const [pane, setPane] = useState<"contacts" | "chat" | "context">(selected ? "chat" : "contacts");
  return <div className="wa-workspace" data-pane={pane}>
    <nav className="wa-mobile-tabs" aria-label="Áreas de WhatsApp"><button type="button" aria-current={pane === "contacts" ? "page" : undefined} onClick={() => setPane("contacts")}>Contactos</button><button type="button" aria-current={pane === "chat" ? "page" : undefined} onClick={() => setPane("chat")}>Chat</button><button type="button" aria-current={pane === "context" ? "page" : undefined} onClick={() => setPane("context")}>Cliente 360°{pendingCount > 0 && <span className="wa-tab-alert" aria-label={`${pendingCount} consultas pendientes`}>{pendingCount}</span>}</button></nav>
    <div className="wa-workspace-rail">{rail}</div><div className="wa-workspace-chat">{chat}</div><div className="wa-workspace-context">{context}</div>
  </div>;
}
