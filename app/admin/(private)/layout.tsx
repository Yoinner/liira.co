import Link from "next/link";
import { Boxes, ChartNoAxesCombined, FolderTree, Gauge, LogOut, MessageSquareText } from "lucide-react";
import { logoutAction } from "@/app/admin/actions";
import { requireAdmin } from "@/lib/auth/session";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <div className="admin-shell"><aside className="admin-sidebar"><Link href="/admin" className="admin-wordmark">Liira<span>Administración</span></Link><nav><Link href="/admin"><ChartNoAxesCombined /> Resumen</Link><Link href="/admin/productos"><Boxes /> Productos</Link><Link href="/admin/categorias"><FolderTree /> Categorías</Link><Link href="/admin/solicitudes"><MessageSquareText /> Solicitudes</Link><Link href="/admin/tecnico"><Gauge /> Técnico</Link></nav><form action={logoutAction}><button><LogOut /> Cerrar sesión</button></form></aside><div className="admin-main"><header className="admin-topbar"><div><span className="status-dot" /> Operación Liira</div><Link href="/" target="_blank">Ver sitio público ↗</Link></header>{children}</div></div>;
}
