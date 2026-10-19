import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { allowedAgentStage, conversationTranscript, handoffNamedInMessage, operatorCaseReference } from "@/lib/agent-core/conversation";
import { defaultAgentModel, gatewayAuth, gatewayJson, gatewayRetryDelay } from "@/lib/agent-core/gateway";
import { amandaSystem, decisionSchema, guidanceSchema, operatorGuidanceSystem, operatorMatchSchema, operatorMessageSchema, quoteRelevanceSchema } from "@/lib/whatsapp/amanda-decision";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { normalizePhone } from "@/lib/validation/crm";
import { liiraAgentBusiness, supportedCatalogReply, supportedOperatorReply } from "@/lib/whatsapp/amanda-business";
import { gatewayBudget } from "@/lib/whatsapp/amanda-budget";
import { amandaTools } from "@/lib/whatsapp/amanda-tools";
import { amandaEnabledForPhone } from "@/lib/whatsapp/amanda-rollout";
import { paymentHandoffApproved } from "@/lib/whatsapp/payment-safety";
import { provisionalShippingReplyIsSafe, shippingQuoteGuidance, shippingQuoteIsCurrent, type ShippingQuote } from "@/lib/whatsapp/shipping-quote";
import { downloadMetaMedia, sendMetaOperatorTemplate, sendMetaText } from "@/lib/whatsapp/meta";
import { shouldRetryOperatorAlert } from "@/lib/whatsapp/operator-alert";

const operatorPhone = () => normalizePhone(process.env.AMANDA_OPERATOR_PHONE || "3016399833");
const serviceWindowMs = 24 * 60 * 60 * 1000;

const replySchema = z.object({ reply: z.string().trim().min(2).max(1200) });

type Client = NonNullable<ReturnType<typeof getSupabaseAdmin>>;
const promptVersion = "liira-amanda-v3";

async function storeOutbound(client: Client, conversation: Record<string, unknown>, body: string, actor: "amanda" | "operator") {
  const lastInboundAt = String(conversation.last_inbound_at || "");
  if (!lastInboundAt || Date.now() - new Date(lastInboundAt).getTime() > serviceWindowMs) throw new Error("outside_service_window");
  if (actor === "amanda") {
    const current = await client.from("whatsapp_conversations").select("automation_mode,last_inbound_at").eq("id", conversation.id).maybeSingle();
    if (current.error || current.data?.automation_mode !== "autonomous" || current.data.last_inbound_at !== lastInboundAt) throw new Error("stale_conversation");
  }
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
  const labels: Record<string, string> = {
    media_review: "envió una imagen o video que necesita revisión",
    payment_link: "está lista para recibir el enlace de pago",
    payment_verification: "envió el comprobante y necesita confirmación",
    shipping_quote: "consulta costo y plazo de envío",
    general: "necesita tu criterio",
  };
  const body = `Amanda necesita tu ayuda · ${handoff.code}\nCliente: ${customerName}\nMotivo: ${labels[handoff.kind] || labels.general}\n${handoff.question}\n\nPuedes responder directamente a este mensaje; no necesitas escribir el código.`;
  const claimed = await client.from("amanda_handoffs").update({ operator_delivery_status: "sending" }).eq("id", handoff.id).eq("operator_delivery_status", "queued").select("id").maybeSingle();
  if (claimed.error || !claimed.data) return;
  let sendAttempted = false;
  try {
    const open = await operatorWindowOpen(client);
    sendAttempted = true;
    const sent = open
      ? { messageId: await sendMetaText(operatorPhone(), body), templateName: null }
      : await sendMetaOperatorTemplate(operatorPhone(), `${handoff.code} · ${customerName}: ${handoff.question}`.slice(0, 120));
    const stored = await client.from("amanda_operator_messages").insert({ provider_message_id: sent.messageId, direction: "outbound", handoff_id: handoff.id, body: open ? body : `Alerta iniciada con plantilla: ${handoff.code}`, delivery_status: "accepted" });
    if (stored.error) throw new Error("operator_alert_store_failed");
    const updated = await client.from("amanda_handoffs").update({ operator_delivery_status: "sent" }).eq("id", handoff.id);
    if (updated.error) throw new Error("operator_alert_state_failed");
  } catch {
    await client.from("amanda_handoffs").update({ operator_delivery_status: sendAttempted ? "send_unconfirmed" : "queued" }).eq("id", handoff.id);
  }
}

async function createHandoff(client: Client, conversation: Record<string, unknown>, sourceMessageId: string, kind: string, question: string) {
  const pending = await client.from("amanda_handoffs").select("id,code,kind,question,operator_delivery_status").eq("conversation_id", conversation.id).eq("source_message_id", sourceMessageId).eq("kind", kind).eq("status", "pending").maybeSingle();
  if (pending.error) throw new Error("handoff_lookup_failed");
  if (pending.data) {
    if (pending.data.operator_delivery_status !== "sent") {
      const customer = conversation.customer as { name?: string } | null;
      await notifyOperator(client, pending.data, customer?.name || String(conversation.normalized_phone));
    }
    return pending.data;
  }
  if (kind === "shipping_quote") {
    const open = await client.from("amanda_handoffs").select("id,code,kind,question,operator_delivery_status,application_status")
      .eq("conversation_id", conversation.id).eq("kind", "shipping_quote").eq("status", "pending").order("created_at", { ascending: false }).limit(2);
    if (open.error) throw new Error("shipping_handoff_lookup_failed");
    if (open.data?.length === 1 && open.data[0].application_status === "pending") {
      const existing = open.data[0];
      const quote = await client.from("amanda_shipping_quotes").select("id").eq("handoff_id", existing.id).maybeSingle();
      if (quote.error) throw new Error("shipping_quote_lookup_failed");
      if (!quote.data) {
        if (existing.question !== question) {
          const updated = await client.from("amanda_handoffs").update({ question, operator_delivery_status: "queued", guidance_due_at: null, guidance_error_code: "shipping_context_updated" })
            .eq("id", existing.id).eq("status", "pending").eq("question", existing.question).select("id,code,kind,question,operator_delivery_status").maybeSingle();
          if (updated.error) throw new Error("shipping_handoff_update_failed");
          if (updated.data) {
            const customer = conversation.customer as { name?: string } | null;
            await notifyOperator(client, updated.data, customer?.name || String(conversation.normalized_phone));
            return updated.data;
          }
        } else {
          if (existing.operator_delivery_status !== "sent") {
            const customer = conversation.customer as { name?: string } | null;
            await notifyOperator(client, existing, customer?.name || String(conversation.normalized_phone));
          }
          return existing;
        }
      }
    }
  }
  const id = randomUUID();
  const code = `LIR-${id.slice(0, 6).toUpperCase()}`;
  const result = await client.from("amanda_handoffs").insert({ id, code, conversation_id: conversation.id, customer_id: conversation.customer_id, source_message_id: sourceMessageId, kind, question }).select("id,code,kind,question").single();
  if (result.error || !result.data) {
    const raced = await client.from("amanda_handoffs").select("id,code,kind,question,operator_delivery_status").eq("source_message_id", sourceMessageId).eq("kind", kind).eq("status", "pending").maybeSingle();
    if (raced.error || !raced.data) throw new Error("handoff_create_failed");
    return raced.data;
  }
  const customer = conversation.customer as { name?: string } | null;
  await notifyOperator(client, result.data, customer?.name || String(conversation.normalized_phone));
  await client.from("whatsapp_conversations").update({ agent_follow_up_at: null, updated_at: new Date().toISOString() }).eq("id", conversation.id);
  await client.from("whatsapp_conversations").update({ status: "cotizando" }).eq("id", conversation.id).is("status_manual_at", null);
  return result.data;
}

export async function contextFor(client: Client, conversationId: string) {
  const [conversation, messages, products, handoffs, knowledge] = await Promise.all([
    client.from("whatsapp_conversations").select("*, customer:customers(id,name,city,preferences,transactional_consent)").eq("id", conversationId).maybeSingle(),
    client.from("whatsapp_messages").select("id,direction,message_type,body,media_caption,created_at,deleted_at").eq("conversation_id", conversationId).is("deleted_at", null).order("created_at", { ascending: false }).limit(40),
    client.from("products").select("name,slug,description,price,sale_price,stock,active,category:categories(name)").eq("active", true).order("featured", { ascending: false }),
    client.from("amanda_handoffs").select("id,code,kind,status,question,operator_guidance,source_message_id,created_at").eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(12),
    client.from("amanda_knowledge").select("content,approved_at,version").eq("status", "approved").order("approved_at", { ascending: false }).limit(30),
  ]);
  if (conversation.error || !conversation.data || messages.error || products.error || handoffs.error || knowledge.error) return null;
  return {
    conversation: conversation.data as Record<string, unknown>,
    messages: [...(messages.data || [])].reverse(),
    products: (products.data || []).map((product) => ({ ...product, category: Array.isArray(product.category) ? product.category[0] || null : product.category })),
    handoffs: handoffs.data || [],
    knowledge: knowledge.data || [],
  };
}

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

export async function runAmandaForInbound(conversationId: string, oidcToken?: string | null) {
  const client = getSupabaseAdmin();
  if (!client || process.env.AMANDA_ENABLED !== "true") return;
  const claim = await client.rpc("claim_amanda_conversation", { p_conversation_id: conversationId });
  if (claim.error || !claim.data) return;
  const currentLease = await client.from("whatsapp_conversations").select("agent_processing_until").eq("id", conversationId).maybeSingle();
  const processingUntil = currentLease.data?.agent_processing_until || null;
  let sourceMessageId: string | null = null;
  let sendAttempted = false;
  let initialInboundAt: string | null = null;
  let attempt = 0;
  try {
    const context = await contextFor(client, conversationId);
    if (!context) throw new Error("conversation_unavailable");
    if (context.conversation.automation_mode !== "autonomous" || context.conversation.deleted_at) return;
    if (!amandaEnabledForPhone(String(context.conversation.normalized_phone || ""))) {
      await client.from("whatsapp_conversations").update({ agent_due_at: null }).eq("id", conversationId);
      return;
    }
    const source = [...context.messages].reverse().find((item) => item.direction === "inbound");
    if (!source) return;
    sourceMessageId = source.id;
    initialInboundAt = String(context.conversation.last_inbound_at);
    const previous = await client.from("amanda_agent_runs").select("status,phase,attempt_count").eq("source_message_id", sourceMessageId).maybeSingle();
    if (previous.error) throw new Error("run_lookup_failed");
    if (previous.data?.phase === "sending" || previous.data?.phase === "send_unconfirmed" || previous.data?.phase === "failed_final" || previous.data?.status === "done") {
      await client.from("whatsapp_conversations").update(previous.data.phase === "sending" || previous.data.phase === "send_unconfirmed" ? { agent_due_at: null, ai_status: "error", ai_error_code: "send_unconfirmed" } : { agent_due_at: null }).eq("id", conversationId).eq("last_inbound_at", initialInboundAt);
      return;
    }
    attempt = (previous.data?.attempt_count || 0) + 1;
    const run = await client.from("amanda_agent_runs").upsert({ source_message_id: sourceMessageId, conversation_id: conversationId, status: "running", phase: "preparing", attempt_count: attempt, error_code: null, prompt_version: promptVersion, updated_at: new Date().toISOString() }, { onConflict: "source_message_id" });
    if (run.error) throw new Error("run_store_failed");
    if (source.message_type === "image" || source.message_type === "video") {
      const kind = context.conversation.agent_stage === "awaiting_payment_proof" ? "payment_verification" : "media_review";
      const previousAsk = [...context.messages].reverse().find((item) => item.direction === "inbound" && item.id !== source.id && item.body)?.body;
      const question = kind === "payment_verification" ? "Revisa el archivo como posible comprobante; responde «pago confirmado» solo tras verificar la transacción por un canal autorizado." : `El cliente envió ${source.message_type === "image" ? "una imagen" : "un video"}${source.media_caption ? ` con texto «${source.media_caption.slice(0, 180)}»` : ""}. ${previousAsk ? `Última consulta textual: «${previousAsk.slice(0, 250)}». ` : ""}Revisa el archivo en el panel y confirma qué podemos responder; Amanda no ha inferido el contenido visual.`;
      await createHandoff(client, context.conversation, source.id, kind, question);
      sendAttempted = true;
      await client.from("amanda_agent_runs").update({ phase: "sending" }).eq("source_message_id", source.id);
      await storeOutbound(client, context.conversation, kind === "payment_verification" ? "Recibí tu comprobante. Voy a verificar el pago antes de confirmarte los siguientes pasos." : "Recibí tu referencia. La revisaré para orientarte bien sobre lo que podemos hacer.", "amanda");
      await client.from("whatsapp_conversations").update({ ai_status: "pending", ai_error_code: null, ai_source_message_id: source.id, ai_summary: `Archivo ${source.message_type === "image" ? "de imagen" : "de video"} recibido; pendiente de revisión humana.`, ai_intent: "referencia multimedia", ai_sentiment: null, ai_next_action: "Revisar archivo y orientar a Amanda", ai_confidence: null, ai_analyzed_at: null }).eq("id", conversationId).eq("last_inbound_at", initialInboundAt);
      await client.from("amanda_agent_runs").update({ status: "done", phase: "done", updated_at: new Date().toISOString() }).eq("source_message_id", sourceMessageId);
      return;
    }
    const transcript = conversationTranscript(context.messages);
    const catalog = { products: context.products, available: true };
    const auth = gatewayAuth(oidcToken);
    const gateway = await gatewayJson({ schema: decisionSchema, system: amandaSystem(liiraAgentBusiness), user: JSON.stringify({ negocio: liiraAgentBusiness, cliente: context.conversation.customer, etapa: context.conversation.agent_stage, memoria: context.conversation.agent_context, consultas_de_esta_conversacion: context.handoffs, reglas_generales_aprobadas: context.knowledge, catalogo_disponible: catalog.available, total_productos_activos: catalog.products.length, conversacion: transcript }), token: auth.token, authMode: auth.authMode, model: process.env.AI_GATEWAY_MODEL || defaultAgentModel, tools: amandaTools(catalog, context.handoffs), budget: gatewayBudget(client, "customer") });
    if (gateway.errorCode) console.warn("amanda_gateway_result", { model: gateway.model, auth_mode: gateway.authMode, endpoint: "chat/completions", phase: "decision", http_status: gateway.httpStatus, error_code: gateway.errorCode, latency_ms: gateway.latencyMs, source_message_id: sourceMessageId });
    await client.from("amanda_agent_runs").update({ model: gateway.model, latency_ms: gateway.latencyMs, input_tokens: gateway.inputTokens, output_tokens: gateway.outputTokens, error_code: gateway.errorCode }).eq("source_message_id", sourceMessageId);
    const latest = await client.from("whatsapp_conversations").select("automation_mode,last_inbound_at").eq("id", conversationId).maybeSingle();
    if (latest.error || latest.data?.automation_mode !== "autonomous" || latest.data?.last_inbound_at !== initialInboundAt) {
      await client.from("amanda_agent_runs").update({ status: "done", phase: "done", error_code: "stale_context" }).eq("source_message_id", sourceMessageId);
      return;
    }
    const unsupportedClaim = Boolean(gateway.value?.reply && !supportedCatalogReply(gateway.value.reply, catalog.products));
    const decision = unsupportedClaim ? null : gateway.value;
    if (!decision) {
      const code = unsupportedClaim ? "unsupported_catalog_claim" : gateway.errorCode || "invalid_model_output";
      const delay = gatewayRetryDelay(code, attempt);
      await client.from("amanda_agent_runs").update({ status: "failed", phase: delay ? "retry_pending" : "failed_final", error_code: code, updated_at: new Date().toISOString() }).eq("source_message_id", sourceMessageId);
      await client.from("whatsapp_conversations").update({ ai_status: "error", ai_error_code: code, ai_source_message_id: sourceMessageId, ai_next_action: delay ? "Reintento técnico programado" : "Incidencia técnica: revisión en el panel", agent_due_at: delay ? new Date(Date.now() + delay).toISOString() : null }).eq("id", conversationId).eq("last_inbound_at", initialInboundAt);
      return;
    } else {
      const now = new Date();
      const analysis = decision.analysis;
      const analysisUpdate = { ai_status: "completed", ai_error_code: null, ai_source_message_id: sourceMessageId, ai_model: gateway.model, ai_analyzed_at: now.toISOString(), ai_summary: analysis.summary, ai_intent: analysis.intent, ai_sentiment: analysis.sentiment, ai_next_action: analysis.next_action, ai_confidence: null, agent_context: decision.memory, agent_stage: allowedAgentStage(decision.stage), updated_at: now.toISOString() };
      await client.from("whatsapp_conversations").update(analysisUpdate).eq("id", conversationId).eq("last_inbound_at", initialInboundAt);
      if (decision.action === "handoff") {
        await createHandoff(client, context.conversation, source.id, decision.handoff_kind || "general", decision.operator_question || "Revisa la conversación y recomienda la mejor respuesta.");
        if (decision.reply) {
          sendAttempted = true;
          await client.from("amanda_agent_runs").update({ phase: "sending" }).eq("source_message_id", sourceMessageId);
          await storeOutbound(client, context.conversation, decision.reply, "amanda");
        }
      } else if (decision.action === "reply" && decision.reply) {
        sendAttempted = true;
        await client.from("amanda_agent_runs").update({ phase: "sending" }).eq("source_message_id", sourceMessageId);
        await storeOutbound(client, context.conversation, decision.reply, "amanda");
        await client.from("whatsapp_conversations").update({ agent_intro_sent_at: context.conversation.agent_intro_sent_at || now.toISOString(), agent_follow_up_at: decision.follow_up_in_minutes ? new Date(now.getTime() + decision.follow_up_in_minutes * 60_000).toISOString() : null, agent_follow_up_attempts: 0, agent_follow_up_source_message_id: decision.follow_up_in_minutes ? sourceMessageId : null }).eq("id", conversationId).eq("last_inbound_at", initialInboundAt);
        await client.from("whatsapp_conversations").update({ status: "esperando_cliente" }).eq("id", conversationId).eq("last_inbound_at", initialInboundAt).is("status_manual_at", null);
      }
    }
    await client.from("amanda_agent_runs").update({ status: "done", phase: "done", updated_at: new Date().toISOString() }).eq("source_message_id", sourceMessageId);
  } catch {
    const delay = sendAttempted || !sourceMessageId ? null : gatewayRetryDelay("processing_failed", attempt);
    if (sourceMessageId) await client.from("amanda_agent_runs").update({ status: "failed", phase: sendAttempted ? "send_unconfirmed" : delay ? "retry_pending" : "failed_final", error_code: sendAttempted ? "send_unconfirmed" : "processing_failed", updated_at: new Date().toISOString() }).eq("source_message_id", sourceMessageId);
    let failed = client.from("whatsapp_conversations").update({ ai_status: "error", ai_error_code: sendAttempted ? "send_unconfirmed" : "processing_failed", agent_due_at: delay ? new Date(Date.now() + delay).toISOString() : null }).eq("id", conversationId);
    if (initialInboundAt) failed = failed.eq("last_inbound_at", initialInboundAt);
    await failed;
  } finally {
    if (initialInboundAt) await client.from("whatsapp_conversations").update({ agent_due_at: null }).eq("id", conversationId).eq("last_inbound_at", initialInboundAt).lte("agent_due_at", new Date().toISOString());
    if (processingUntil) await client.from("whatsapp_conversations").update({ agent_processing_until: null }).eq("id", conversationId).eq("agent_processing_until", processingUntil);
  }
}

async function applyOperatorGuidance(client: Client, handoffId: string, oidcToken?: string | null) {
  const claim = await client.from("amanda_handoffs").update({ application_status: "processing", guidance_due_at: new Date(Date.now() + 90_000).toISOString() }).eq("id", handoffId).eq("status", "pending").eq("application_status", "pending").not("operator_guidance", "is", null).select("*").maybeSingle();
  const handoff = claim.data;
  if (claim.error || !handoff?.operator_guidance) return;
  const attempt = (handoff.guidance_attempt_count || 0) + 1;
  await client.from("amanda_handoffs").update({ guidance_attempt_count: attempt }).eq("id", handoff.id);
  const leaseUntil = new Date(Date.now() + 180_000).toISOString();
  const lease = await client.from("whatsapp_conversations").update({ agent_processing_until: leaseUntil }).eq("id", handoff.conversation_id).or(`agent_processing_until.is.null,agent_processing_until.lt.${new Date().toISOString()}`).select("id").maybeSingle();
  if (lease.error || !lease.data) {
    await client.from("amanda_handoffs").update({ application_status: "pending", guidance_due_at: new Date(Date.now() + 15_000).toISOString(), guidance_error_code: lease.error ? "conversation_claim_failed" : null }).eq("id", handoff.id).eq("application_status", "processing");
    return;
  }
  try {
    const context = await contextFor(client, String(handoff.conversation_id));
    if (!context) throw new Error("context_unavailable");
    const conversation = context.conversation;
    if (!amandaEnabledForPhone(String(conversation.normalized_phone || ""))) {
      await client.from("amanda_handoffs").update({ application_status: "pending", guidance_due_at: null, guidance_error_code: "outside_pilot" }).eq("id", handoff.id).eq("application_status", "processing");
      return;
    }
    if (conversation.automation_mode !== "autonomous") {
      await client.from("amanda_handoffs").update({ status: "resolved", application_status: "not_applied", guidance_due_at: null, resolved_at: new Date().toISOString() }).eq("id", handoff.id).eq("application_status", "processing");
      return;
    }
    if (!conversation.last_inbound_at || Date.now() - new Date(String(conversation.last_inbound_at)).getTime() > serviceWindowMs) {
      await client.from("amanda_handoffs").update({ application_status: "pending", guidance_due_at: null, guidance_error_code: "outside_service_window" }).eq("id", handoff.id).eq("application_status", "processing");
      return;
    }
    const orderResult = handoff.kind === "payment_link"
      ? await client.from("amanda_manual_orders").select("reference,summary,amount_cop,payment_method,payment_destination,status").eq("handoff_id", handoff.id).maybeSingle()
      : handoff.kind === "payment_verification"
        ? await client.from("amanda_manual_orders").select("reference,summary,amount_cop,payment_method,payment_destination,status,proof_message_id,verified_at").eq("conversation_id", handoff.conversation_id).eq("proof_message_id", handoff.source_message_id).maybeSingle()
        : null;
    if (orderResult?.error) throw new Error("payment_order_lookup_failed");
    const order = (orderResult?.data || null) as { reference: string; summary: string; amount_cop: number; payment_method: string; payment_destination: string; status: string; proof_message_id?: string | null; verified_at?: string | null } | null;
    if (!paymentHandoffApproved(handoff.kind, order, handoff.source_message_id)) {
      await client.from("amanda_handoffs").update({ application_status: "pending", guidance_due_at: null, guidance_error_code: handoff.kind === "payment_link" ? "payment_order_approval_required" : "payment_verification_required" }).eq("id", handoff.id).eq("application_status", "processing");
      return;
    }
    const quoteResult = handoff.kind === "shipping_quote"
      ? await client.from("amanda_shipping_quotes").select("destination,item_summary,amount_cop,delivery_estimate,conditions,source_last_inbound_at,expires_at,order_id").eq("handoff_id", handoff.id).maybeSingle()
      : null;
    if (quoteResult?.error) throw new Error("shipping_quote_lookup_failed");
    const quote = (quoteResult?.data || null) as ShippingQuote | null;
    if (handoff.kind === "shipping_quote") {
      const sourceInContext = context.messages.find((item) => item.id === handoff.source_message_id);
      const sourceLookup = sourceInContext ? null : await client.from("whatsapp_messages").select("created_at").eq("id", handoff.source_message_id).eq("conversation_id", handoff.conversation_id).maybeSingle();
      const sourceAt = sourceInContext?.created_at || sourceLookup?.data?.created_at;
      if (sourceLookup?.error || !sourceAt) {
        await client.from("amanda_handoffs").update({ application_status: "pending", guidance_due_at: null, guidance_error_code: "shipping_context_unverified" }).eq("id", handoff.id).eq("application_status", "processing");
        return;
      }
      const laterLookup = sourceInContext ? null : await client.from("whatsapp_messages").select("body,media_caption,message_type,created_at,direction").eq("conversation_id", handoff.conversation_id).eq("direction", "inbound").is("deleted_at", null).gt("created_at", sourceAt).order("created_at", { ascending: true }).limit(31);
      if (laterLookup?.error || (laterLookup?.data?.length || 0) > 30) {
        await client.from("amanda_handoffs").update({ application_status: "pending", guidance_due_at: null, guidance_error_code: "shipping_context_unverified" }).eq("id", handoff.id).eq("application_status", "processing");
        return;
      }
      const laterMessages = laterLookup?.data || context.messages.filter((item) => item.direction === "inbound" && Date.parse(item.created_at) > Date.parse(sourceAt));
      if (laterMessages.length) {
      const auth = gatewayAuth(oidcToken);
      const relevance = await gatewayJson({ schema: quoteRelevanceSchema, system: "Determina si la orientación de envío sigue aplicando a la solicitud tras mensajes posteriores del cliente. Un saludo, «Ok», «gracias» o «quedo pendiente» NO la invalida. Un cambio de producto/destino, cancelación o petición de detener el proceso SÍ la invalida. Si no hay información suficiente, responde current=false. Devuelve JSON con current y reason.", user: JSON.stringify({ solicitud: handoff.question, orientacion: handoff.operator_guidance, cotizacion_aprobada: quote ? { producto: quote.item_summary, destino: quote.destination } : null, mensajes_posteriores: laterMessages }), token: auth.token, authMode: auth.authMode, model: process.env.AI_GATEWAY_MODEL || defaultAgentModel, budget: gatewayBudget(client, "operator") });
      if (!relevance.value) {
        await client.from("amanda_handoffs").update({ application_status: "pending", guidance_due_at: null, guidance_error_code: relevance.errorCode || "quote_relevance_unverified" }).eq("id", handoff.id).eq("application_status", "processing");
        return;
      }
      if (!relevance.value.current) {
        await client.from("amanda_handoffs").update({ status: "resolved", application_status: "not_applied", guidance_due_at: null, guidance_error_code: "shipping_quote_stale", resolved_at: new Date().toISOString() }).eq("id", handoff.id).eq("application_status", "processing");
        return;
      }
      }
    }
    const latestOrder = quote ? await client.from("amanda_manual_orders").select("id,status").eq("conversation_id", handoff.conversation_id).order("created_at", { ascending: false }).limit(1).maybeSingle() : null;
    if (latestOrder?.error) throw new Error("shipping_order_lookup_failed");
    if (quote && (!shippingQuoteIsCurrent(quote, String(conversation.last_inbound_at || "")) || (latestOrder?.data?.id || null) !== quote.order_id || latestOrder?.data?.status === "cancelled")) {
      await client.from("amanda_handoffs").update({ status: "resolved", application_status: "not_applied", guidance_due_at: null, guidance_error_code: "shipping_quote_stale", resolved_at: new Date().toISOString() }).eq("id", handoff.id).eq("application_status", "processing");
      return;
    }
    const confirmedPayment = handoff.kind === "payment_verification" && order?.status === "paid";
    const guidance = handoff.kind === "payment_link" && order
      ? `Pedido ${order.reference}: ${order.summary}. Importe aprobado $${order.amount_cop.toLocaleString("es-CO")}. Medio ${order.payment_method}: ${order.payment_destination}. Solicita comprobante; no afirmes que el pago fue recibido.`
      : confirmedPayment && order
        ? `Pago verificado por una persona autorizada para el pedido ${order.reference} por $${order.amount_cop.toLocaleString("es-CO")}. Agradece y solicita solo los datos de envío faltantes; costo y plazo requieren cotización.`
        : quote
          ? shippingQuoteGuidance(quote)
        : handoff.kind === "shipping_quote"
          ? `Orientación preliminar, NO cotización confirmada: ${handoff.operator_guidance}. Si indicas monto o plazo, aclara que es aproximado y sujeto a confirmación para el destino y pedido actuales.`
          : handoff.operator_guidance;
    const system = operatorGuidanceSystem(liiraAgentBusiness, confirmedPayment);
    const auth = gatewayAuth(oidcToken);
    const drafted = await gatewayJson({ schema: guidanceSchema, system, user: JSON.stringify({ motivo: handoff.question, recomendacion_daniela: guidance, estado_actual: conversation.agent_stage, otros_pendientes: context.handoffs, conversacion: conversationTranscript(context.messages) }), token: auth.token, authMode: auth.authMode, model: process.env.AI_GATEWAY_MODEL || defaultAgentModel, budget: gatewayBudget(client, "operator") });
    if (!drafted.value) {
      const delay = gatewayRetryDelay(drafted.errorCode, attempt);
      await client.from("amanda_handoffs").update({ application_status: "pending", guidance_due_at: delay ? new Date(Date.now() + delay).toISOString() : null, guidance_error_code: drafted.errorCode || "invalid_model_output" }).eq("id", handoff.id).eq("application_status", "processing");
      return;
    }
    const stillCurrent = await client.from("whatsapp_conversations").select("automation_mode,last_inbound_at").eq("id", handoff.conversation_id).maybeSingle();
    if (stillCurrent.error || stillCurrent.data?.automation_mode !== "autonomous" || stillCurrent.data?.last_inbound_at !== conversation.last_inbound_at) {
      await client.from("amanda_handoffs").update({ application_status: "pending", guidance_due_at: new Date().toISOString(), guidance_error_code: "stale_context" }).eq("id", handoff.id).eq("application_status", "processing");
      return;
    }
    const orderBeforeSend = quote ? await client.from("amanda_manual_orders").select("id,status").eq("conversation_id", handoff.conversation_id).order("created_at", { ascending: false }).limit(1).maybeSingle() : null;
    if (orderBeforeSend?.error) throw new Error("shipping_order_recheck_failed");
    if (quote && (!shippingQuoteIsCurrent(quote, stillCurrent.data.last_inbound_at) || (orderBeforeSend?.data?.id || null) !== quote.order_id || orderBeforeSend?.data?.status === "cancelled")) {
      await client.from("amanda_handoffs").update({ status: "resolved", application_status: "not_applied", guidance_due_at: null, guidance_error_code: "shipping_quote_stale", resolved_at: new Date().toISOString() }).eq("id", handoff.id).eq("application_status", "processing");
      return;
    }
    if (drafted.value.action === "defer") {
      await client.from("amanda_handoffs").update({ application_status: "pending", guidance_due_at: null, guidance_error_code: null }).eq("id", handoff.id).eq("application_status", "processing");
      return;
    }
    if (drafted.value.action === "obsolete") {
      await client.from("amanda_handoffs").update({ status: "resolved", application_status: "not_applied", guidance_due_at: null, resolved_at: new Date().toISOString() }).eq("id", handoff.id).eq("application_status", "processing");
      return;
    }
    const base = liiraAgentBusiness.website.replace(/\/catalogo$/, "");
    const approvedUrls = [liiraAgentBusiness.website, `${base}/politicas/envios-y-cambios`, ...context.products.map((product) => `${base}/producto/${product.slug}`), ...(handoff.kind === "payment_link" && order?.payment_method === "link" ? [order.payment_destination] : [])];
    if (!drafted.value.reply || !supportedOperatorReply(drafted.value.reply, guidance, confirmedPayment, approvedUrls, handoff.kind === "shipping_quote" && !quote)
      || (handoff.kind === "shipping_quote" && !quote && !provisionalShippingReplyIsSafe(drafted.value.reply))) throw new Error("unsupported_operator_claim");
    await client.from("amanda_handoffs").update({ application_status: "sending", guidance_due_at: null }).eq("id", handoff.id).eq("application_status", "processing");
    try {
      await storeOutbound(client, conversation, drafted.value.reply, "amanda");
    } catch {
      await client.from("amanda_handoffs").update({ application_status: "send_unconfirmed", guidance_error_code: "send_unconfirmed" }).eq("id", handoff.id).eq("application_status", "sending");
      return;
    }
    const nextStage = handoff.kind === "payment_link" ? "awaiting_payment_proof" : confirmedPayment ? "collecting_shipping" : conversation.agent_stage;
    await client.from("amanda_handoffs").update({ status: "resolved", application_status: "applied", guidance_error_code: null, resolved_at: new Date().toISOString() }).eq("id", handoff.id).eq("application_status", "sending");
    await client.from("whatsapp_conversations").update({ agent_stage: nextStage, updated_at: new Date().toISOString() }).eq("id", handoff.conversation_id).eq("last_inbound_at", conversation.last_inbound_at);
    await client.from("whatsapp_conversations").update({ status: "esperando_cliente" }).eq("id", handoff.conversation_id).eq("last_inbound_at", conversation.last_inbound_at).is("status_manual_at", null);
  } catch {
    const delay = gatewayRetryDelay("processing_failed", attempt);
    await client.from("amanda_handoffs").update({ application_status: "pending", guidance_due_at: delay ? new Date(Date.now() + delay).toISOString() : null, guidance_error_code: "processing_failed" }).eq("id", handoff.id).eq("application_status", "processing");
  } finally {
    await client.from("whatsapp_conversations").update({ agent_processing_until: null }).eq("id", handoff.conversation_id).eq("agent_processing_until", leaseUntil);
  }
}

export async function persistAmandaOperatorInbound(message: { messageId: string; providerTimestamp: string | null; text: string | null; replyToMessageId?: string | null; phoneNumberId: string }) {
  const client = getSupabaseAdmin();
  if (!client) throw new Error("database_unavailable");
  const seconds = Number(message.providerTimestamp);
  const timestamp = message.providerTimestamp && Number.isFinite(seconds) && seconds > 0 && seconds < 4_102_444_800 ? new Date(seconds * 1000).toISOString() : null;
  const stored = await client.from("amanda_operator_messages").insert({ provider_message_id: message.messageId, direction: "inbound", body: message.text, provider_timestamp: timestamp, reply_to_provider_message_id: message.replyToMessageId || null, phone_number_id: message.phoneNumberId, processed_at: null }).select("id").single();
  if (stored.error?.code === "23505") return null;
  if (stored.error || !stored.data) throw new Error("operator_inbound_persist_failed");
  return stored.data.id as string;
}

async function sendOperatorDetails(client: Client, handoff: Record<string, unknown>, customerName: string) {
  const messages = await client.from("whatsapp_messages").select("body,media_caption,message_type").eq("conversation_id", handoff.conversation_id).eq("direction", "inbound").is("deleted_at", null).order("created_at", { ascending: false }).limit(5);
  if (messages.error) throw new Error("operator_details_unavailable");
  const recent = [...(messages.data || [])].reverse().map((item) => item.body || item.media_caption || `[${item.message_type}]`);
  const body = `Solicitud ${handoff.code} · ${customerName}\n${String(handoff.question).slice(0, 750)}\n${recent.length ? `Mensajes recientes del cliente:\n${recent.map((item) => `• ${item.slice(0, 120)}`).join("\n")}\n` : ""}Responde a este mensaje con tu orientación. Si necesitas barrio o dirección exacta para confirmar un envío, indícalo; no supongas datos no proporcionados.`;
  const providerMessageId = await sendMetaText(operatorPhone(), body);
  const saved = await client.from("amanda_operator_messages").insert({ provider_message_id: providerMessageId, direction: "outbound", handoff_id: handoff.id, body, delivery_status: "accepted" });
  if (saved.error) throw new Error("operator_details_send_unconfirmed");
}

export async function handleAmandaOperatorInbound(messageId: string, oidcToken?: string | null) {
  const client = getSupabaseAdmin();
  if (!client || process.env.AMANDA_ENABLED !== "true") return;
  const leaseUntil = new Date(Date.now() + 180_000).toISOString();
  const claimed = await client.from("amanda_operator_messages").update({ processing_until: leaseUntil, processing_error_code: null })
    .eq("id", messageId).eq("direction", "inbound").is("processed_at", null)
    .or(`processing_until.is.null,processing_until.lt.${new Date().toISOString()}`)
    .select("id,body,reply_to_provider_message_id").maybeSingle();
  if (claimed.error || !claimed.data) return;
  const message = claimed.data;
  let detailSendAttempted = false;
  try {
    if (!message.body) {
      const empty = await client.from("amanda_operator_messages").update({ processed_at: new Date().toISOString(), processing_until: null }).eq("id", messageId).eq("processing_until", leaseUntil);
      if (empty.error) throw new Error("operator_inbound_finish_failed");
      return;
    }
  const quoted = message.reply_to_provider_message_id ? await client.from("amanda_operator_messages").select("body,handoff_id").eq("provider_message_id", message.reply_to_provider_message_id).maybeSingle() : null;
  if (quoted?.error) throw new Error("quoted_operator_message_unavailable");
  const reference = operatorCaseReference(message.body, quoted?.data || null);
  const named = !reference.handoffId && !reference.code && !reference.conflict ? await client.from("amanda_handoffs").select("id,code,kind,question,created_at,conversation:whatsapp_conversations(customer:customers(name))").eq("status", "pending").order("created_at", { ascending: false }).limit(100) : null;
  if (named?.error) throw new Error("operator_case_lookup_failed");
  const namedId = !named?.error && named?.data ? handoffNamedInMessage(message.body, named.data.map((item) => {
    const conversation = item.conversation as unknown as { customer?: { name?: string } } | null;
    return { id: item.id, customerName: conversation?.customer?.name || null };
  })) : null;
  let caseId = reference.handoffId || namedId;
  if (!reference.conflict && !reference.code && !caseId && named?.data?.length) {
    const candidates = named.data.slice(0, 30).map((item) => ({ id: item.id, code: item.code, kind: item.kind, question: item.question, created_at: item.created_at, customer: (item.conversation as unknown as { customer?: { name?: string } } | null)?.customer?.name || null }));
    const auth = gatewayAuth(oidcToken);
    const matched = await gatewayJson({ schema: operatorMatchSchema, system: "Identifica una solicitud ABIERTA a partir del mensaje de la operadora y los datos del caso. Devuelve case_id solo si existe una correspondencia inequívoca por tema, producto, destino o cliente; con dos casos plausibles o datos insuficientes devuelve null. Nunca adivines un cliente por su nombre compartido. Devuelve JSON con case_id.", user: JSON.stringify({ mensaje: message.body, solicitudes: candidates }), token: auth.token, authMode: auth.authMode, model: process.env.AI_GATEWAY_MODEL || defaultAgentModel, budget: gatewayBudget(client, "operator") });
    if (candidates.some((item) => item.id === matched.value?.case_id)) caseId = matched.value!.case_id;
  }
  const handoffResult = !reference.conflict && (reference.code || caseId) ? await client.from("amanda_handoffs").select("*, conversation:whatsapp_conversations(*, customer:customers(name))").eq("status", "pending").eq(reference.code && !reference.handoffId ? "code" : "id", reference.code && !reference.handoffId ? reference.code : caseId).maybeSingle() : null;
  if (handoffResult?.error) throw new Error("operator_case_lookup_failed");
  const handoff = handoffResult?.data || null;
  if (!handoff) {
    const unmatched = await client.from("amanda_operator_messages").update({ processed_at: new Date().toISOString(), processing_until: null, processing_error_code: "unmatched_case" }).eq("id", messageId).eq("processing_until", leaseUntil);
    if (unmatched.error) throw new Error("operator_inbound_finish_failed");
    const queued = await client.from("amanda_handoffs").select("id,code,kind,question,operator_delivery_status,conversation:whatsapp_conversations(customer:customers(name),normalized_phone)").eq("status", "pending").eq("operator_delivery_status", "queued").order("created_at", { ascending: true }).limit(10);
    for (const item of queued.data || []) {
      const conversation = item.conversation as unknown as { normalized_phone?: string; customer?: { name?: string } } | null;
      await notifyOperator(client, item, conversation?.customer?.name || conversation?.normalized_phone || "Cliente");
    }
    const body = "No pude identificar con seguridad la consulta. ¿De qué cliente y tema se trata? También puedes responder directamente al aviso o al detalle de esa solicitud.";
    const providerMessageId = await sendMetaText(operatorPhone(), body);
    await client.from("amanda_operator_messages").insert({ provider_message_id: providerMessageId, direction: "outbound", body, delivery_status: "accepted" });
    return;
  }
  const customer = handoff.conversation?.customer;
  const customerName = customer?.name || String(handoff.conversation?.normalized_phone || "Cliente");
  const auth = gatewayAuth(oidcToken);
  const intent = await gatewayJson({ schema: operatorMessageSchema, system: "Clasifica el mensaje de la operadora de Liira. 'details' si pregunta por más contexto o datos del caso; 'guidance' si aporta una orientación, decisión, precio, plazo o instrucción para responder al cliente. No confundas una pregunta sobre el caso con una cotización. Devuelve JSON con action.", user: JSON.stringify({ solicitud: handoff.question, respuesta: message.body, mensaje_citado: quoted?.data?.body || null }), token: auth.token, authMode: auth.authMode, model: process.env.AI_GATEWAY_MODEL || defaultAgentModel, budget: gatewayBudget(client, "operator") });
  if (!intent.value) {
    await client.from("amanda_operator_messages").update({ processing_until: new Date(Date.now() + 300_000).toISOString(), processing_error_code: intent.errorCode || "operator_intent_unavailable" }).eq("id", messageId).eq("processing_until", leaseUntil).is("processed_at", null);
    return;
  }
  if (intent.value.action === "details") {
    detailSendAttempted = true;
    await sendOperatorDetails(client, handoff, customerName);
    const detailed = await client.from("amanda_operator_messages").update({ processed_at: new Date().toISOString(), processing_until: null, processing_error_code: intent.errorCode || null, handoff_id: handoff.id }).eq("id", messageId).eq("processing_until", leaseUntil);
    if (detailed.error) throw new Error("operator_inbound_finish_failed");
    return;
  }
  const guidance = message.body.replace(new RegExp(handoff.code, "i"), "").replace(/^\s*[:\-]\s*/, "").trim();
  if (guidance.length < 2) {
    const empty = await client.from("amanda_operator_messages").update({ processed_at: new Date().toISOString(), processing_until: null, processing_error_code: "empty_guidance" }).eq("id", messageId).eq("processing_until", leaseUntil);
    if (empty.error) throw new Error("operator_inbound_finish_failed");
    return;
  }
  const updated = await client.from("amanda_handoffs").update({ operator_guidance: guidance, guidance_due_at: new Date().toISOString(), guidance_error_code: null }).eq("id", handoff.id).eq("status", "pending").select("id").maybeSingle();
  if (updated.error || !updated.data) throw new Error("operator_guidance_store_failed");
  const finished = await client.from("amanda_operator_messages").update({ processed_at: new Date().toISOString(), processing_until: null, handoff_id: handoff.id }).eq("id", messageId).eq("processing_until", leaseUntil);
  if (finished.error) throw new Error("operator_inbound_finish_failed");
  await applyOperatorGuidance(client, handoff.id, oidcToken);
  } catch {
    await client.from("amanda_operator_messages").update(detailSendAttempted
      ? { processed_at: new Date().toISOString(), processing_until: null, processing_error_code: "detail_send_unconfirmed" }
      : { processing_until: new Date(Date.now() + 60_000).toISOString(), processing_error_code: "processing_failed" }
    ).eq("id", messageId).eq("processing_until", leaseUntil).is("processed_at", null);
  }
}

export async function runDueAmandaFollowups(oidcToken?: string | null) {
  const client = getSupabaseAdmin();
  if (!client || process.env.AMANDA_ENABLED !== "true") return 0;
  const unprocessedOperator = await client.from("amanda_operator_messages").select("id").eq("direction", "inbound").is("processed_at", null).or(`processing_until.is.null,processing_until.lt.${new Date().toISOString()}`).order("created_at", { ascending: true }).limit(10);
  for (const message of unprocessedOperator.data || []) await handleAmandaOperatorInbound(message.id, oidcToken);
  await client.from("amanda_handoffs").update({ application_status: "pending" }).eq("status", "pending").eq("application_status", "processing").lte("guidance_due_at", new Date().toISOString());
  const guided = await client.from("amanda_handoffs").select("id").eq("status", "pending").eq("application_status", "pending").not("operator_guidance", "is", null).lte("guidance_due_at", new Date().toISOString()).order("guidance_due_at", { ascending: true }).limit(4);
  for (const item of guided.data || []) await applyOperatorGuidance(client, item.id, oidcToken);
  const queuedConversations = await client.from("whatsapp_conversations").select("id").eq("automation_mode", "autonomous").is("deleted_at", null).lte("agent_due_at", new Date().toISOString()).order("agent_due_at", { ascending: true }).limit(4);
  await Promise.allSettled((queuedConversations.data || []).map((item) => runAmandaForInbound(item.id, oidcToken)));
  const previouslyAccepted = await client.from("amanda_handoffs").select("id,code,kind,question,conversation:whatsapp_conversations(normalized_phone,customer:customers(name))").eq("status", "pending").eq("operator_delivery_status", "sent").order("created_at", { ascending: true }).limit(10);
  for (const item of previouslyAccepted.data || []) {
    const attempts = await client.from("amanda_operator_messages").select("body,delivery_status").ilike("body", `%${item.code}%`).order("created_at", { ascending: false }).limit(5);
    if (!attempts.error && shouldRetryOperatorAlert(attempts.data || [])) {
      await client.from("amanda_handoffs").update({ operator_delivery_status: "queued" }).eq("id", item.id).eq("operator_delivery_status", "sent");
    }
  }
  const queued = await client.from("amanda_handoffs").select("id,code,kind,question,conversation:whatsapp_conversations(normalized_phone,customer:customers(name))").eq("status", "pending").eq("operator_delivery_status", "queued").order("created_at", { ascending: true }).limit(10);
  for (const item of queued.data || []) {
    const conversation = item.conversation as unknown as { normalized_phone?: string; customer?: { name?: string } } | null;
    await notifyOperator(client, item, conversation?.customer?.name || conversation?.normalized_phone || "Cliente");
  }
  const due = await client.from("whatsapp_conversations").select("*, customer:customers(name)").eq("automation_mode", "autonomous").is("deleted_at", null).lte("agent_follow_up_at", new Date().toISOString()).limit(20);
  let sent = 0;
  for (const conversation of due.data || []) {
    if (!amandaEnabledForPhone(String(conversation.normalized_phone || ""))) {
      await client.from("whatsapp_conversations").update({ agent_follow_up_at: null }).eq("id", conversation.id).eq("agent_follow_up_at", conversation.agent_follow_up_at);
      continue;
    }
    const claimed = await client.from("whatsapp_conversations").update({ agent_follow_up_at: null }).eq("id", conversation.id).eq("agent_follow_up_at", conversation.agent_follow_up_at).select("id").maybeSingle();
    if (claimed.error || !claimed.data) continue;
    const latest = await client.from("whatsapp_messages").select("direction,body,created_at").eq("conversation_id", conversation.id).is("deleted_at", null).order("created_at", { ascending: false }).limit(4);
    if (!latest.data?.length || latest.data[0].direction !== "outbound" || !conversation.last_inbound_at || Date.now() - new Date(conversation.last_inbound_at).getTime() > serviceWindowMs) {
      await client.from("whatsapp_conversations").update({ agent_follow_up_at: null }).eq("id", conversation.id);
      continue;
    }
    const auth = gatewayAuth(oidcToken);
    const drafted = await gatewayJson({ schema: replySchema, system: "Eres Amanda de Liira. Escribe un único seguimiento breve, cálido y sin presión. Retoma la pregunta pendiente, ofrece ayuda y no inventes información. Devuelve JSON con reply.", user: JSON.stringify({ cliente: conversation.customer, ultimos_mensajes: latest.data }), token: auth.token, authMode: auth.authMode, model: process.env.AI_GATEWAY_MODEL || defaultAgentModel, budget: gatewayBudget(client, "background") });
    if (!drafted.value?.reply) {
      const attempt = (conversation.agent_follow_up_attempts || 0) + 1;
      const delay = gatewayRetryDelay(drafted.errorCode, attempt);
      await client.from("whatsapp_conversations").update({ agent_follow_up_attempts: attempt, agent_follow_up_at: delay ? new Date(Date.now() + delay).toISOString() : null, ai_error_code: drafted.errorCode }).eq("id", conversation.id);
      continue;
    }
    try {
      await storeOutbound(client, conversation, drafted.value.reply, "amanda");
      sent += 1;
      await client.from("whatsapp_conversations").update({ agent_follow_up_at: null, agent_follow_up_attempts: 0, agent_last_nudge_at: new Date().toISOString() }).eq("id", conversation.id);
    } catch {
      await client.from("whatsapp_conversations").update({ agent_follow_up_at: null, ai_error_code: "follow_up_send_unconfirmed" }).eq("id", conversation.id);
    }
  }
  return sent;
}
