import "server-only";

import { z } from "zod";
import { conversationTranscript } from "@/lib/agent-core/conversation";
import { defaultAgentModel, gatewayAuth, gatewayJson } from "@/lib/agent-core/gateway";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { contextFor } from "@/lib/whatsapp/amanda";
import { gatewayBudget } from "@/lib/whatsapp/amanda-budget";

const classificationSchema = z.object({
  summary: z.string().trim().min(2).max(500),
  intent: z.enum(["consulta", "personalizacion", "precio", "disponibilidad", "envio", "compra", "soporte", "otro"]),
  sentiment: z.enum(["positivo", "neutral", "frustrado"]),
  next_action: z.string().trim().min(2).max(300),
});

export async function analyzeWhatsAppConversation(conversationId: string, oidcToken: string | null, force = false) {
  if (!force && process.env.WHATSAPP_AI_ANALYSIS_ENABLED !== "true") return;
  const auth = gatewayAuth(oidcToken);
  const client = getSupabaseAdmin();
  if (!client) return;
  if (!auth.token) {
    await client.from("whatsapp_conversations").update({ ai_status: "error", ai_error_code: "gateway_not_configured" }).eq("id", conversationId);
    return;
  }

  const context = await contextFor(client, conversationId);
  if (!context?.messages.length) return;
  await client.from("whatsapp_conversations").update({ ai_status: "processing", ai_error_code: null }).eq("id", conversationId);
  const sourceId = [...context.messages].reverse().find((item) => item.direction === "inbound")?.id || null;
  const transcript = conversationTranscript(context.messages);

  try {
    const result = await gatewayJson({ schema: classificationSchema, system: "Analiza la conversación comercial de Liira con cautela. Devuelve JSON con summary, intent, sentiment y next_action. No infieras rasgos sensibles ni inventes hechos o confianza numérica.", user: JSON.stringify({ cliente: context.conversation.customer, etapa: context.conversation.agent_stage, memoria: context.conversation.agent_context, consultas: context.handoffs, reglas_generales_aprobadas: context.knowledge, catalogo: context.products, conversacion: transcript }), token: auth.token, authMode: auth.authMode, model: process.env.AI_GATEWAY_MODEL || defaultAgentModel, budget: gatewayBudget(client, "background") });
    if (!result.value) throw new Error(result.errorCode || "invalid_model_output");
    await client.from("whatsapp_conversations").update({
      ai_status: "completed",
      ai_error_code: null,
      ai_source_message_id: sourceId,
      ai_model: result.model,
      ai_summary: result.value.summary,
      ai_intent: result.value.intent,
      ai_sentiment: result.value.sentiment,
      ai_next_action: result.value.next_action,
      ai_confidence: null,
      ai_analyzed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", conversationId);
  } catch (error) {
    await client.from("whatsapp_conversations").update({ ai_status: "error", ai_error_code: error instanceof Error && /^[a-z0-9_]{2,80}$/.test(error.message) ? error.message : "analysis_failed" }).eq("id", conversationId);
  }
}

