import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export const metadata: Metadata = { title: "Nosotros", description: "Conoce la historia de Liira, accesorios hechos a mano desde Bucaramanga desde junio de 2026." };

export default function AboutPage() {
  return (
    <div className="about-page page-space">
      <section className="about-hero container">
        <div><p className="eyebrow">Nuestra historia · Desde junio de 2026</p><h1>Lo que empezó como un sueño,<br />{" "}<em>hoy se lleva puesto.</em></h1></div>
        <p>Liira nació en Bucaramanga del amor por los detalles y de una certeza: una pieza puede decir quién eres, acompañar tu fe y transformar cómo te sientes.</p>
      </section>
      <section className="about-mosaic container">
        <div className="about-image tall"><Image src="/media/instagram/cordones-murano.jpg" alt="Cordones de murano Liira en tonos cálidos" fill sizes="(max-width: 800px) 100vw, 55vw" /></div>
        <div className="about-note"><span>Liira</span><p>Brillo que encuentra significado.</p></div>
        <div className="about-image"><Image src="/media/instagram/entre-tus-manos.jpg" alt="Denario Liira entre las manos" fill sizes="(max-width: 800px) 100vw, 35vw" /></div>
      </section>
      <section className="manifesto container">
        <p className="manifesto-index">01 — Manifiesto</p>
        <div><h2>Creemos en piezas que no solo combinan con la ropa, sino con la vida.</h2><p>Por eso cada Liira se arma a mano, se piensa desde el color y se termina con cuidado. Diseñamos para quienes encuentran belleza en un detalle y significado en lo que eligen llevar.</p><Link href="/personaliza" className="button primary">Crea la tuya <ArrowRight size={17} /></Link></div>
      </section>
      <section className="place-section"><div className="container"><p className="eyebrow">Bucaramanga · Colombia</p><h2>Hecha cerca.<br />Pensada para llegar lejos.</h2><p>Atendemos cada pedido de forma directa y enviamos a todo el país. Antes de confirmar, te contamos disponibilidad, tiempo y valor de envío.</p></div></section>
    </div>
  );
}
