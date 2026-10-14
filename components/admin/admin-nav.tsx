"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Boxes, ChartNoAxesCombined, FolderTree, Gauge, MessageSquareText, Search, UsersRound } from "lucide-react";

const items = [
  { href: "/admin", label: "Resumen", icon: ChartNoAxesCombined, exact: true },
  { href: "/admin/solicitudes", label: "Pipeline", icon: MessageSquareText },
  { href: "/admin/clientes", label: "Clientes", icon: UsersRound },
  { href: "/admin/productos", label: "Productos", icon: Boxes },
  { href: "/admin/categorias", label: "Categorías", icon: FolderTree },
  { href: "/admin/analitica", label: "Analítica", icon: BarChart3 },
];

export function AdminNav({ technical }: { technical: boolean }) {
  const pathname = usePathname();
  return <nav aria-label="Navegación administrativa">
    {items.map(({ href, label, icon: Icon, exact }) => {
      const active = exact ? pathname === href : pathname.startsWith(href);
      return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={active ? "active" : undefined}><Icon /> {label}</Link>;
    })}
    {technical && <Link href="/admin/tecnico" aria-current={pathname.startsWith("/admin/tecnico") ? "page" : undefined} className={pathname.startsWith("/admin/tecnico") ? "active" : undefined}><Gauge /> Mission Control</Link>}
    <Link href="/admin/buscar" aria-current={pathname.startsWith("/admin/buscar") ? "page" : undefined} className="admin-nav-search"><Search /> Buscar</Link>
  </nav>;
}
