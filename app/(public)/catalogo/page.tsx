import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, SlidersHorizontal } from "lucide-react";
import { ProductCard } from "@/components/public/product-card";
import { getCatalog } from "@/lib/data/catalog";

export const metadata: Metadata = {
  title: "Colección",
  description: "Descubre denarios, rosarios de mano y cordones de murano hechos a mano por Liira en Bucaramanga.",
};

export default async function CatalogPage({ searchParams }: { searchParams: Promise<{ categoria?: string }> }) {
  const params = await searchParams;
  const { products, categories, available } = await getCatalog();
  const visible = params.categoria ? products.filter((product) => product.category?.slug === params.categoria) : products;

  return (
    <div className="catalog-page container page-space">
      <header className="page-hero catalog-hero">
        <div><p className="eyebrow">Colección Liira</p><h1>Piezas para llevar<br /><em>tu esencia.</em></h1></div>
        <p>Hechas a mano con murano y detalles elegidos para convertir color, fe y estilo en algo que se siente propio.</p>
      </header>
      <div className="catalog-toolbar">
        <div className="category-pills" aria-label="Filtrar por categoría">
          <Link className={!params.categoria ? "active" : ""} href="/catalogo">Todo</Link>
          {categories.map((category) => <Link className={params.categoria === category.slug ? "active" : ""} href={`/catalogo?categoria=${category.slug}`} key={category.id}>{category.name}</Link>)}
        </div>
        <span className="catalog-count"><SlidersHorizontal size={15} /> {visible.length} {visible.length === 1 ? "pieza" : "piezas"}</span>
      </div>
      {visible.length > 0 ? (
        <div className="product-grid catalog-grid">{visible.map((product) => <ProductCard key={product.id} product={product} />)}</div>
      ) : (
        <div className="empty-catalog">
          <span aria-hidden="true">✦</span>
          <h2>{available ? "La próxima pieza está tomando forma" : "La colección se está preparando"}</h2>
          <p>Mientras actualizamos las piezas disponibles, puedes pedir una combinación hecha en tus colores.</p>
          <Link href="/personaliza" className="button primary">Crear una pieza personalizada <ArrowRight size={17} /></Link>
        </div>
      )}
    </div>
  );
}
