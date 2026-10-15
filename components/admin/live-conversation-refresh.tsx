"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function LiveConversationRefresh() {
  const router = useRouter();

  useEffect(() => {
    const interval = window.setInterval(() => {
      const editing = document.activeElement?.matches("input, textarea, select");
      if (document.visibilityState === "visible" && !editing) router.refresh();
    }, 3000);
    return () => window.clearInterval(interval);
  }, [router]);

  return <span className="whatsapp-live" aria-label="Mensajes actualizados automáticamente"><i /> En vivo</span>;
}
