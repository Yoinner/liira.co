"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { classifyVisit, privacyVersion } from "@/lib/privacy";

const key = "liira:privacy-choice";
const version = privacyVersion;
type Choice = { version: string; analytics: boolean; personalization: boolean; marketing: boolean; savedAt: string };

function readChoice(raw: string | null): Choice | null {
  try {
    const value = JSON.parse(raw || "null") as Choice | null;
    return value?.version === version && !Number.isNaN(Date.parse(value.savedAt)) && typeof value.analytics === "boolean" && typeof value.personalization === "boolean" && typeof value.marketing === "boolean" ? value : null;
  } catch { return null; }
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("liira:privacy", callback);
  return () => { window.removeEventListener("storage", callback); window.removeEventListener("liira:privacy", callback); };
}

export function PrivacyPreferences() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const stored = useSyncExternalStore(subscribe, () => localStorage.getItem(key), () => "loading");
  const choice = readChoice(stored);
  const ready = stored !== "loading";
  const [reopening, setReopening] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const open = ready && ((!choice && !dismissed) || reopening);
  const dialog = useRef<HTMLElement>(null);
  const [options, setOptions] = useState({ analytics: false, personalization: false, marketing: false });

  useEffect(() => {
    if (!open || !dialog.current) return;
    const previous = document.activeElement as HTMLElement | null;
    dialog.current.focus({ preventScroll: true });
    function containFocus(event: KeyboardEvent) {
      if (event.key === "Escape") { setReopening(false); setDismissed(true); return; }
      if (event.key !== "Tab" || !dialog.current) return;
      const elements = [...dialog.current.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled)')];
      if (!elements.length) return;
      if (event.shiftKey && (document.activeElement === elements[0] || document.activeElement === dialog.current)) { event.preventDefault(); elements.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === elements.at(-1)) { event.preventDefault(); elements[0].focus(); }
    }
    document.addEventListener("keydown", containFocus);
    return () => { document.removeEventListener("keydown", containFocus); previous?.focus(); };
  }, [open]);

  useEffect(() => {
    if (!ready || !choice?.analytics || !pathname) return;
    const sessionKey = "liira:anonymous-session";
    let sessionId = sessionStorage.getItem(sessionKey);
    if (!sessionId) { sessionId = crypto.randomUUID(); sessionStorage.setItem(sessionKey, sessionId); }
    const visit = classifyVisit(pathname, search);
    if (!visit) return;
    void fetch("/api/visitor-events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId, ...visit, consentVersion: version }), keepalive: true }).catch(() => undefined);
  }, [choice?.analytics, pathname, ready, search]);

  function save(next: Pick<Choice, "analytics" | "personalization" | "marketing">) {
    const value = { ...next, version, savedAt: new Date().toISOString() };
    localStorage.setItem(key, JSON.stringify(value));
    if (!next.analytics) sessionStorage.removeItem("liira:anonymous-session");
    window.dispatchEvent(new Event("liira:privacy"));
    setOptions(next);
    setReopening(false);
  }

  if (!ready) return null;
  return <>
    <button className="privacy-reopen" type="button" onClick={() => { setOptions({ analytics: choice?.analytics || false, personalization: choice?.personalization || false, marketing: choice?.marketing || false }); setDismissed(false); setReopening(true); }} aria-label="Cambiar preferencias de privacidad">Privacidad</button>
    {open && <div className="privacy-backdrop"><section ref={dialog} tabIndex={-1} className="privacy-dialog" role="dialog" aria-modal="true" aria-labelledby="privacy-title">
      <p className="eyebrow">Tu decisión, a tu ritmo</p><h2 id="privacy-title">Una experiencia hecha <em>con respeto.</em></h2>
      <p>Usamos lo necesario para que Liira funcione. Las demás opciones están desactivadas: si quieres activarlas, márcalas antes de continuar. Podrás cambiarlas después en «Privacidad». Esta elección <strong>no autoriza mensajes de WhatsApp</strong> ni revela tu número.</p>
      <div className="privacy-options">
        <label><span><strong>Necesarias</strong><small>Seguridad y preferencias básicas.</small></span><input type="checkbox" checked disabled /></label>
        <label><span><strong>Analítica</strong><small>Vistas de productos y categorías con sesión anónima.</small></span><input type="checkbox" checked={options.analytics} onChange={(e) => setOptions({ ...options, analytics: e.target.checked })} /></label>
        <label><span><strong>Personalización</strong><small>Preferencias opcionales en este navegador; sin identificación automática.</small></span><input type="checkbox" checked={options.personalization} onChange={(e) => setOptions({ ...options, personalization: e.target.checked })} /></label>
        <label><span><strong>Marketing</strong><small>Preferencia de cookies; los mensajes requieren un permiso separado y no se envían por esta elección.</small></span><input type="checkbox" checked={options.marketing} onChange={(e) => setOptions({ ...options, marketing: e.target.checked })} /></label>
      </div>
      <div className="privacy-actions"><button type="button" onClick={() => save(options)}>Aceptar y continuar</button></div>
      <Link href="/politicas/privacidad" onClick={() => { setReopening(false); setDismissed(true); }}>Leer la política de privacidad</Link>{choice && <p className="privacy-saved">Tu última elección fue guardada el {new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeZone: "America/Bogota" }).format(new Date(choice.savedAt))}.</p>}
    </section></div>}
  </>;
}
