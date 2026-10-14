"use client";

import { useState, type CSSProperties } from "react";
import Image from "next/image";

const palettes = [
  { id: "ambar", label: "Ámbar", note: "calidez", color: "#d68b43", glow: "#f7c078", image: "/media/instagram/denario-ambar.jpg", alt: "Denario Liira de murano ámbar sobre la muñeca" },
  { id: "celeste", label: "Celeste", note: "calma", color: "#9cc9d2", glow: "#dff4f4", image: "/media/instagram/denario-celeste.jpg", alt: "Denario Liira de murano celeste sobre la muñeca" },
  { id: "marfil", label: "Marfil", note: "serenidad", color: "#e8c5a5", glow: "#fff0db", image: "/media/instagram/denario-marfil.jpg", alt: "Denario Liira de murano marfil sobre la muñeca" },
] as const;

export function MuranoThreadStage() {
  const [active, setActive] = useState(0);
  const palette = palettes[active];
  const style = { "--thread-color": palette.color, "--thread-glow": palette.glow } as CSSProperties;

  return (
    <div
      className="thread-stage"
      style={style}
      onPointerMove={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        event.currentTarget.style.setProperty("--pointer-x", `${((event.clientX - bounds.left) / bounds.width) * 100}%`);
        event.currentTarget.style.setProperty("--pointer-y", `${((event.clientY - bounds.top) / bounds.height) * 100}%`);
      }}
      onPointerLeave={(event) => {
        event.currentTarget.style.setProperty("--pointer-x", "62%");
        event.currentTarget.style.setProperty("--pointer-y", "28%");
      }}
    >
      <div className="thread-stage-label" aria-hidden="true"><span>Atelier de color</span><b>01</b></div>
      <div className="thread-frame">
        <Image key={palette.id} className="thread-product" src={palette.image} alt={palette.alt} fill priority sizes="(max-width: 800px) 88vw, 42vw" />
        <span className="thread-refraction" aria-hidden="true" />
        <svg className="thread-strand" viewBox="0 0 620 760" aria-hidden="true">
          <path d="M-30 178 C 125 35, 296 44, 360 198 S 440 470, 655 402" />
          {[72, 122, 174, 228, 284, 341, 399, 456, 513, 567].map((x, index) => (
            <circle key={x} cx={x} cy={118 + Math.sin(index * .75) * 44 + index * 17} r={index % 3 === 0 ? 15 : 11} />
          ))}
        </svg>
        <div className="thread-frame-copy"><span>Denario · {palette.label}</span><strong>La luz cambia<br />con cada color.</strong></div>
      </div>
      <div className="thread-palette" role="tablist" aria-label="Explora tres combinaciones reales de Liira">
        {palettes.map((item, index) => (
          <button key={item.id} type="button" role="tab" aria-label={`${item.label}: ${item.note}`} aria-selected={active === index} onClick={() => setActive(index)}>
            <i style={{ background: item.color }} aria-hidden="true" />
            <span><b>{item.label}</b><small>{item.note}</small></span>
          </button>
        ))}
      </div>
      <p className="thread-stage-hint">Toca un color</p>
    </div>
  );
}
