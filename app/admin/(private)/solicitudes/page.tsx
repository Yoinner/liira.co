import Link from "next/link";
import { CalendarClock, Filter, MessageCircle, Search, SlidersHorizontal, UserRound } from "lucide-react";
import { updateInquiry } from "@/app/admin/actions";
import { getServerNow, stageLabels } from "@/lib/admin/analytics";
import { formatCop } from "@/lib/config";
import { getCrmData } from "@/lib/data/crm";
import { requireAdmin } from "@/lib/auth/session";
import type { PipelineStage } from "@/lib/types";

type SearchParams = Promise<{ stage?: string; q?: string; view?: string; error?: string }>;

function localInput(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value)).replace(" ", "T");
}

export default async function InquiriesPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin("business");
  const params = await searchParams;
  const { inquiries, schemaReady } = await getCrmData();
  const now = getServerNow();
  const activeStage = Object.hasOwn(stageLabels, params.stage || "") ? params.stage as PipelineStage : null;
  const query = (params.q || "").trim().toLowerCase();
  const filtered = inquiries.filter((item) => {
    const stage = item.pipeline_stage || (item.status === "vendido" ? "ganado" : item.status === "no_vendido" ? "perdido" : "nuevo");
    if (activeStage && stage !== activeStage) return false;
    if (params.view === "overdue" && (!item.next_follow_up_at || new Date(item.next_follow_up_at).getTime() > now || item.status !== "contacto")) return false;
    if (query && ![item.customer_name, item.customer_phone, item.product_name, item.color_preference].some((value) => value?.toLowerCase().includes(query))) return false;
    return true;
  });

  return <main className="admin-content">
    <div className="admin-title"><div><p className="admin-kicker">Pipeline comercial</p><h1>Conversaciones que avanzan.</h1><p className="admin-lead">Cada solicitud necesita una etapa, una próxima acción y un resultado claro.</p></div></div>
    {!schemaReady && <div className="admin-unavailable">Aplica la migración CRM para activar etapas, prioridades, seguimientos y clientes relacionados.</div>}
    {params.error && <div className="admin-unavailable">No pudimos abrir ese contacto. Confirma que la solicitud y el número sigan disponibles.</div>}

    <section className="pipeline-tabs" aria-label="Filtrar por etapa"><Link href="/admin/solicitudes" className={!activeStage && params.view !== "overdue" ? "active" : ""}>Todas <span>{inquiries.length}</span></Link>{(Object.keys(stageLabels) as PipelineStage[]).map((stage) => <Link key={stage} href={`/admin/solicitudes?stage=${stage}`} className={activeStage === stage ? "active" : ""}>{stageLabels[stage]} <span>{inquiries.filter((item) => (item.pipeline_stage || "nuevo") === stage).length}</span></Link>)}<Link href="/admin/solicitudes?view=overdue" className={params.view === "overdue" ? "active urgent" : ""}>Vencidas <span>{inquiries.filter((item) => item.next_follow_up_at && new Date(item.next_follow_up_at).getTime() <= now && item.status === "contacto").length}</span></Link></section>

    <form className="admin-filterbar" method="get"><label><Search/><input name="q" defaultValue={params.q} placeholder="Buscar nombre, teléfono o producto" maxLength={80}/></label>{activeStage && <input type="hidden" name="stage" value={activeStage}/>}<button type="submit"><Filter/> Filtrar</button>{(params.q || activeStage || params.view) && <Link href="/admin/solicitudes">Limpiar</Link>}</form>

    <div className="result-summary"><span><SlidersHorizontal/> {filtered.length} {filtered.length === 1 ? "solicitud" : "solicitudes"}</span><small>Ordenadas de la más reciente a la más antigua</small></div>
    <section className="crm-inquiry-list">{filtered.length ? filtered.map((item) => {
      const stage = item.pipeline_stage || (item.status === "vendido" ? "ganado" : item.status === "no_vendido" ? "perdido" : "nuevo");
      const overdue = Boolean(item.next_follow_up_at && new Date(item.next_follow_up_at).getTime() <= now && item.status === "contacto");
      return <article className={`admin-panel crm-inquiry-card priority-${item.priority || "normal"}`} key={item.id}>
        <div className="inquiry-summary"><div className="inquiry-avatar">{item.customer_name?.slice(0, 1).toUpperCase() || "L"}</div><div className="inquiry-copy"><div className="inquiry-title"><h2>{item.customer_name || "Contacto de WhatsApp"}</h2><span className={`stage-pill stage-${stage}`}>{stageLabels[stage]}</span>{item.priority === "alta" && <span className="priority-pill">Prioridad alta</span>}</div><p className="inquiry-product">{item.product_name}</p><div className="inquiry-meta"><span>{item.customer_phone || "Sin teléfono"}</span><span>{item.source === "whatsapp_web" ? "Web → WhatsApp" : item.source}</span><time>{new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Bogota" }).format(new Date(item.created_at))}</time></div>{item.color_preference && <p><strong>Color:</strong> {item.color_preference}</p>}{item.customization && <p><strong>Pedido:</strong> {item.customization}</p>}{item.lost_reason && <p className="lost-reason"><strong>Motivo de pérdida:</strong> {item.lost_reason}</p>}{item.sale_amount && <strong className="sale-confirmed">Venta confirmada · {formatCop(item.sale_amount)}</strong>}</div></div>
        <div className="inquiry-workspace"><div className="quick-contact">{item.customer_phone && <Link href={`/admin/solicitudes/${item.id}/whatsapp`} target="_blank"><MessageCircle/> Abrir WhatsApp y registrar contacto</Link>}{item.customer_id && <Link href={`/admin/clientes/${item.customer_id}`}><UserRound/> Ver cliente 360°</Link>}</div>{item.next_follow_up_at && <div className={`follow-up-chip ${overdue ? "overdue" : ""}`}><CalendarClock/>{overdue ? "Vencido · " : "Próximo · "}{new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Bogota" }).format(new Date(item.next_follow_up_at))}</div>}
          <form action={updateInquiry} className="pipeline-form"><input type="hidden" name="id" value={item.id}/><label>Etapa<select name="stage" defaultValue={stage}>{(Object.keys(stageLabels) as PipelineStage[]).map((value) => <option key={value} value={value}>{stageLabels[value]}</option>)}</select></label><label>Prioridad<select name="priority" defaultValue={item.priority || "normal"}><option value="baja">Baja</option><option value="normal">Normal</option><option value="alta">Alta</option></select></label><label>Próximo seguimiento<input name="next_follow_up_at" type="datetime-local" defaultValue={localInput(item.next_follow_up_at)}/></label><label>Valor vendido<input name="sale_amount" type="number" min="0" step="100" defaultValue={item.sale_amount ?? ""} placeholder="Solo al ganar"/></label><label className="span-2">Motivo si se pierde<input name="lost_reason" maxLength={300} defaultValue={item.lost_reason || ""} placeholder="Ej. presupuesto, sin respuesta, no disponible"/></label><button className="admin-primary span-2" type="submit">Guardar avance</button></form>
        </div>
      </article>;
    }) : <div className="admin-panel admin-empty tall"><MessageCircle/><p>No hay solicitudes en esta vista.</p><span>Cambia los filtros o espera a que llegue una nueva conversación desde la tienda.</span></div>}</section>
  </main>;
}
