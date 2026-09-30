import Link from "next/link";
import { Menu, Sparkles } from "lucide-react";
import { navigation, whatsappUrl } from "@/lib/config";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link href="/" className="wordmark" aria-label="Liira, inicio">
          Liira<span>Accesorios</span>
        </Link>
        <nav className="desktop-nav" aria-label="Navegación principal">
          {navigation.map((item) => (
            <Link href={item.href} key={item.href}>{item.label}</Link>
          ))}
        </nav>
        <a className="header-cta" href={whatsappUrl("Hola Liira, quiero conocer sus piezas disponibles.")} target="_blank" rel="noreferrer">
          <Sparkles size={15} aria-hidden="true" /> Hacer un pedido
        </a>
        <details className="mobile-menu">
          <summary aria-label="Abrir menú"><Menu size={21} /></summary>
          <nav aria-label="Navegación móvil">
            {navigation.map((item) => (
              <Link href={item.href} key={item.href}>{item.label}</Link>
            ))}
            <a href={whatsappUrl("Hola Liira, quiero conocer sus piezas disponibles.")} target="_blank" rel="noreferrer">Hacer un pedido</a>
          </nav>
        </details>
      </div>
      <div className="shipping-strip">Hecho a mano en Bucaramanga <span>✦</span> Envíos a toda Colombia</div>
    </header>
  );
}
