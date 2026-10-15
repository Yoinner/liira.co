import "server-only";

import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";

const classificationSchema = z.object({
  summary: z.string().trim().min(2).max(500),
  intent: z.enum(["consulta", "personalizacion", "precio", "disponibilidad", "envio", "compra", "soporte", "otro"]),
  sentiment: z.enum(["positivo", "neutral", "frustrado"]),
  next_action: z.string().trim().min(2).max(300),
  confidence: z.number().min(0).max(1),
});

export async function analyzeWhatsAppConversation(conversationId: string, oidcToken: string | null) {
  if (process.env.WHATSAPP_AI_ANALYSIS_ENABLED !== "true") return;
  const token = process.env.AI_GATEWAY_API_KEY || oidcToken;
  const client = getSupabaseAdmin();
  if (!client || !token) return;

  const messages = await client.from("whatsapp_messages").select("direction,body,created_at").eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(12);
  if (messages.error || !messages.data?.length) return;
  const transcript = [...messages.data].reverse().map((item) => `${item.direction === "inbound" ? "Cliente" : "Liira"}: ${String(item.body || "[mensaje sin texto]").slice(0, 500)}`).join("\n");

  try {
    const response = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.AI_GATEWAY_MODEL || "openai/gpt-6-luna",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Clasifica conversaciones comerciales de Liira Accesorios. Devuelve JSON con summary, intent, sentiment, next_action y confidence. No infieras rasgos sensibles ni inventes hechos." },
          { role: "user", content: transcript },
        ],
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return;
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const parsed = classificationSchema.safeParse(JSON.parse(payload.choices?.[0]?.message?.content || "{}"));
    if (!parsed.success) return;
    await client.from("whatsapp_conversations").update({
      ai_summary: parsed.data.summary,
      ai_intent: parsed.data.intent,
      ai_sentiment: parsed.data.sentiment,
      ai_next_action: parsed.data.next_action,
      ai_confidence: parsed.data.confidence,
      ai_analyzed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", conversationId);
  } catch {
    // AI is advisory; provider failures must never reject a WhatsApp webhook.
  }
}

