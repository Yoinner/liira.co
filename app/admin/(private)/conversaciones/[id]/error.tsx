"use client";

import Link from "next/link";

export default function ConversationError({ reset }: { error: Error; reset: () => void }) {
  return <main className="admin-content whatsapp-conversation-page"><section className="admin-panel wa-error-state"><p className="admin-kicker">Atención pendiente</p><h1>No pudimos completar esta operación.</h1><p>Si acababas de enviar un mensaje o archivo, revisa primero el historial del chat: Meta puede haberlo recibido aunque el panel no haya confirmado el registro. No lo reenvíes a ciegas.</p><div><button type="button" className="admin-primary" onClick={reset}>Volver a revisar</button><Link href="/admin/conversaciones">Ir a la bandeja</Link></div></section></main>;
}
