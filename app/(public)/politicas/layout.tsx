import Link from "next/link";

export default function PoliciesLayout({ children }: { children: React.ReactNode }) {
  return <div className="legal-shell container page-space"><aside><p className="eyebrow">Información clara</p><nav><Link href="/politicas/envios-y-cambios">Envíos y cambios</Link><Link href="/politicas/privacidad">Privacidad</Link><Link href="/politicas/terminos">Términos</Link></nav></aside>{children}</div>;
}
