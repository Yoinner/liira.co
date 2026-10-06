import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { formatCop } from "@/lib/config";
import type { Product } from "@/lib/types";

export function ProductCard({ product }: { product: Product }) {
  const image = product.images[0];
  const lowStock = product.stock > 0 && product.stock < 5;
  return (
    <article className="product-card">
      <Link href={`/producto/${product.slug}`} className="product-image-wrap">
        {image ? (
          <Image src={image.url} alt={image.alt || product.name} fill sizes="(max-width: 700px) 85vw, 33vw" />
        ) : (
          <div className="product-placeholder">Liira</div>
        )}
        {product.stock === 0 && <span className="stock-badge sold-out">Agotado</span>}
        {lowStock && <span className="stock-badge">Últimas {product.stock}</span>}
        <span className="product-view">Ver pieza <ArrowUpRight size={15} /></span>
      </Link>
      <div className="product-card-body">
        <div>
          <p className="eyebrow">{product.category?.name || "Pieza Liira"}</p>
          <h3><Link href={`/producto/${product.slug}`}>{product.name}</Link></h3>
        </div>
        <Link href={`/producto/${product.slug}`} aria-label={`Ver ${product.name}`}><ArrowUpRight size={19} /></Link>
      </div>
      <div className="price-row">
        {product.sale_price ? <><del>{formatCop(product.price)}</del><strong>{formatCop(product.sale_price)}</strong></> : <strong>{formatCop(product.price)}</strong>}
      </div>
    </article>
  );
}
