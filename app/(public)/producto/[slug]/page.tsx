import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Check, Package, Sparkles } from "lucide-react";
import { notFound } from "next/navigation";
import { InquiryComposer } from "@/components/public/inquiry-composer";
import { SignatureTransition } from "@/components/public/signature-transition";
import { formatCop, siteConfig } from "@/lib/config";
import { getProductBySlug } from "@/lib/data/catalog";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  return product ? { title: product.name, description: product.description || `${product.name}, hecho a mano por Liira.` } : { title: "Pieza no encontrada" };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();
  const lowStock = product.stock > 0 && product.stock < 5;

  return (
    <SignatureTransition><div className="product-detail container page-space">
      <Link href="/catalogo" className="back-link"><ArrowLeft size={16} /> Volver a la colección</Link>
      <div className="product-detail-grid">
        <div className="product-gallery">
          {product.images.length ? product.images.map((image, index) => (
            <div className={index === 0 ? "detail-image main" : "detail-image"} key={image.id}><Image src={image.url} alt={image.alt || product.name} fill priority={index === 0} sizes="(max-width: 800px) 100vw, 50vw" /></div>
          )) : <div className="detail-image main product-placeholder">Liira</div>}
        </div>
        <div className="product-info">
          <p className="eyebrow">{product.category?.name || "Colección Liira"}</p>
          <h1>{product.name}</h1>
          <div className="detail-price">{product.sale_price ? <><del>{formatCop(product.price)}</del><strong>{formatCop(product.sale_price)}</strong><span>Precio especial</span></> : <strong>{formatCop(product.price)}</strong>}</div>
          {product.description && <p className="product-description">{product.description}</p>}
          <div className={`availability ${product.stock === 0 ? "unavailable" : ""}`}>
            {product.stock === 0 ? "Agotado por ahora" : lowStock ? `Solo quedan ${product.stock}` : "Disponible para pedir"}
          </div>
          {product.stock > 0 ? <InquiryComposer productId={product.id} productName={product.name} compact /> : <div className="restock-options"><InquiryComposer productId={product.id} productName={product.name} kind="restock" compact /><a href={`https://wa.me/${siteConfig.whatsapp}?text=${encodeURIComponent(`Hola, vi ${product.name} en Liira. Está agotado; ¿podrían ayudarme con una alternativa o una pieza personalizada?`)}`} target="_blank" rel="noopener noreferrer" className="restock-alternative">¿Prefieres una alternativa? Hablemos por WhatsApp</a></div>}
          <div className="detail-assurances">
            <div><Sparkles size={19} /><span><strong>Hecha a mano</strong><small>En Bucaramanga</small></span></div>
            <div><Package size={19} /><span><strong>Envíos nacionales</strong><small>Valor y tiempo por confirmar</small></span></div>
            <div><Check size={19} /><span><strong>Atención directa</strong><small>Confirmamos cada detalle contigo</small></span></div>
          </div>
        </div>
      </div>
    </div></SignatureTransition>
  );
}
