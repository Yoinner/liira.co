"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle, Send } from "lucide-react";
import { siteConfig } from "@/lib/config";
import { marketingConsentText } from "@/lib/privacy";
import { TurnstileWidget } from "@/components/public/turnstile-widget";

type Props = {
  productId?: string;
  productName?: string;
  compact?: boolean;
  kind?: "standard" | "restock";
};

const draftKey = "liira-personalization-draft-v1";

export function InquiryComposer({ productId, productName = "Pieza personalizada", compact = false, kind = "standard" }: Props) {
  const [pending, setPending] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [color, setColor] = useState("");
  const [details, setDetails] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [resetKey, setResetKey] = useState(0);
  const requestKey = useRef<string | null>(null);
  const personalized = !productId && kind === "standard";
  const onToken = useCallback((token: string) => setTurnstileToken(token), []);

  useEffect(() => {
    if (!personalized) return;
    const timer = window.setTimeout(() => {
      try {
        const draft = JSON.parse(localStorage.getItem(draftKey) || "null") as { color?: string; details?: string } | null;
        if (draft) { setColor(draft.color || ""); setDetails(draft.details || ""); setNotice("Recuperamos tu diseño guardado en este dispositivo."); }
      } catch { localStorage.removeItem(draftKey); }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [personalized]);

  function saveDraft() {
    if (!color.trim() && !details.trim()) return setNotice("Añade un color o un detalle para guardar tu idea.");
    localStorage.setItem(draftKey, JSON.stringify({ color: color.trim(), details: details.trim() }));
    setNotice("Tu idea quedó guardada solo en este dispositivo; aún no la enviamos a Liira.");
  }

  function clearDraft() {
    localStorage.removeItem(draftKey);
    setColor("");
    setDetails("");
    setNotice("Borramos el diseño guardado en este dispositivo.");
  }

  function shareDraft() {
    if (!color.trim() && !details.trim()) return setNotice("Añade un color o un detalle antes de compartir.");
    const message = ["Mi idea para Liira:", color.trim() && `Color: ${color.trim()}`, details.trim() && `Detalles: ${details.trim()}`].filter(Boolean).join("\n");
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  }

  async function submit(formData: FormData) {
    if (pending || complete) return;
    if (!turnstileToken) return setError("Completa la verificación de seguridad antes de continuar.");
    setPending(true);
    setError("");
    setNotice("");
    requestKey.current ||= crypto.randomUUID();
    const payload = {
      kind,
      requestKey: requestKey.current,
      productId: productId || null,
      productName,
      customerName: String(formData.get("name") || "").trim(),
      customerPhone: String(formData.get("phone") || "").trim(),
      colorPreference: kind === "restock" ? "" : color.trim(),
      customization: kind === "restock" ? `Solicita un aviso único cuando vuelva a estar disponible ${productName}.` : details.trim(),
      website: String(formData.get("website") || ""),
      marketingConsent: formData.get("marketingConsent") === "on",
      restockConsent: kind === "restock" && formData.get("restockConsent") === "on",
      turnstileToken,
    };
    const message = ["Hola Liira", `Me interesa: ${productName}`, payload.colorPreference && `Color: ${payload.colorPreference}`, kind === "standard" && payload.customization && `Detalles: ${payload.customization}`, `Mi nombre: ${payload.customerName}`].filter(Boolean).join("\n");
    const popup = kind === "standard" ? window.open("about:blank", "_blank") : null;
    try {
      const response = await fetch("/api/inquiries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "No pudimos registrar tu solicitud. Intenta de nuevo.");
      setComplete(true);
      if (kind === "restock") setNotice("Registramos tu solicitud. Liira revisará la disponibilidad y te escribirá sobre esta pieza cuando corresponda.");
      else {
        const whatsapp = `https://wa.me/${siteConfig.whatsapp}?text=${encodeURIComponent(message)}`;
        if (popup) popup.location.href = whatsapp;
        else window.location.href = whatsapp;
      }
    } catch (cause) {
      popup?.close();
      setError(cause instanceof Error ? cause.message : "No pudimos registrar tu solicitud. Intenta de nuevo.");
    } finally {
      setTurnstileToken("");
      setResetKey((value) => value + 1);
      setPending(false);
    }
  }

  return (
    <form action={submit} className={compact ? "inquiry-form compact" : "inquiry-form"}>
      {kind === "restock" && <p className="form-intro">Déjanos un contacto para revisar esta pieza contigo. No enviaremos promociones por esta solicitud.</p>}
      <div className="honeypot" aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <div className="form-grid two">
        <label>Tu nombre <input name="name" placeholder="¿Cómo te llamas?" minLength={2} maxLength={80} autoComplete="name" required /></label>
        <label>WhatsApp <input name="phone" type="tel" inputMode="tel" placeholder="Ej. 300 123 4567" minLength={7} maxLength={30} autoComplete="tel" required /></label>
      </div>
      {kind === "standard" && <>
        <label>Color que imaginas <input name="color" value={color} onChange={(event) => setColor(event.target.value)} placeholder="Ej. vino, marfil, verde esmeralda…" maxLength={80} /></label>
        <label>Cuéntanos cómo la quieres <textarea name="details" value={details} onChange={(event) => setDetails(event.target.value)} rows={compact ? 3 : 4} placeholder="Tipo de pieza, ocasión, dijes o combinación de colores" minLength={4} maxLength={600} required /></label>
        {personalized && <div className="draft-actions"><button type="button" onClick={saveDraft}>Guardar mi diseño</button><button type="button" onClick={shareDraft}>Recibir mi diseño por WhatsApp</button><button type="button" onClick={clearDraft}>Borrar diseño</button></div>}
      </>}
      {kind === "restock" && <label className="inquiry-opt-in"><input type="checkbox" name="restockConsent" required /><span>Autorizo a Liira a escribirme por WhatsApp una vez sobre la disponibilidad de {productName}. Puedo pedir que eliminen mi solicitud.</span></label>}
      <label className="inquiry-opt-in"><input type="checkbox" name="marketingConsent" /><span>{marketingConsentText}</span></label>
      <TurnstileWidget onToken={onToken} resetKey={resetKey} />
      <button className="button primary wide" disabled={pending || complete || !turnstileToken} type="submit">
        {pending ? "Registrando solicitud…" : complete ? "Solicitud registrada" : kind === "restock" ? "Avísame cuando esté disponible" : <><MessageCircle size={18} /> Continuar en WhatsApp <Send size={15} /></>}
      </button>
      <p className="form-note">{kind === "restock" ? "No es una reserva ni garantiza nueva existencia. Sin mensajes promocionales salvo autorización aparte." : "Tu solicitud queda registrada para darte seguimiento. No es un pago ni confirma disponibilidad."}</p>
      {notice && <p className="form-success" role="status">{notice}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>
  );
}
