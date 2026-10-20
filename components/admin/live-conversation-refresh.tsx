"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function LiveConversationRefresh({ available = true }: { available?: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!available) return;
    const interval = window.setInterval(() => {
      const editing = document.activeElement?.matches("input, textarea, select");
      if (document.visibilityState === "visible" && !editing) router.refresh();
    }, 3000);
    return () => window.clearInterval(interval);
  }, [router, available]);

  return <span className={`whatsapp-live ${available ? "" : "unavailable"}`} aria-label={available ? "Mensajes actualizados automáticamente" : "Bandeja no disponible"}><i /> {available ? "En vivo" : "Sin conexión"}</span>;
}
