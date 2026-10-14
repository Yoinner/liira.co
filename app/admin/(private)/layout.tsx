import Link from "next/link";
import { Eye, LogOut, Sparkles } from "lucide-react";
import { logoutAction } from "@/app/admin/actions";
import { AdminNav } from "@/components/admin/admin-nav";
import { AdminTools } from "@/components/admin/admin-tools";
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
        <AdminNav technical={technical} />
      </div>
      <form action={logoutAction}><button><LogOut /> Cerrar sesión</button></form>
    </aside>
    <div className="admin-main"><header className="admin-topbar"><div className="admin-live-status"><span className="status-dot" /><span><strong>{technical ? "Sistema operativo" : "Operación activa"}</strong><small>{today}</small></span></div><AdminTools /><Link href="/" target="_blank" className="admin-store-link"><Eye size={15} /> Ver tienda</Link><form action={logoutAction} className="admin-mobile-logout"><button aria-label="Cerrar sesión"><LogOut size={16} /></button></form></header>{children}</div>
  </div>;
}
