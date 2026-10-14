import { Activity, CheckCircle2, Cloud, Database, HardDrive, LockKeyhole, MessageCircle, ShieldCheck, TriangleAlert, UsersRound } from "lucide-react";
import { getSystemHealth, type HealthState } from "@/lib/data/system-health";
import { requireAdmin } from "@/lib/auth/session";

const labels: Record<HealthState, string> = {
  connected: "Conectado",
  configured: "Configurado",
  degraded: "Degradado",
  unavailable: "No disponible",
};

const icons = [Cloud, Database, HardDrive, UsersRound, MessageCircle, Activity];

export default async function TechnicalPage() {
  await requireAdmin("technical");
  const health = await getSystemHealth();
  return <main className="admin-content tech-page">
    <div className="admin-title"><div><p className="admin-kicker">Mission Control</p><h1>Estado técnico</h1><p className="tech-intro">Salud real del sitio y sus integraciones, sin exponer credenciales.</p></div></div>

    <section className="tech-access-banner"><ShieldCheck /><div><strong>Superadministrador verificado</strong><p>Este rol puede operar todo el CRM y, además, revisar plataforma, seguridad, proveedores y trazabilidad técnica.</p></div><span>Acceso total</span></section>

    <section className="tech-service-grid">
      {health.services.map((service, index) => {
        const Icon = icons[index];
        return <article className="admin-panel tech-service" key={service.name}><span className={`tech-icon state-${service.state}`}><Icon /></span><div><small>{service.name}</small><strong>{labels[service.state]}</strong><p>{service.detail}</p></div><i className={`health-dot state-${service.state}`} /></article>;
      })}
    </section>

    <section className="admin-grid tech-grid">
      <article className="admin-panel tech-panel">
        <div className="panel-heading"><div><p className="admin-kicker">Release actual</p><h2>Entorno y runtime</h2></div></div>
        <dl className="tech-definition"><div><dt>Entorno</dt><dd>{health.release.environment}</dd></div><div><dt>Release</dt><dd>{health.release.commit}</dd></div><div><dt>Región</dt><dd>{health.release.region}</dd></div><div><dt>Runtime</dt><dd>{health.release.runtime}</dd></div></dl>
        <p className="tech-note">Las cuotas y el consumo de Vercel no se muestran porque este sitio no tiene conectada una API de administración. El hosting sí está verificado desde el runtime.</p>
      </article>

      <article className="admin-panel tech-panel">
        <div className="panel-heading"><div><p className="admin-kicker">Controles activos</p><h2>Seguridad</h2></div><LockKeyhole size={20} /></div>
        <div className="security-list">{health.security.map((item) => <div key={item.label}>{item.ok ? <CheckCircle2 /> : <TriangleAlert />}<span>{item.label}</span><strong>{item.ok ? "Activo" : "Revisar"}</strong></div>)}</div>
      </article>
    </section>

    <section className="admin-panel audit-panel">
      <div className="panel-heading"><div><p className="admin-kicker">Trazabilidad</p><h2>Actividad técnica reciente</h2></div><time dateTime={health.checkedAt}>Revisado {new Intl.DateTimeFormat("es-CO", { hour: "numeric", minute: "2-digit" }).format(new Date(health.checkedAt))}</time></div>
      {health.auditAvailable && health.audit.length ? <div className="audit-list">{health.audit.map((event) => <div key={event.id}><span className="health-dot state-connected" /><strong>{event.action}</strong><small>{event.entity_type}</small><time>{new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(event.created_at))}</time></div>)}</div> : <div className="admin-empty"><Activity /><p>Sin eventos técnicos recientes.</p><span>La salud de servicios se verifica en tiempo real al abrir esta página.</span></div>}
    </section>
  </main>;
}
