"use client";

import { useState } from "react";
import { MessageCircle, Send } from "lucide-react";
import { siteConfig } from "@/lib/config";

type Props = {
  productId?: string;
  productName?: string;
  compact?: boolean;
};

export function InquiryComposer({ productId, productName = "Pieza personalizada", compact = false }: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(formData: FormData) {
    setPending(true);
    setError("");
    const payload = {
      productId: productId || null,
      productName,
      customerName: String(formData.get("name") || "").trim(),
      customerPhone: String(formData.get("phone") || "").trim(),
      colorPreference: String(formData.get("color") || "").trim(),
      customization: String(formData.get("details") || "").trim(),
      website: String(formData.get("website") || ""),
    };

    const message = [
      "Hola Liira ✨",
      `Me interesa: ${productName}`,
      payload.colorPreference ? `Color: ${payload.colorPreference}` : "",
      payload.customization ? `Detalles: ${payload.customization}` : "",
      payload.customerName ? `Mi nombre: ${payload.customerName}` : "",
    ].filter(Boolean).join("\n");

    const whatsapp = `https://wa.me/${siteConfig.whatsapp}?text=${encodeURIComponent(message)}`;
    const popup = window.open("about:blank", "_blank");

    try {
      const response = await fetch("/api/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok && response.status !== 503) throw new Error("No pudimos registrar la solicitud");
      if (popup) popup.location.href = whatsapp;
      else window.location.href = whatsapp;
    } catch {
      if (popup) popup.location.href = whatsapp;
      else window.location.href = whatsapp;
      setError("Abrimos WhatsApp, pero el registro interno quedó pendiente.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form action={submit} className={compact ? "inquiry-form compact" : "inquiry-form"}>
      <div className="honeypot" aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <div className="form-grid two">
        <label>Tu nombre <input name="name" placeholder="¿Cómo te llamas?" minLength={2} maxLength={80} autoComplete="name" required /></label>
        <label>WhatsApp <input name="phone" type="tel" inputMode="tel" placeholder="Ej. 300 123 4567" minLength={7} maxLength={30} autoComplete="tel" required /></label>
      </div>
      <label>Color que imaginas <input name="color" placeholder="Ej. vino, marfil, verde esmeralda…" maxLength={80} /></label>
      <label>Cuéntanos cómo la quieres <textarea name="details" rows={compact ? 3 : 4} placeholder="Tipo de pieza, ocasión, dijes o combinación de colores" minLength={4} maxLength={600} required /></label>
      <button className="button primary wide" disabled={pending} type="submit">
        {pending ? "Preparando mensaje…" : <><MessageCircle size={18} /> Continuar en WhatsApp <Send size={15} /></>}
      </button>
      <p className="form-note">Tu solicitud queda registrada para darte seguimiento. No es un pago ni confirma disponibilidad.</p>
      {error && <p className="form-error" role="status">{error}</p>}
    </form>
  );
}
