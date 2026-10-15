export const siteConfig = {
  name: "Liira",
  descriptor: "Accesorios Murano",
  title: "Liira | Accesorios de murano hechos a mano en Bucaramanga",
  description:
    "Maxicollares, denarios y rosarios de mano hechos con murano. Diseños personalizados desde Bucaramanga con envíos a toda Colombia.",
  location: "Bucaramanga, Colombia",
  instagram: "https://www.instagram.com/liira.co/",
  whatsapp: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "573174639218",
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
