"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

type TurnstileApi = { render: (element: HTMLElement, options: Record<string, unknown>) => string; remove: (id: string) => void; reset: (id: string) => void };
declare global { interface Window { turnstile?: TurnstileApi } }

export function TurnstileWidget({ onToken, resetKey }: { onToken: (token: string) => void; resetKey: number }) {
  const sitekey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || (process.env.NODE_ENV === "development" ? "1x00000000000000000000AA" : "");
  const [loaded, setLoaded] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);

  useEffect(() => {
    if (!loaded || !sitekey || !host.current || !window.turnstile || widget.current) return;
    widget.current = window.turnstile.render(host.current, {
      sitekey, theme: "light", size: "flexible",
      callback: onToken,
      "expired-callback": () => onToken(""),
      "error-callback": () => onToken(""),
    });
    return () => { if (widget.current) window.turnstile?.remove(widget.current); widget.current = null; };
  }, [loaded, onToken, sitekey]);

  useEffect(() => { if (resetKey && widget.current) { onToken(""); window.turnstile?.reset(widget.current); } }, [resetKey, onToken]);

  if (!sitekey) return <p className="form-error" role="status">Las solicitudes están temporalmente deshabilitadas.</p>;
  return <><Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onReady={() => setLoaded(true)} /><div ref={host} className="turnstile-host" aria-label="Verificación de seguridad" /></>;
}
