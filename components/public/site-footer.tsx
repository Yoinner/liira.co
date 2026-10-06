import Image from "next/image";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { siteConfig, whatsappUrl } from "@/lib/config";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-art" aria-hidden="true">Liira</div>
      <div className="footer-intro">
        <p>Un detalle puede guardar una historia.</p>
        <a href={whatsappUrl("Hola Liira, quiero crear una pieza especial.")} target="_blank" rel="noreferrer">Hablemos de la tuya <span>↗</span></a>
      </div>
      <div className="footer-grid">
        <div className="footer-brand">
          <Image src="/brand/liira-logo.png" width={112} height={112} alt="Liira Accesorios" />
          <p>Piezas hechas a mano para llevar color, estilo y significado contigo.</p>
        </div>
        <div>
          <p className="footer-label">Explora</p>
          <Link href="/catalogo">Colección</Link>
          <Link href="/personaliza">Diseña la tuya</Link>
          <Link href="/nosotros">Nuestra historia</Link>
        </div>
        <div>
          <p className="footer-label">Información</p>
          <Link href="/politicas/envios-y-cambios">Envíos y cambios</Link>
          <Link href="/politicas/privacidad">Privacidad</Link>
          <Link href="/politicas/terminos">Términos</Link>
        </div>
        <div>
          <p className="footer-label">Hablemos</p>
          <a href={whatsappUrl("Hola Liira, quiero hacer un pedido.")} target="_blank" rel="noreferrer"><MessageCircle size={16} /> WhatsApp</a>
          <a href={siteConfig.instagram} target="_blank" rel="noreferrer"><InstagramMark /> @liira.co</a>
          <p>{siteConfig.location}</p>
        </div>
      </div>
      <div className="footer-bottom">
        <span>© {new Date().getFullYear()} Liira · Bucaramanga</span>
        <span>Creado con intención, pieza por pieza.</span>
      </div>
    </footer>
  );
}

function InstagramMark() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" /></svg>;
}
