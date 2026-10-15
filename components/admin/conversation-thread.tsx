"use client";

import { useEffect, useRef } from "react";

export function ConversationThread({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  });
  return <article ref={ref} className="admin-panel message-thread" aria-live="polite">{children}</article>;
}
