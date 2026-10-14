import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export const metadata: Metadata = { title: "Nosotros", description: "Conoce la historia de Liira, accesorios hechos a mano desde Bucaramanga desde junio de 2026." };

export default function AboutPage() {
  return (
    <div className="about-page about-story-page">
      <section className="about-opening">
        <div className="about-opening-copy">
          <p className="eyebrow">Nuestra historia · Bucaramanga</p>
          <h1>Una marca joven.<br /><em>Una intención que se queda.</em></h1>
          <p className="about-opening-lead">Liira nació en junio de 2026 para convertir color, fe y estilo en piezas que acompañan la vida diaria.</p>
          <div className="about-origin-facts"><span><b>06 · 2026</b>El comienzo</span><span><b>Hecho a mano</b>Cuenta por cuenta</span><span><b>Colombia</b>Envíos nacionales</span></div>
        </div>
        <div className="about-opening-image"><Image src="/media/instagram/cordones-murano.jpg" alt="Cordones de murano Liira en tonos cálidos" fill priority sizes="(max-width: 800px) 100vw, 46vw" /></div>
        <span className="about-opening-year" aria-hidden="true">2026</span>
      </section>

      <section className="about-origin-section">
        <div className="about-origin-index"><span>01</span><p>El origen</p></div>
        <div className="about-origin-copy"><p className="eyebrow">Un detalle puede guardar una historia</p><h2>Nació pequeña.<br />Nació <em>con propósito.</em></h2><p>Empezamos desde Bucaramanga con una idea sencilla: que elegir un accesorio también pueda ser elegir un color, una intención o una forma personal de llevar la fe.</p></div>
        <div className="about-origin-image"><Image src="/media/instagram/entre-tus-manos.jpg" alt="Denario Liira sostenido entre las manos" fill sizes="(max-width: 800px) 100vw, 34vw" /></div>
      </section>

      <section className="about-making">
        <div className="about-making-heading"><p className="eyebrow">Así se siente una Liira</p><h2>No hacemos ruido.<br />Hacemos <em>presencia.</em></h2></div>
        <ol>
          <li><span>01</span><div><strong>El color abre la conversación.</strong><p>Partimos de la combinación que quieres llevar.</p></div></li>
          <li><span>02</span><div><strong>Las manos le dan forma.</strong><p>Cada cuenta se elige, se ordena y se arma con cuidado.</p></div></li>
          <li><span>03</span><div><strong>La intención la vuelve tuya.</strong><p>El resultado acompaña una historia, un estilo o una fe.</p></div></li>
        </ol>
      </section>

      <section className="place-section"><div className="container"><p className="eyebrow">Bucaramanga · Colombia</p><h2>Hecha cerca.<br />Pensada para llegar lejos.</h2><p>Atendemos cada pedido de forma directa y enviamos a todo el país. Antes de confirmar, te contamos disponibilidad, tiempo y valor de envío.</p><Link href="/personaliza" className="button light">Crear una pieza <ArrowRight size={17} /></Link></div></section>
    </div>
  );
}
