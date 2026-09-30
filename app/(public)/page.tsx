import Image from "next/image";
import Link from "next/link";
import { ArrowDownRight, ArrowRight, Gem, Heart, MapPin, PackageCheck, Sparkles } from "lucide-react";
import { ProductCard } from "@/components/public/product-card";
import { getCatalog } from "@/lib/data/catalog";

const inspirations = [
  { src: "/media/instagram/denario-ambar.jpg", title: "Denarios", copy: "Fe que acompaña" },
  { src: "/media/instagram/cordon-esmeralda.jpg", title: "Cordones Murano", copy: "Color que transforma" },
  { src: "/media/instagram/denario-marfil.jpg", title: "Rosarios de mano", copy: "Luz y significado" },
];

export default async function HomePage() {
  const { products } = await getCatalog();
  const featured = products.filter((product) => product.featured).slice(0, 4);

  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow"><span /> Accesorios hechos a mano · Bucaramanga</p>
          <h1>Tu historia,<br /><em>hecha luz.</em></h1>
          <p className="hero-lead">Cordones de murano, denarios y piezas que hablan de ti. Cada combinación nace a mano y puede hacerse en tus colores.</p>
          <div className="hero-actions">
            <Link href="/catalogo" className="button primary">Explorar la colección <ArrowRight size={17} /></Link>
            <Link href="/personaliza" className="text-link">Crear una pieza <ArrowDownRight size={17} /></Link>
          </div>
          <div className="hero-proof">
            <div><Sparkles size={17} /><span><strong>Hecho a mano</strong> pieza por pieza</span></div>
            <div><MapPin size={17} /><span><strong>Desde Bucaramanga</strong> para Colombia</span></div>
          </div>
        </div>
        <div className="hero-visual">
          <div className="hero-orbit" aria-hidden="true"><span /><span /><span /></div>
          <Image src="/media/instagram/cordon-esmeralda.jpg" alt="Cordón verde de murano Liira, usado de tres formas" fill priority loading="eager" sizes="(max-width: 800px) 100vw, 54vw" />
          <div className="hero-caption"><span>01</span><p>Una pieza.<br />Muchas formas de llevarla.</p></div>
        </div>
      </section>

      <section className="promise-band" aria-label="Promesa Liira">
        <p>Murano que captura la luz.</p><span>✦</span><p>Detalles que guardan intención.</p><span>✦</span><p>Color elegido por ti.</p>
      </section>

      <section className="editorial-section container">
        <div className="section-heading split-heading">
          <div><p className="eyebrow">Elige lo que quieres llevar contigo</p><h2>Más que un accesorio,<br /><em>un pequeño ritual.</em></h2></div>
          <p>Diseños versátiles que unen brillo, color y significado. Piezas para elevar un look, regalar intención o recordar lo esencial.</p>
        </div>
        <div className="inspiration-grid">
          {inspirations.map((item, index) => (
            <Link href="/catalogo" className={`inspiration-card card-${index + 1}`} key={item.title}>
              <Image src={item.src} alt={`${item.title} hechos a mano por Liira`} fill sizes="(max-width: 700px) 90vw, 33vw" />
              <div className="inspiration-overlay"><span>0{index + 1}</span><div><p>{item.copy}</p><h3>{item.title}</h3></div><ArrowRight size={20} /></div>
            </Link>
          ))}
        </div>
      </section>

      {featured.length > 0 && (
        <section className="collection-section">
          <div className="container">
            <div className="section-heading inline-heading"><div><p className="eyebrow">Disponibles ahora</p><h2>Piezas para encontrarte</h2></div><Link href="/catalogo" className="text-link">Ver toda la colección <ArrowRight size={16} /></Link></div>
            <div className="product-grid">{featured.map((product) => <ProductCard product={product} key={product.id} />)}</div>
          </div>
        </section>
      )}

      <section className="custom-story">
        <div className="custom-image">
          <Image src="/media/instagram/coleccion-denarios.jpg" alt="Colección de denarios Liira elaborados a mano" fill sizes="(max-width: 800px) 100vw, 50vw" />
          <div className="sun-stamp" aria-hidden="true"><Sparkles /><span>Tu idea<br />Tu color<br />Tu Liira</span></div>
        </div>
        <div className="custom-copy">
          <p className="eyebrow">Atelier de color</p>
          <h2>Imagínala.<br /><em>Nosotras la hacemos.</em></h2>
          <p>Elige el tipo de pieza, la paleta y los detalles que quieres llevar. Te acompañamos por WhatsApp para convertir tu idea en una combinación única.</p>
          <ol>
            <li><span>01</span><div><strong>Cuéntanos tu idea</strong><p>Color, ocasión, inspiración o significado.</p></div></li>
            <li><span>02</span><div><strong>Definimos los detalles</strong><p>Te confirmamos opciones, valor y tiempo.</p></div></li>
            <li><span>03</span><div><strong>La hacemos para ti</strong><p>Armada a mano en Bucaramanga.</p></div></li>
          </ol>
          <Link href="/personaliza" className="button light">Diseñar mi pieza <ArrowRight size={17} /></Link>
        </div>
      </section>

      <section className="values-section container">
        <div className="values-intro"><p className="eyebrow">El sello Liira</p><h2>Detalles que se sienten<br />antes de explicarse.</h2></div>
        <div className="values-grid">
          <article><Gem /><span>01</span><h3>Brillo con intención</h3><p>Combinaciones pensadas para que el murano dialogue con tu estilo.</p></article>
          <article><Heart /><span>02</span><h3>Hecho por manos</h3><p>Cada pieza se arma una a una, con tiempo, cuidado y atención al detalle.</p></article>
          <article><PackageCheck /><span>03</span><h3>Cerca, estés donde estés</h3><p>Atención directa desde Bucaramanga y envíos a toda Colombia.</p></article>
        </div>
      </section>

      <section className="final-cta">
        <div><p className="eyebrow">Tu próxima pieza empieza aquí</p><h2>¿Qué quieres llevar contigo?</h2></div>
        <div><p>Explora lo disponible o cuéntanos la combinación que imaginas.</p><div className="final-actions"><Link href="/catalogo" className="button primary">Ver colección</Link><Link href="/personaliza" className="text-link">Quiero personalizar <ArrowRight size={17} /></Link></div></div>
      </section>
    </>
  );
}
