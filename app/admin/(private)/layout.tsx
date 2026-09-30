import Link from "next/link";
import { Boxes, ChartNoAxesCombined, FolderTree, Gauge, LogOut, MessageSquareText } from "lucide-react";
import { logoutAction } from "@/app/admin/actions";
import { requireAdmin } from "@/lib/auth/session";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();
  const technical = session.role === "technical";
  return <div className="admin-shell"><aside className="admin-sidebar"><Link href={technical ? "/admin/tecnico" : "/admin"} className="admin-wordmark">Liira<span>{technical ? "Mission Control" : "Administración"}</span></Link><nav><Link href="/admin"><ChartNoAxesCombined /> Resumen</Link><Link href="/admin/productos"><Boxes /> Productos</Link><Link href="/admin/categorias"><FolderTree /> Categorías</Link><Link href="/admin/solicitudes"><MessageSquareText /> Solicitudes</Link>{technical && <Link href="/admin/tecnico"><Gauge /> Estado técnico</Link>}</nav><form action={logoutAction}><button><LogOut /> Cerrar sesión</button></form></aside><div className="admin-main"><header className="admin-topbar"><div><span className="status-dot" /> {technical ? "Sistema Liira · acceso total" : "Operación Liira"}</div><Link href="/" target="_blank">Ver sitio público ↗</Link></header>{children}</div></div>;
}
