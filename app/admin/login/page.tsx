import { redirect } from "next/navigation";
import { LoginForm } from "@/components/admin/login-form";
import { getAdminSession } from "@/lib/auth/session";

export default async function LoginPage() {
  const session = await getAdminSession();
  if (session) redirect(session.role === "technical" ? "/admin/tecnico" : "/admin");
  return <main className="admin-login-page"><section><div className="admin-login-brand">Liira<span>Administración</span></div><p className="admin-kicker">Acceso privado</p><h1>Tu atelier,<br />en orden.</h1><p>Productos, solicitudes, inventario y ventas en un solo lugar.</p><LoginForm /><small>La sesión se cierra automáticamente después de 12 horas.</small></section><div className="admin-login-art"><span>✦</span><p>Cada dato al servicio<br />de una mejor atención.</p></div></main>;
}
