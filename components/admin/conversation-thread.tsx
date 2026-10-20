"use client";

import { useLayoutEffect, useRef } from "react";

export function ConversationThread({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const followLatest = useRef(true);
  useLayoutEffect(() => {
    if (ref.current && followLatest.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [children]);
  return <article ref={ref} className="admin-panel message-thread" aria-live="polite" onScroll={(event) => {
    const target = event.currentTarget;
    followLatest.current = target.scrollHeight - target.scrollTop - target.clientHeight < 80;
  }}>{children}</article>;
}
