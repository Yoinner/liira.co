"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type Item = { src: string | null; title: string; copy: string; slug: string };

export function CategoryCarousel({ items }: { items: Item[] }) {
  const rail = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(0);
  const [edges, setEdges] = useState({ start: true, end: true });

  function move(direction: -1 | 1) {
    const first = rail.current?.firstElementChild as HTMLElement | null;
    const second = rail.current?.children[1] as HTMLElement | undefined;
    const step = first && second ? second.offsetLeft - first.offsetLeft : first?.offsetWidth || 1;
    rail.current?.scrollBy({ left: step * direction, behavior: "smooth" });
  }

  const syncPosition = useCallback(() => {
    if (!rail.current) return;
    const first = rail.current.firstElementChild as HTMLElement | null;
    const second = rail.current.children[1] as HTMLElement | undefined;
    const step = first && second ? second.offsetLeft - first.offsetLeft : first?.offsetWidth || 1;
    const start = rail.current.scrollLeft < 3;
    const end = rail.current.scrollWidth - rail.current.clientWidth - rail.current.scrollLeft < 3;
    setCurrent(end && !start ? items.length - 1 : Math.min(items.length - 1, Math.max(0, Math.round(rail.current.scrollLeft / step))));
    setEdges({ start, end });
  }, [items.length]);

  useEffect(() => {
    const observer = new ResizeObserver(syncPosition);
    if (rail.current) observer.observe(rail.current);
    syncPosition();
    return () => observer.disconnect();
  }, [syncPosition]);

  if (!items.length) return <p className="category-carousel-empty">Pronto encontrarás nuevas colecciones aquí.</p>;

  return <div className="category-carousel" aria-label="Colecciones Liira">
    <div className="category-carousel-top"><p>Explora a tu ritmo <span aria-hidden="true">↗</span></p><div className="category-carousel-controls">
      <span aria-live="polite">{String(current + 1).padStart(2, "0")} <i>/</i> {String(items.length).padStart(2, "0")}</span>
      <button type="button" aria-label="Colección anterior" onClick={() => move(-1)} disabled={edges.start}><ArrowLeft size={18} /></button>
      <button type="button" aria-label="Colección siguiente" onClick={() => move(1)} disabled={edges.end}><ArrowRight size={18} /></button>
    </div></div>
    <div className="category-carousel-rail" ref={rail} onScroll={syncPosition} tabIndex={0} aria-label="Desliza las colecciones horizontalmente">
      {items.map((item, index) => <Link href={`/catalogo?categoria=${encodeURIComponent(item.slug)}`} className={`inspiration-card category-carousel-card ${item.src ? "" : "category-carousel-card--typographic"}`} key={item.slug}>
        {item.src ? <Image src={item.src} alt={`${item.title} hechos a mano por Liira`} fill sizes="(max-width: 640px) 82vw, (max-width: 1100px) 42vw, 36vw" /> : <span className="category-carousel-monogram" aria-hidden="true">L</span>}
        <div className="inspiration-overlay"><span>{String(index + 1).padStart(2, "0")}</span><div><p>{item.copy}</p><h3>{item.title}</h3></div><ArrowRight size={20} /></div>
      </Link>)}
    </div>
  </div>;
}
