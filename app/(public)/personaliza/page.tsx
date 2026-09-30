import type { Metadata } from "next";
import Image from "next/image";
import { InquiryComposer } from "@/components/public/inquiry-composer";

export const metadata: Metadata = {
  title: "Personaliza tu pieza",
  description: "Crea con Liira una pieza de murano en los colores y detalles que imaginas.",
};

export default function PersonalizePage() {
  return (
    <div className="personalize-page page-space">
      <section className="personalize-grid container">
        <div className="personalize-copy">
          <p className="eyebrow">Atelier Liira</p>
          <h1>Una idea tuya.<br /><em>Una pieza irrepetible.</em></h1>
          <p>Cuéntanos qué quieres crear: un cordón que transforme un look, un denario para acompañarte o un detalle con un significado especial.</p>
          <div className="color-notes"><span>Vino</span><span>Marfil</span><span>Ámbar</span><span>Esmeralda</span><span>Tu color</span></div>
        </div>
        <div className="personalize-image"><Image src="/media/instagram/denarios-luz.jpg" alt="Denarios Liira en diferentes combinaciones de color" fill priority sizes="(max-width: 800px) 100vw, 50vw" /></div>
      </section>
      <section className="personalize-form-section">
        <div className="container form-layout">
          <div><p className="eyebrow">Empecemos</p><h2>Describe la pieza que imaginas</h2><p>No necesitas saber de materiales. Cuéntanos la ocasión, los colores y lo que quieres sentir cuando la uses.</p></div>
          <InquiryComposer />
        </div>
      </section>
    </div>
  );
}
