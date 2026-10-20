"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BarChart3, Boxes, ChartNoAxesCombined, CreditCard, FolderTree, Gauge, Menu, MessageCircleMore, MessageSquareText, Search, UsersRound, X } from "lucide-react";

const items = [
  { href: "/admin", label: "Resumen", icon: ChartNoAxesCombined, exact: true },
  { href: "/admin/solicitudes", label: "Pipeline", icon: MessageSquareText },
  { href: "/admin/conversaciones", label: "WhatsApp", icon: MessageCircleMore },
  { href: "/admin/pagos", label: "Pagos manuales", icon: CreditCard },
  { href: "/admin/clientes", label: "Clientes", icon: UsersRound },
  { href: "/admin/productos", label: "Productos", icon: Boxes },
  { href: "/admin/categorias", label: "Categorías", icon: FolderTree },
  { href: "/admin/analitica", label: "Analítica", icon: BarChart3 },
];

export function AdminNav({ technical }: { technical: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  return <div className={`admin-navigation ${open ? "is-open" : ""}`}>
    <button type="button" className="admin-nav-toggle" aria-expanded={open} aria-controls="admin-navigation-links" aria-label={open ? "Cerrar menú" : "Abrir menú"} onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}<span>Menú</span></button>
    <nav id="admin-navigation-links" aria-label="Navegación administrativa" onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}>
    {items.map(({ href, label, icon: Icon, exact }) => {
      const active = exact ? pathname === href : pathname.startsWith(href);
      return <Link key={href} href={href} onClick={() => setOpen(false)} aria-current={active ? "page" : undefined} className={active ? "active" : undefined}><Icon /> {label}</Link>;
    })}
    {technical && <Link href="/admin/tecnico" onClick={() => setOpen(false)} aria-current={pathname.startsWith("/admin/tecnico") ? "page" : undefined} className={pathname.startsWith("/admin/tecnico") ? "active" : undefined}><Gauge /> Mission Control</Link>}
    <Link href="/admin/buscar" onClick={() => setOpen(false)} aria-current={pathname.startsWith("/admin/buscar") ? "page" : undefined} className="admin-nav-search"><Search /> Buscar</Link>
    </nav>
  </div>;
}
