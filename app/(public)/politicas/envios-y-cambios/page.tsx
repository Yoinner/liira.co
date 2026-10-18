import type { Metadata } from "next";
import { shippingPolicy } from "@/lib/config";

export const metadata: Metadata = { title: "Envíos y cambios" };

export default function ShippingPolicyPage() {
  return <article className="legal-content"><p className="eyebrow">Última actualización: septiembre de 2026</p><h1>Envíos y cambios</h1><h2>Cobertura</h2><p>{shippingPolicy.coverage}</p><h2>Piezas disponibles y personalizadas</h2><p>{shippingPolicy.custom}</p><h2>Revisión del pedido</h2><p>{shippingPolicy.review}</p><h2>Cambios</h2><p>{shippingPolicy.changes}</p><h2>Información pendiente de confirmación comercial</h2><p>{shippingPolicy.pending}</p></article>;
}
