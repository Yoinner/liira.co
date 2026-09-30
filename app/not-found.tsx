import Link from "next/link";

export default function NotFound() {
  return <main className="not-found"><span>✦</span><p className="eyebrow">404</p><h1>Esta pieza no está aquí.</h1><p>Puede haberse agotado o cambiado de colección.</p><Link className="button primary" href="/catalogo">Volver a la colección</Link></main>;
}
