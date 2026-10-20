import Link from "next/link";
import { ArrowUpRight, Menu } from "lucide-react";
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
            <Link href={item.href} key={item.href} transitionTypes={["liira-signature"]}>{item.label}</Link>
          ))}
        </nav>
        <a className="header-cta" href={whatsappUrl("Hola Liira, quiero conocer sus piezas disponibles.")} target="_blank" rel="noreferrer">
          <span>Hacer un pedido</span><ArrowUpRight size={15} aria-hidden="true" />
        </a>
        <details className="mobile-menu">
          <summary aria-label="Abrir menú"><Menu size={21} /></summary>
          <nav aria-label="Navegación móvil">
            {navigation.map((item) => (
              <Link href={item.href} key={item.href} transitionTypes={["liira-signature"]}>{item.label}</Link>
            ))}
            <a href={whatsappUrl("Hola Liira, quiero conocer sus piezas disponibles.")} target="_blank" rel="noreferrer">Hacer un pedido</a>
          </nav>
        </details>
      </div>
      <div className="shipping-strip"><span>Hecho a mano en Bucaramanga</span><i>✦</i><span>Envíos a toda Colombia</span><i>✦</i><span>Piezas personalizadas</span></div>
    </header>
  );
}
