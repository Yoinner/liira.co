import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { normalizePhone } from "@/lib/validation/crm";
import { amandaGreetingFallback } from "@/lib/whatsapp/amanda-copy";
import { downloadMetaMedia, sendMetaText } from "@/lib/whatsapp/meta";

const operatorPhone = () => normalizePhone(process.env.AMANDA_OPERATOR_PHONE || "3016399833");
const serviceWindowMs = 24 * 60 * 60 * 1000;

const decisionSchema = z.object({
  action: z.enum(["reply", "handoff", "wait", "close_lost"]),
  stage: z.enum(["discovery", "recommendation", "objection", "awaiting_payment_link", "awaiting_payment_proof", "collecting_shipping", "awaiting_shipping_quote", "closed_won", "closed_lost"]),
  reply: z.string().trim().max(1200).nullable(),
  handoff_kind: z.enum(["general", "payment_link", "shipping_quote"]).nullable(),
  operator_question: z.string().trim().max(800).nullable(),
  follow_up_in_minutes: z.number().int().min(4).max(1440).nullable(),
});

const replySchema = z.object({ reply: z.string().trim().min(2).max(1200) });

type Client = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

function aiToken(oidcToken?: string | null) {
  return process.env.AI_GATEWAY_API_KEY || oidcToken || process.env.VERCEL_OIDC_TOKEN || null;
}

async function gatewayJson<T>(schema: z.ZodSchema<T>, system: string, user: string, oidcToken?: string | null): Promise<T | null> {
  const token = aiToken(oidcToken);
  if (!token || process.env.AMANDA_ENABLED !== "true") return null;
  try {
    const response = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.AI_GATEWAY_MODEL || "openai/gpt-6-luna",
        temperature: 0.25,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) {
      console.warn("amanda_ai_gateway_failed", { status: response.status });
      return null;
    }
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    return schema.parse(JSON.parse(payload.choices?.[0]?.message?.content || "{}"));
  } catch (error) {
    console.warn("amanda_ai_gateway_failed", { reason: error instanceof Error ? error.name : "unknown" });
    return null;
  }
}

async function storeOutbound(client: Client, conversation: Record<string, unknown>, body: string, actor: "amanda" | "operator") {
  const messageId = await sendMetaText(String(conversation.normalized_phone), body);
  const now = new Date().toISOString();
  const stored = await client.from("whatsapp_messages").insert({
    conversation_id: conversation.id,
    customer_id: conversation.customer_id,
    provider_message_id: messageId,
    direction: "outbound",
    message_type: "text",
    body,
    delivery_status: "accepted",
    metadata: { actor },
  });
  if (stored.error) throw new Error("outbound_store_failed");
  await client.from("whatsapp_conversations").update({ last_message_at: now, last_outbound_at: now, unread_count: 0, updated_at: now }).eq("id", conversation.id);
  return messageId;
}

async function operatorWindowOpen(client: Client) {
  const latest = await client.from("amanda_operator_messages").select("provider_timestamp,created_at").eq("direction", "inbound").order("created_at", { ascending: false }).limit(1).maybeSingle();
  const timestamp = latest.data?.provider_timestamp || latest.data?.created_at;
  return Boolean(timestamp && Date.now() - new Date(timestamp).getTime() <= serviceWindowMs);
}

async function notifyOperator(client: Client, handoff: { id: string; code: string; kind: string; question: string }, customerName: string) {
  if (!(await operatorWindowOpen(client))) return;
  const labels: Record<string, string> = {
    media_review: "envió una imagen o video que necesita revisión",
    payment_link: "está lista para recibir el enlace de pago",
    payment_verification: "envió el comprobante y necesita confirmación",
    shipping_quote: "envió sus datos y necesita costo/tiempo de envío",
    general: "necesita tu criterio",
  };
  const body = `Amanda necesita tu ayuda · ${handoff.code}\nCliente: ${customerName}\nMotivo: ${labels[handoff.kind] || labels.general}\n${handoff.question}\n\nResponde empezando por ${handoff.code} y luego tu recomendación.`;
  try {
    const providerMessageId = await sendMetaText(operatorPhone(), body);
    await client.from("amanda_operator_messages").insert({ provider_message_id: providerMessageId, direction: "outbound", body, delivery_status: "accepted" });
    await client.from("amanda_handoffs").update({ operator_delivery_status: "sent" }).eq("id", handoff.id);
  } catch {
    await client.from("amanda_handoffs").update({ operator_delivery_status: "queued" }).eq("id", handoff.id);
  }
}

async function createHandoff(client: Client, conversation: Record<string, unknown>, sourceMessageId: string, kind: string, question: string) {
  const id = randomUUID();
  const code = `LIR-${id.slice(0, 6).toUpperCase()}`;
  const result = await client.from("amanda_handoffs").insert({ id, code, conversation_id: conversation.id, customer_id: conversation.customer_id, source_message_id: sourceMessageId, kind, question }).select("id,code,kind,question").single();
  if (result.error || !result.data) throw new Error("handoff_create_failed");
  const customer = conversation.customer as { name?: string } | null;
  await notifyOperator(client, result.data, customer?.name || String(conversation.normalized_phone));
  await client.from("whatsapp_conversations").update({ automation_mode: "human", agent_follow_up_at: null, updated_at: new Date().toISOString() }).eq("id", conversation.id);
  return result.data;
}

async function contextFor(client: Client, conversationId: string) {
  const [conversation, messages, products, learning] = await Promise.all([
    client.from("whatsapp_conversations").select("*, customer:customers(id,name,city,preferences,transactional_consent)").eq("id", conversationId).maybeSingle(),
    client.from("whatsapp_messages").select("id,direction,message_type,body,media_caption,created_at,deleted_at").eq("conversation_id", conversationId).is("deleted_at", null).order("created_at", { ascending: false }).limit(18),
    client.from("products").select("name,description,price,sale_price,stock,active,category:categories(name)").eq("active", true).order("featured", { ascending: false }).limit(30),
    client.from("amanda_handoffs").select("question,operator_guidance").eq("status", "resolved").not("operator_guidance", "is", null).order("resolved_at", { ascending: false }).limit(6),
  ]);
  if (conversation.error || !conversation.data) return null;
  return {
    conversation: conversation.data as Record<string, unknown>,
    messages: [...(messages.data || [])].reverse(),
    products: products.data || [],
    learning: learning.data || [],
  };
}

const amandaSystem = `Eres Amanda, encargada virtual de acompañar el proceso de compra de Liira, accesorios de murano hechos a mano en Bucaramanga. Hablas en español colombiano cálido, breve y natural. En el primer mensaje di: "Hola {nombre}, mucho gusto. Soy Amanda, la encargada de ayudarte en tu proceso de compra en Liira 💛" y adapta la continuación al contexto. No finjas ser humana ni menciones procesos internos.
Reglas: una pregunta clara por turno; máximo tres opciones reales; no inventes precio, stock, descuento, entrega, política, testimonio ni urgencia. Si faltan datos, pregunta. Si hay indecisión compleja, negociación, excepción, molestia, solicitud de pago o datos de envío, pide handoff. Nunca confirmes un pago por una captura: solo Daniela puede hacerlo. Si la clienta está lista para comprar, pide handoff payment_link. Devuelve únicamente JSON con action, stage, reply, handoff_kind, operator_question y follow_up_in_minutes. El seguimiento de 4 minutos solo aplica cuando dejaste una pregunta concreta y existe intención; ante "dame un momento" espera o pregunta cuándo retomar.`;

export function isAmandaOperator(phone: string) {
  return normalizePhone(phone) === operatorPhone();
}

export async function persistWhatsAppMedia(messageId: string) {
  const client = getSupabaseAdmin();
  if (!client) return;
  const message = await client.from("whatsapp_messages").select("id,provider_message_id,media_id,media_path").eq("id", messageId).maybeSingle();
  if (message.error || !message.data?.media_id || message.data.media_path) return;
  try {
    const media = await downloadMetaMedia(message.data.media_id);
    const ext = media.mimeType === "image/jpeg" ? "jpg" : media.mimeType.split("/")[1].replace("quicktime", "mov");
    const path = `${message.data.id}/${message.data.provider_message_id}.${ext}`;
    const upload = await client.storage.from("whatsapp-media").upload(path, media.bytes, { contentType: media.mimeType, upsert: false });
    if (upload.error) throw new Error("media_upload_failed");
    await client.from("whatsapp_messages").update({ media_path: path, media_mime_type: media.mimeType }).eq("id", message.data.id);
  } catch {
    await client.from("whatsapp_messages").update({ metadata: { media_error: "unavailable" } }).eq("id", message.data.id);
  }
}

export async function runAmandaForInbound(conversationId: string, sourceMessageId: string, oidcToken?: string | null) {
  const client = getSupabaseAdmin();
  if (!client || process.env.AMANDA_ENABLED !== "true") return;
  const run = await client.from("amanda_agent_runs").insert({ source_message_id: sourceMessageId, conversation_id: conversationId }).select("source_message_id").maybeSingle();
  if (run.error || !run.data) return;
  const finishRun = (status: "done" | "failed", errorCode?: string) => client.from("amanda_agent_runs").update({ status, error_code: errorCode || null, updated_at: new Date().toISOString() }).eq("source_message_id", sourceMessageId);
  try {
    const context = await contextFor(client, conversationId);
    if (!context || context.conversation.automation_mode !== "autonomous" || context.conversation.deleted_at) {
      await finishRun("done");
      return;
    }
    const source = context.messages.find((item) => item.id === sourceMessageId);
    if (!source) {
      await finishRun("done");
      return;
    }
    if (source.message_type === "image" || source.message_type === "video") {
      const kind = context.conversation.agent_stage === "awaiting_payment_proof" ? "payment_verification" : "media_review";
      const question = kind === "payment_verification" ? "Revisa el comprobante y responde con «pago confirmado» solo si lo verificaste." : "Revisa el archivo enviado y dime qué deseas responderle.";
      await createHandoff(client, context.conversation, sourceMessageId, kind, question);
      await finishRun("done");
      return;
    }
    if (context.conversation.agent_stage === "collecting_shipping") {
      await storeOutbound(client, context.conversation, "Gracias 💛 Ya estoy confirmando el valor y el tiempo de envío con el equipo de Liira.", "amanda");
      await createHandoff(client, context.conversation, sourceMessageId, "shipping_quote", `Datos enviados por la clienta: ${source.body || "sin texto"}. Indica costo y tiempo estimado.`);
      await client.from("whatsapp_conversations").update({ agent_stage: "awaiting_shipping_quote" }).eq("id", conversationId);
      await finishRun("done");
      return;
    }
    const transcript = context.messages.map((item) => `${item.direction === "inbound" ? "Cliente" : "Liira"}: ${item.body || `[${item.message_type}]`}`).join("\n");
    const decision = await gatewayJson(decisionSchema, amandaSystem, JSON.stringify({ cliente: context.conversation.customer, etapa: context.conversation.agent_stage, catalogo: context.products, aprendizajes_revisables: context.learning, conversacion: transcript }), oidcToken);
    if (!decision) {
      const customer = context.conversation.customer as { name?: string } | null;
      const fallback = amandaGreetingFallback(source.body, customer?.name, Boolean(context.conversation.agent_intro_sent_at));
      if (fallback) {
        const now = new Date().toISOString();
        await storeOutbound(client, context.conversation, fallback, "amanda");
        await client.from("whatsapp_conversations").update({ status: "esperando_cliente", agent_intro_sent_at: context.conversation.agent_intro_sent_at || now, updated_at: now }).eq("id", conversationId);
      } else {
        await createHandoff(client, context.conversation, sourceMessageId, "general", "Amanda no pudo generar una respuesta segura. Revisa la conversación y recomienda qué contestar.");
      }
    } else if (decision.action === "handoff") {
      if (decision.reply) await storeOutbound(client, context.conversation, decision.reply, "amanda");
      await createHandoff(client, context.conversation, sourceMessageId, decision.handoff_kind || "general", decision.operator_question || "Revisa la conversación y recomienda la mejor respuesta.");
    } else if (decision.action === "reply" && decision.reply) {
      await storeOutbound(client, context.conversation, decision.reply, "amanda");
      const now = new Date();
      await client.from("whatsapp_conversations").update({
        agent_stage: decision.stage,
        status: "esperando_cliente",
        agent_intro_sent_at: context.conversation.agent_intro_sent_at || now.toISOString(),
        agent_follow_up_at: decision.follow_up_in_minutes ? new Date(now.getTime() + decision.follow_up_in_minutes * 60_000).toISOString() : null,
        agent_follow_up_source_message_id: decision.follow_up_in_minutes ? sourceMessageId : null,
        updated_at: now.toISOString(),
      }).eq("id", conversationId);
    } else if (decision.action === "close_lost") {
      await client.from("whatsapp_conversations").update({ status: "cerrada_perdida", agent_stage: "closed_lost", agent_follow_up_at: null }).eq("id", conversationId);
    }
    await finishRun("done");
  } catch {
    await finishRun("failed", "processing_failed");
  }
}

export async function handleAmandaOperatorInbound(message: { messageId: string; providerTimestamp: string | null; text: string | null }, oidcToken?: string | null) {
  const client = getSupabaseAdmin();
  if (!client) return;
  const timestamp = message.providerTimestamp ? new Date(Number(message.providerTimestamp) * 1000).toISOString() : null;
  const stored = await client.from("amanda_operator_messages").insert({ provider_message_id: message.messageId, direction: "inbound", body: message.text, provider_timestamp: timestamp }).select("id").maybeSingle();
  if (stored.error || !stored.data || !message.text) return;
  const code = message.text.match(/LIR-[A-F0-9]{6}/i)?.[0]?.toUpperCase();
  const pendingQuery = client.from("amanda_handoffs").select("*, conversation:whatsapp_conversations(*, customer:customers(name))").eq("status", "pending").order("created_at", { ascending: false });
  const handoffResult = code ? await pendingQuery.eq("code", code).limit(1).maybeSingle() : await pendingQuery.limit(2);
  const handoff = code ? handoffResult.data : Array.isArray(handoffResult.data) && handoffResult.data.length === 1 ? handoffResult.data[0] : null;
  if (!handoff) {
    const body = Array.isArray(handoffResult.data) && handoffResult.data.length === 0
      ? "Canal privado de Daniela conectado. Cuando Amanda necesite tu criterio, recibirás aquí el nombre, la duda y un código de caso."
      : "No pude identificar el caso. Responde empezando por el código LIR-XXXXXX que aparece en la alerta.";
    const providerMessageId = await sendMetaText(operatorPhone(), body);
    await client.from("amanda_operator_messages").insert({ provider_message_id: providerMessageId, direction: "outbound", body, delivery_status: "accepted" });
    return;
  }
  const guidance = message.text.replace(new RegExp(handoff.code, "i"), "").replace(/^\s*[:\-]\s*/, "").trim();
  if (guidance.length < 2) return;
  const conversation = handoff.conversation as Record<string, unknown>;
  const context = await contextFor(client, String(handoff.conversation_id));
  if (!context) return;
  const transcript = context.messages.map((item) => `${item.direction === "inbound" ? "Cliente" : "Liira"}: ${item.body || `[${item.message_type}]`}`).join("\n");
  const confirmedPayment = handoff.kind === "payment_verification" && /^pago\s+(ya\s+)?(confirmado|aprobado)/i.test(guidance);
  const system = `Redacta una respuesta breve, cálida y natural de Amanda para una clienta de Liira. Integra fielmente la recomendación de Daniela sin mencionar consultas internas. No agregues datos, precios, promesas ni descuentos. ${confirmedPayment ? "Daniela confirmó explícitamente el pago: agradece y pide nombre completo, dirección, barrio y ciudad para el envío." : "Si Daniela no confirmó un pago, jamás lo declares confirmado."} Devuelve solo JSON con reply.`;
  const drafted = await gatewayJson(replySchema, system, JSON.stringify({ motivo: handoff.question, recomendacion_daniela: guidance, conversacion: transcript }), oidcToken);
  const reply = drafted?.reply || (confirmedPayment ? "¡Pago confirmado! 💛 Gracias por elegir Liira. Para preparar el envío, compárteme por favor tu nombre completo, dirección, barrio y ciudad." : guidance);
  await storeOutbound(client, conversation, reply, "amanda");
  const nextStage = handoff.kind === "payment_link" ? "awaiting_payment_proof" : confirmedPayment ? "collecting_shipping" : handoff.kind === "shipping_quote" ? "closed_won" : conversation.agent_stage;
  const nextStatus = confirmedPayment || handoff.kind === "shipping_quote" ? "cerrada_ganada" : "esperando_cliente";
  await client.from("amanda_handoffs").update({ status: "resolved", operator_guidance: guidance, learning_candidate: guidance, resolved_at: new Date().toISOString() }).eq("id", handoff.id);
  await client.from("whatsapp_conversations").update({ automation_mode: "autonomous", agent_stage: nextStage, status: nextStatus, updated_at: new Date().toISOString() }).eq("id", handoff.conversation_id);
}

export async function runDueAmandaFollowups(oidcToken?: string | null) {
  const client = getSupabaseAdmin();
  if (!client || process.env.AMANDA_ENABLED !== "true") return 0;
  const due = await client.from("whatsapp_conversations").select("*, customer:customers(name)").eq("automation_mode", "autonomous").is("deleted_at", null).lte("agent_follow_up_at", new Date().toISOString()).limit(20);
  let sent = 0;
  for (const conversation of due.data || []) {
    const latest = await client.from("whatsapp_messages").select("direction,body,created_at").eq("conversation_id", conversation.id).is("deleted_at", null).order("created_at", { ascending: false }).limit(4);
    if (!latest.data?.length || latest.data[0].direction !== "outbound" || !conversation.last_inbound_at || Date.now() - new Date(conversation.last_inbound_at).getTime() > serviceWindowMs) {
      await client.from("whatsapp_conversations").update({ agent_follow_up_at: null }).eq("id", conversation.id);
      continue;
    }
    const drafted = await gatewayJson(replySchema, "Eres Amanda de Liira. Escribe un único seguimiento breve, cálido y sin presión. Retoma la pregunta pendiente, ofrece ayuda y no inventes información. Devuelve JSON con reply.", JSON.stringify({ cliente: conversation.customer, ultimos_mensajes: latest.data }), oidcToken);
    if (drafted?.reply) {
      await storeOutbound(client, conversation, drafted.reply, "amanda");
      sent += 1;
    }
    await client.from("whatsapp_conversations").update({ agent_follow_up_at: null, agent_last_nudge_at: new Date().toISOString() }).eq("id", conversation.id);
  }
  return sent;
}
