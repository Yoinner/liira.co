import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth/session";
import { siteConfig } from "@/lib/config";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session) return NextResponse.redirect(new URL("/admin/login", request.url));
  const { id } = await context.params;
  const client = getSupabaseAdmin();
  if (!client) return NextResponse.redirect(new URL("/admin/solicitudes?error=provider", request.url));
  const { data: inquiry } = await client.from("inquiries").select("id,customer_id,customer_name,customer_phone,product_name,pipeline_stage").eq("id", id).maybeSingle();
  if (!inquiry) return NextResponse.redirect(new URL("/admin/solicitudes?error=missing", request.url));
  const phone = String(inquiry.customer_phone || siteConfig.whatsapp).replace(/\D/g, "");
  const nextStage = inquiry.pipeline_stage === "nuevo" ? "contactado" : inquiry.pipeline_stage;
  const now = new Date().toISOString();
  await Promise.all([
    client.from("inquiries").update({ pipeline_stage: nextStage, last_contacted_at: now, updated_at: now }).eq("id", id),
    inquiry.customer_id ? client.from("customers").update({ last_contact_at: now, updated_at: now }).eq("id", inquiry.customer_id) : Promise.resolve(),
    client.from("customer_activities").insert({ customer_id: inquiry.customer_id, inquiry_id: id, activity_type: "whatsapp_opened", summary: "Se abrió una conversación manual en WhatsApp", actor_role: session.role }),
    client.from("audit_events").insert({ action: "whatsapp_manual_opened", entity_type: "inquiry", entity_id: id, metadata: { actor_role: session.role } }),
  ]);
  const name = inquiry.customer_name || "allí";
  const message = `Hola ${name} ✨ Soy de Liira. Te escribo para continuar con tu solicitud sobre ${inquiry.product_name}. ¿Cómo podemos ayudarte?`;
  return NextResponse.redirect(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`);
}
