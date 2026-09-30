import type { Metadata } from "next";

export const metadata: Metadata = { title: "Términos y condiciones" };

export default function TermsPage() {
  return <article className="legal-content"><p className="eyebrow">Última actualización: septiembre de 2026</p><h1>Términos y condiciones</h1><h2>Sobre el catálogo</h2><p>La disponibilidad puede cambiar. Un mensaje por WhatsApp o un registro en la web no reserva una pieza ni confirma una venta hasta que Liira valide existencias, precio, envío y forma de pago.</p><h2>Precios</h2><p>Los precios visibles se expresan en pesos colombianos. Cuando existe un precio especial, se muestra junto al precio original. El envío se confirma por separado salvo que se indique expresamente lo contrario.</p><h2>Personalización</h2><p>Los colores pueden variar ligeramente entre pantallas y lotes de materiales. Antes de iniciar una pieza personalizada se acuerdan diseño, valor y tiempo estimado.</p><h2>Contenido</h2><p>Las fotografías, textos, identidad y diseños publicados por Liira no pueden reutilizarse con fines comerciales sin autorización.</p><h2>Contacto</h2><p>Las preguntas sobre un pedido o estos términos se atienden por el WhatsApp oficial publicado en esta web.</p></article>;
}
