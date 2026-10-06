import Link from "next/link";
import { Boxes, ChartNoAxesCombined, Eye, FolderTree, Gauge, LogOut, MessageSquareText, Sparkles } from "lucide-react";
import { logoutAction } from "@/app/admin/actions";
import { requireAdmin } from "@/lib/auth/session";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();
  const technical = session.role === "technical";
  const today = new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Bogota" }).format(new Date());
  return <div className="admin-shell">
    <aside className="admin-sidebar">
      <div>
        <Link href={technical ? "/admin/tecnico" : "/admin"} className="admin-wordmark">Liira<span>{technical ? "Mission Control" : "Studio Admin"}</span></Link>
        <div className="admin-profile"><span><Sparkles size={15} /></span><div><strong>{technical ? "Acceso técnico" : "Equipo Liira"}</strong><small>{technical ? "Superadministrador" : "Operación comercial"}</small></div></div>
        <p className="admin-nav-label">Espacio de trabajo</p>
        <nav><Link href="/admin"><ChartNoAxesCombined /> Resumen</Link><Link href="/admin/productos"><Boxes /> Productos</Link><Link href="/admin/categorias"><FolderTree /> Categorías</Link><Link href="/admin/solicitudes"><MessageSquareText /> Solicitudes</Link>{technical && <Link href="/admin/tecnico"><Gauge /> Estado técnico</Link>}</nav>
      </div>
      <form action={logoutAction}><button><LogOut /> Cerrar sesión</button></form>
    </aside>
    <div className="admin-main"><header className="admin-topbar"><div><span className="status-dot" /><span><strong>{technical ? "Sistema operativo" : "Operación activa"}</strong><small>{today}</small></span></div><Link href="/" target="_blank"><Eye size={15} /> Ver tienda</Link></header>{children}</div>
  </div>;
}
