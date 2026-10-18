export const siteConfig = {
  name: "Liira",
  descriptor: "Accesorios Murano",
  title: "Liira | Accesorios de murano hechos a mano en Bucaramanga",
  description:
    "Maxicollares, denarios y rosarios de mano hechos con murano. Diseños personalizados desde Bucaramanga con envíos a toda Colombia.",
  location: "Bucaramanga, Colombia",
  instagram: "https://www.instagram.com/liira.co/",
  whatsapp: "573174639218",
  url:
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000"),
  founded: "Junio de 2026",
} as const;

export const navigation = [
  { href: "/", label: "Inicio" },
  { href: "/catalogo", label: "Colección" },
  { href: "/personaliza", label: "Personaliza" },
  { href: "/nosotros", label: "Nosotros" },
] as const;

export const shippingPolicy = {
  coverage: "Liira despacha desde Bucaramanga a destinos en Colombia. La cobertura, el valor y el tiempo estimado se confirman por WhatsApp antes de cerrar cada pedido.",
  custom: "Las piezas disponibles se preparan para despacho una vez confirmado el pedido. Las piezas personalizadas requieren un tiempo de elaboración que se informa antes de recibir el pago.",
  review: "Al recibirlo, revisa el paquete y comunícanos cualquier novedad lo antes posible, incluyendo fotografías del empaque y de la pieza. Cada caso será revisado de forma individual.",
  changes: "Antes de enviar una pieza para cambio, es necesario acordarlo por WhatsApp. Las piezas personalizadas no pueden cambiarse por preferencias de color o diseño una vez aprobadas, salvo que presenten una novedad atribuible a la elaboración.",
  pending: "Los plazos definitivos, transportadora, tarifas, condiciones de retracto y garantía se comunicarán durante el pedido y se actualizarán aquí cuando Liira los formalice.",
} as const;

export function whatsappUrl(message: string) {
  return `https://wa.me/${siteConfig.whatsapp}?text=${encodeURIComponent(message)}`;
}

export function formatCop(value: number | null | undefined) {
  if (value == null) return "Consultar";
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}
