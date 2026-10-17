import "server-only";

import { z } from "zod";
import { conversationTranscript } from "@/lib/agent-core/conversation";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { contextFor } from "@/lib/whatsapp/amanda";

const classificationSchema = z.object({
  summary: z.string().trim().min(2).max(500),
  intent: z.enum(["consulta", "personalizacion", "precio", "disponibilidad", "envio", "compra", "soporte", "otro"]),
  sentiment: z.enum(["positivo", "neutral", "frustrado"]),
  next_action: z.string().trim().min(2).max(300),
});

export async function analyzeWhatsAppConversation(conversationId: string, oidcToken: string | null, force = false) {
  if (!force && process.env.WHATSAPP_AI_ANALYSIS_ENABLED !== "true") return;
  const token = oidcToken || process.env.VERCEL_OIDC_TOKEN || process.env.AI_GATEWAY_API_KEY;
  const client = getSupabaseAdmin();
  if (!client) return;
  if (!token) {
    await client.from("whatsapp_conversations").update({ ai_status: "error", ai_error_code: "gateway_not_configured" }).eq("id", conversationId);
    return;
  }

  const context = await contextFor(client, conversationId);
  if (!context?.messages.length) return;
  await client.from("whatsapp_conversations").update({ ai_status: "processing", ai_error_code: null }).eq("id", conversationId);
  const sourceId = [...context.messages].reverse().find((item) => item.direction === "inbound")?.id || null;
  const transcript = conversationTranscript(context.messages);

  try {
    const model = process.env.AI_GATEWAY_MODEL || "openai/gpt-6-luna";
    const response = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        ...(model.startsWith("openai/") ? { providerOptions: { gateway: { only: ["openai"] } } } : {}),
        messages: [
          { role: "system", content: "Analiza la conversación comercial de Liira con cautela. Devuelve JSON con summary, intent, sentiment y next_action. No infieras rasgos sensibles ni inventes hechos o confianza numérica." },
          { role: "user", content: JSON.stringify({ cliente: context.conversation.customer, etapa: context.conversation.agent_stage, memoria: context.conversation.agent_context, consultas: context.handoffs, reglas_generales_aprobadas: context.knowledge, catalogo: context.products, conversacion: transcript }) },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`gateway_${response.status}`);
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const parsed = classificationSchema.safeParse(JSON.parse(payload.choices?.[0]?.message?.content || "{}"));
    if (!parsed.success) throw new Error("invalid_model_output");
    await client.from("whatsapp_conversations").update({
      ai_status: "completed",
      ai_error_code: null,
      ai_source_message_id: sourceId,
      ai_model: model,
      ai_summary: parsed.data.summary,
      ai_intent: parsed.data.intent,
      ai_sentiment: parsed.data.sentiment,
      ai_next_action: parsed.data.next_action,
      ai_confidence: null,
      ai_analyzed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", conversationId);
  } catch (error) {
    await client.from("whatsapp_conversations").update({ ai_status: "error", ai_error_code: error instanceof Error && /^gateway_\d+$|^invalid_model_output$/.test(error.message) ? error.message : "analysis_failed" }).eq("id", conversationId);
  }
}

