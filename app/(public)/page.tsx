import Image from "next/image";
import Link from "next/link";
import { ArrowDownRight, ArrowRight, Gem, Heart, MapPin, PackageCheck, Sparkles } from "lucide-react";
import { MuranoThreadStage } from "@/components/public/murano-thread-stage";
import { ProductCard } from "@/components/public/product-card";
import { getCatalog } from "@/lib/data/catalog";

const categoryFallbacks: Record<string, { src: string; copy: string }> = {
  "cordones-murano": { src: "/media/instagram/cordones-murano.jpg", copy: "Color que transforma" },
  denarios: { src: "/media/categories/denarios.jpg", copy: "Fe que acompaña" },
  "rosarios-de-mano": { src: "/media/categories/rosarios-de-mano.jpg", copy: "Luz y significado" },
};

const fallbackCategories = [
  { id: "denarios", name: "Denarios", slug: "denarios", description: "Fe que acompaña", image_url: "/media/categories/denarios.jpg" },
  { id: "cordones", name: "Cordones Murano", slug: "cordones-murano", description: "Color que transforma", image_url: "/media/instagram/cordones-murano.jpg" },
  { id: "rosarios", name: "Rosarios de mano", slug: "rosarios-de-mano", description: "Luz y significado", image_url: "/media/categories/rosarios-de-mano.jpg" },
];

export default async function HomePage() {
  const { products, categories } = await getCatalog();
  const featured = products.filter((product) => product.featured).slice(0, 4);
  const inspirations = (categories.length ? categories : fallbackCategories).slice(0, 3).map((category) => {
    const fallback = categoryFallbacks[category.slug] || categoryFallbacks["cordones-murano"];
    return {
      src: category.image_url || fallback.src,
      title: category.name,
      copy: category.description
        ? `${category.description.slice(0, 52)}${category.description.length > 52 ? "…" : ""}`
        : fallback.copy,
      slug: category.slug,
    };
  });

  return (
    <>
      <section className="hero thread-hero">
        <div className="hero-copy">
          <p className="eyebrow"><span /> Accesorios en murano · Bucaramanga</p>
          <h1><span>Tu color.</span><span>Tu intención.</span><em>Tu Liira.</em></h1>
          <p className="hero-lead">Cordones, denarios y rosarios de mano compuestos cuenta por cuenta. Explora una pieza disponible o empieza una combinación creada contigo.</p>
          <div className="hero-actions">
            <Link href="/personaliza" className="button thread-primary">Crear mi combinación <ArrowRight size={17} /></Link>
            <Link href="/catalogo" className="thread-text-link">Ver piezas disponibles <ArrowDownRight size={17} /></Link>
          </div>
          <div className="thread-proof" aria-label="Datos de Liira">
            <p><span>01</span><strong>Hecha a mano</strong> cada cuenta tiene un lugar</p>
            <p><span>02</span><strong>Envíos nacionales</strong> desde Bucaramanga</p>
          </div>
        </div>
        <MuranoThreadStage />
        <div className="thread-hero-foot"><span>Desde junio de 2026</span><span><MapPin size={13} /> Bucaramanga · Colombia</span><span>Desliza para descubrir</span></div>
      </section>

      <section className="promise-band" aria-label="Promesa Liira">
        <p>Murano que captura la luz.</p><span>✦</span><p>Detalles que guardan intención.</p><span>✦</span><p>Color elegido por ti.</p>
      </section>

      <section className="editorial-section container">
        <p className="section-number" aria-hidden="true">01 / Tres formas de sentir Liira</p>
        <div className="section-heading split-heading">
          <div><p className="eyebrow">Colecciones con significado</p><h2>Encuentra la pieza<br />que se siente <em>tuya.</em></h2></div>
          <p>Cada colección tiene una energía distinta: presencia, fe o compañía. Entra por lo que buscas y personaliza después los colores.</p>
        </div>
        <div className="inspiration-grid">
          {inspirations.map((item, index) => (
            <Link href={`/catalogo?categoria=${item.slug}`} className={`inspiration-card card-${index + 1}`} key={item.slug}>
              <Image src={item.src} alt={`${item.title} hechos a mano por Liira`} fill sizes="(max-width: 700px) 90vw, 33vw" />
              <div className="inspiration-overlay"><span>0{index + 1}</span><div><p>{item.copy}</p><h3>{item.title}</h3></div><ArrowRight size={20} /></div>
            </Link>
          ))}
        </div>
      </section>

      {featured.length > 0 && (
        <section className="collection-section">
          <div className="container">
            <p className="section-number" aria-hidden="true">02 / Piezas disponibles</p>
            <div className="section-heading inline-heading"><div><p className="eyebrow">Listas para acompañarte</p><h2>Pequeñas piezas.<br />Gran presencia.</h2></div><Link href="/catalogo" className="text-link">Ver toda la colección <ArrowRight size={16} /></Link></div>
            <div className="product-grid">{featured.map((product) => <ProductCard product={product} key={product.id} />)}</div>
          </div>
        </section>
      )}

      <section className="custom-story">
        <div className="custom-image">
          <Image src="/media/instagram/coleccion-denarios.jpg" alt="Colección de denarios Liira elaborados a mano" fill sizes="(max-width: 800px) 100vw, 52vw" />
          <div className="sun-stamp" aria-hidden="true"><Sparkles /><span>Tu idea<br />Tu color<br />Tu Liira</span></div>
        </div>
        <div className="custom-copy">
          <p className="section-number light-number" aria-hidden="true">03 / Atelier de color</p>
          <p className="eyebrow">Una pieza creada contigo</p>
          <h2>Imagínala.<br /><em>Nosotras la armamos.</em></h2>
          <p>No tienes que saber de materiales. Cuéntanos el color, la ocasión o el significado y convertimos esa idea en una combinación hecha para ti.</p>
          <ol>
            <li><span>01</span><div><strong>Comparte tu intención</strong><p>Color, ocasión, referencia o significado.</p></div></li>
            <li><span>02</span><div><strong>Elegimos la combinación</strong><p>Confirmamos diseño, valor y tiempo contigo.</p></div></li>
            <li><span>03</span><div><strong>La hacemos realidad</strong><p>Armada a mano y enviada desde Bucaramanga.</p></div></li>
          </ol>
          <Link href="/personaliza" className="button light">Empezar mi pieza <ArrowRight size={17} /></Link>
        </div>
      </section>

      <section className="values-section container">
        <p className="section-number" aria-hidden="true">04 / Lo que hace distinta una Liira</p>
        <div className="values-intro"><p className="eyebrow">Nuestro sello</p><h2>No fabricamos en serie.<br />Componemos <em>con intención.</em></h2></div>
        <div className="values-grid">
          <article><Gem /><span>01</span><h3>Color con carácter</h3><p>El murano, la luz y tu estilo se encuentran en combinaciones que se sienten vivas.</p></article>
          <article><Heart /><span>02</span><h3>Hecho por manos</h3><p>Cada cuenta se elige y se arma una a una, con tiempo y atención al detalle.</p></article>
          <article><PackageCheck /><span>03</span><h3>Cerca de ti</h3><p>Atención directa desde Bucaramanga y envíos coordinados a toda Colombia.</p></article>
        </div>
      </section>

      <section className="final-cta">
        <div><p className="eyebrow">Tu próxima pieza empieza aquí</p><h2>¿Qué quieres llevar contigo?</h2></div>
        <div><p>Explora lo disponible o cuéntanos la combinación que imaginas. Te respondemos por WhatsApp para confirmar cada detalle.</p><div className="final-actions"><Link href="/catalogo" className="button primary">Ver colección</Link><Link href="/personaliza" className="text-link">Quiero personalizar <ArrowRight size={17} /></Link></div></div>
      </section>
    </>
  );
}
