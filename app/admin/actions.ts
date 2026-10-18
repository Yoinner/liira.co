"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { clearAdminSession, requireAdmin } from "@/lib/auth/session";
import { safeGeneralRule } from "@/lib/agent-core/knowledge";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { customerUpdateSchema, inquiryUpdateSchema, normalizePhone, parseTags } from "@/lib/validation/crm";
import { hasDependents, matchesDeletionConfirmation } from "@/lib/validation/deletion";
import { inspectOutboundMedia } from "@/lib/whatsapp/outbound-media";
import { approvedPaymentUrl, paymentLinkHosts } from "@/lib/whatsapp/payment-safety";
import { analyzeWhatsAppConversation } from "@/lib/whatsapp/classify";
import { sendMetaContactTemplate, sendMetaMedia, uploadMetaMedia } from "@/lib/whatsapp/meta";

function slugify(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function optionalNumber(value: FormDataEntryValue | null) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function optionalText(value: FormDataEntryValue | null, max = 1000) {
  const text = String(value || "").trim();
  return text ? text.slice(0, max) : null;
}

function bogotaDateTime(value: FormDataEntryValue | null) {
  const text = String(value || "").trim();
  if (!text) return null;
  const parsed = new Date(`${text}:00-05:00`);
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString();
}

async function writeAudit(client: NonNullable<ReturnType<typeof getSupabaseAdmin>>, action: string, entityType: string, entityId: string | null, actorRole: string, metadata: Record<string, unknown> = {}) {
  await client.from("audit_events").insert({ action, entity_type: entityType, entity_id: entityId, metadata: { ...metadata, actor_role: actorRole } });
}

export async function logoutAction() {
  await clearAdminSession();
  redirect("/admin/login");
}

export async function saveCategory(formData: FormData) {
  const session = await requireAdmin("business");
  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase no está disponible");
  const name = String(formData.get("name") || "").trim();
  if (name.length < 2 || name.length > 80) throw new Error("El nombre debe tener entre 2 y 80 caracteres");
  const id = String(formData.get("id") || "");
  const existing = id
    ? await client.from("categories").select("name,slug").eq("id", id).maybeSingle()
    : null;
  if (id && (existing?.error || !existing?.data)) throw new Error("La categoría ya no está disponible");
  const sortOrder = Number(formData.get("sort_order") || 0);
  if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 10000) throw new Error("La posición no es válida");
  const cover = formData.get("image");
  if (cover instanceof File && cover.size > 0 && (!cover.type.startsWith("image/") || cover.size > 8 * 1024 * 1024)) {
    throw new Error("La imagen debe ser JPG, PNG o WebP y pesar máximo 8 MB");
  }
  const record = {
    name,
    slug: slugify(name),
    description: String(formData.get("description") || "").trim() || null,
    sort_order: sortOrder,
    active: formData.get("active") === "on",
  };
  const result = id ? await client.from("categories").update(record).eq("id", id) : await client.from("categories").insert(record);
  if (result.error) throw new Error("No se pudo guardar la categoría");
  const previousCoverPath = existing?.data ? `categories/${existing.data.slug}/cover` : null;
  const storagePath = `categories/${record.slug}/cover`;
  if (cover instanceof File && cover.size > 0) {
    const upload = await client.storage.from("products").upload(storagePath, await cover.arrayBuffer(), { contentType: cover.type, upsert: true });
    if (upload.error) throw new Error("No se pudo subir la imagen de la categoría");
    if (previousCoverPath && previousCoverPath !== storagePath) await client.storage.from("products").remove([previousCoverPath]);
  } else if (previousCoverPath && previousCoverPath !== storagePath) {
    const previousFolder = previousCoverPath.slice(0, previousCoverPath.lastIndexOf("/"));
    const previousFiles = await client.storage.from("products").list(previousFolder, { limit: 10, search: "cover" });
    if (previousFiles.error) throw new Error("No se pudo verificar la portada actual");
    if (previousFiles.data?.some((file) => file.name === "cover")) {
      const moved = await client.storage.from("products").move(previousCoverPath, storagePath);
      if (moved.error) throw new Error("No se pudo conservar la portada al cambiar el nombre");
    }
  }
  await writeAudit(client, id ? "category_updated" : "category_created", "category", id || null, session.role, { name, sort_order: sortOrder });
  revalidatePath("/admin/categorias");
  revalidatePath("/admin");
  revalidatePath("/catalogo");
  revalidatePath("/");
}

export async function deleteCategory(formData: FormData) {
  const session = await requireAdmin("business");
  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase no está disponible");
  const id = z.string().uuid().parse(formData.get("id"));
  const confirmation = z.string().trim().min(2).max(80).parse(formData.get("confirmation"));
  const [category, productCount] = await Promise.all([
    client.from("categories").select("name,slug").eq("id", id).maybeSingle(),
    client.from("products").select("id", { count: "exact", head: true }).eq("category_id", id),
  ]);
  if (category.error || !category.data) throw new Error("La categoría ya no existe");
  if (!matchesDeletionConfirmation(confirmation, category.data.name)) throw new Error("La confirmación no coincide con la categoría");
  if (productCount.error) throw new Error("No se pudo validar si la categoría contiene productos");
  if (hasDependents(productCount.count)) throw new Error("Mueve o elimina sus productos antes de borrar esta categoría");
  const removed = await client.from("categories").delete().eq("id", id);
  if (removed.error) throw new Error("No se pudo eliminar la categoría");
  await client.storage.from("products").remove([`categories/${category.data.slug}/cover`]);
  await writeAudit(client, "category_deleted", "category", id, session.role, { name: category.data.name });
  revalidatePath("/");
  revalidatePath("/catalogo");
  revalidatePath("/admin");
  revalidatePath("/admin/categorias");
  redirect("/admin/categorias?deleted=1");
}

export async function saveProduct(formData: FormData) {
  const session = await requireAdmin("business");
  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase no está disponible");

  const schema = z.object({
    name: z.string().trim().min(2).max(160),
    description: z.string().trim().max(2000).optional(),
    category_id: z.string().uuid().nullable(),
    price: z.number().nonnegative(),
    sale_price: z.number().nonnegative().nullable(),
    stock: z.number().int().nonnegative(),
  });
  const parsed = schema.safeParse({
    name: String(formData.get("name") || ""),
    description: String(formData.get("description") || ""),
    category_id: String(formData.get("category_id") || "") || null,
    price: Number(formData.get("price")),
    sale_price: optionalNumber(formData.get("sale_price")),
    stock: Number(formData.get("stock")),
  });
  if (!parsed.success) throw new Error("Revisa los datos del producto");
  if (parsed.data.sale_price && parsed.data.sale_price >= parsed.data.price) throw new Error("El precio rebajado debe ser menor al original");

  const id = String(formData.get("id") || "");
  const record = {
    ...parsed.data,
    description: parsed.data.description || null,
    slug: `${slugify(parsed.data.name)}-${id ? id.slice(0, 6) : randomUUID().slice(0, 6)}`,
    active: formData.get("active") === "on",
    featured: formData.get("featured") === "on",
    updated_at: new Date().toISOString(),
  };
  const existing = id ? await client.from("products").select("stock").eq("id", id).maybeSingle() : null;
  const result = id
    ? await client.from("products").update(record).eq("id", id).select("id").single()
    : await client.from("products").insert(record).select("id").single();
  if (result.error || !result.data) throw new Error("No se pudo guardar el producto");

  const productId = result.data.id as string;
  const files = formData.getAll("images").filter((entry): entry is File => entry instanceof File && entry.size > 0);
  for (const [index, file] of files.entries()) {
    if (!file.type.startsWith("image/") || file.size > 8 * 1024 * 1024) continue;
    const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const storagePath = `${productId}/${randomUUID()}.${extension}`;
    const upload = await client.storage.from("products").upload(storagePath, await file.arrayBuffer(), { contentType: file.type, upsert: false });
    if (upload.error) continue;
    const publicUrl = client.storage.from("products").getPublicUrl(storagePath).data.publicUrl;
    await client.from("product_images").insert({ product_id: productId, url: publicUrl, storage_path: storagePath, alt: `${parsed.data.name} hecho a mano por Liira`, sort_order: index });
  }

  const previousStock = Number(existing?.data?.stock ?? 0);
  const delta = parsed.data.stock - previousStock;
  if (delta !== 0) {
    await client.from("inventory_movements").insert({ product_id: productId, delta, balance_after: parsed.data.stock, reason: id ? "Ajuste desde edición de producto" : "Stock inicial", actor_role: session.role });
  }
  await writeAudit(client, id ? "product_updated" : "product_created", "product", productId, session.role, { name: parsed.data.name, stock: parsed.data.stock, active: record.active });

  revalidatePath("/");
  revalidatePath("/catalogo");
  revalidatePath("/admin/productos");
  redirect("/admin/productos?saved=1");
}

export async function deleteProduct(formData: FormData) {
  const session = await requireAdmin("business");
  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase no está disponible");
  const id = z.string().uuid().parse(formData.get("id"));
  const confirmation = z.string().trim().min(2).max(160).parse(formData.get("confirmation"));
  const product = await client.from("products").select("name,slug,images:product_images(storage_path)").eq("id", id).maybeSingle();
  if (product.error || !product.data) throw new Error("El producto ya no existe");
  if (!matchesDeletionConfirmation(confirmation, product.data.name)) throw new Error("La confirmación no coincide con el producto");
  const removed = await client.from("products").delete().eq("id", id);
  if (removed.error) throw new Error("No se pudo eliminar el producto");
  const storagePaths = (product.data.images || []).map((image: { storage_path: string | null }) => image.storage_path).filter((path): path is string => Boolean(path));
  if (storagePaths.length) await client.storage.from("products").remove(storagePaths);
  await writeAudit(client, "product_deleted", "product", id, session.role, { name: product.data.name });
  revalidatePath("/");
  revalidatePath("/catalogo");
  revalidatePath(`/producto/${product.data.slug}`);
  revalidatePath("/admin");
  revalidatePath("/admin/productos");
  redirect("/admin/productos?deleted=1");
}

export async function updateInquiry(formData: FormData) {
  const session = await requireAdmin("business");
  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase no está disponible");
  const parsed = inquiryUpdateSchema.safeParse({
    id: String(formData.get("id") || ""),
    stage: String(formData.get("stage") || "nuevo"),
    priority: String(formData.get("priority") || "normal"),
    saleAmount: optionalNumber(formData.get("sale_amount")),
    nextFollowUpAt: bogotaDateTime(formData.get("next_follow_up_at")),
    lostReason: optionalText(formData.get("lost_reason"), 300),
  });
  if (!parsed.success) throw new Error("Revisa el estado y el seguimiento de la solicitud");
  const { id, stage, priority, saleAmount, nextFollowUpAt, lostReason } = parsed.data;
  if (stage === "ganado" && (!saleAmount || saleAmount <= 0)) throw new Error("Indica el valor real de la venta");
  if (stage === "perdido" && !lostReason) throw new Error("Indica por qué no se cerró la venta");
  const current = await client.from("inquiries").select("customer_id,pipeline_stage,sold_at").eq("id", id).maybeSingle();
  if (current.error || !current.data) throw new Error("La solicitud ya no está disponible");
  const status = stage === "ganado" ? "vendido" : stage === "perdido" ? "no_vendido" : "contacto";
  const update = {
    pipeline_stage: stage,
    priority,
    status,
    sale_amount: stage === "ganado" ? saleAmount : null,
    sold_at: stage === "ganado" ? current.data.sold_at || new Date().toISOString() : null,
    next_follow_up_at: stage === "ganado" || stage === "perdido" ? null : nextFollowUpAt,
    lost_reason: stage === "perdido" ? lostReason : null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await client.from("inquiries").update(update).eq("id", id);
  if (error) throw new Error("No se pudo actualizar la solicitud");
  await client.from("customer_activities").insert({ customer_id: current.data.customer_id, inquiry_id: id, activity_type: "pipeline_changed", summary: `Etapa cambiada de ${current.data.pipeline_stage || "nuevo"} a ${stage}`, actor_role: session.role, metadata: { priority } });
  await writeAudit(client, "inquiry_updated", "inquiry", id, session.role, { stage, priority, status });
  revalidatePath("/admin");
  revalidatePath("/admin/solicitudes");
  revalidatePath("/admin/clientes");
  revalidatePath("/admin/analitica");
}

export async function updateCustomer(formData: FormData) {
  const session = await requireAdmin("business");
  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase no está disponible");
  const phone = optionalText(formData.get("phone"), 30);
  const parsed = customerUpdateSchema.safeParse({
    id: String(formData.get("id") || ""),
    name: String(formData.get("name") || ""),
    phone,
    email: optionalText(formData.get("email"), 160),
    instagramHandle: optionalText(formData.get("instagram_handle"), 80),
    city: optionalText(formData.get("city"), 100),
    preferences: optionalText(formData.get("preferences"), 1200),
    tags: parseTags(String(formData.get("tags") || "")),
    transactionalConsent: formData.get("transactional_consent") === "on",
    marketingConsent: formData.get("marketing_consent") === "on",
  });
  if (!parsed.success) throw new Error("Revisa los datos del cliente");
  const value = parsed.data;
  const { error } = await client.from("customers").update({
    name: value.name, phone: value.phone, normalized_phone: value.phone ? normalizePhone(value.phone) : null,
    email: value.email, instagram_handle: value.instagramHandle, city: value.city, preferences: value.preferences,
    tags: value.tags, transactional_consent: value.transactionalConsent, marketing_consent: value.marketingConsent,
    updated_at: new Date().toISOString(),
  }).eq("id", value.id);
  if (error) throw new Error("No se pudo actualizar el cliente");
  await writeAudit(client, "customer_updated", "customer", value.id, session.role, { tags: value.tags });
  revalidatePath(`/admin/clientes/${value.id}`);
  revalidatePath("/admin/clientes");
}

export async function addCustomerNote(formData: FormData) {
  const session = await requireAdmin("business");
  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase no está disponible");
  const customerId = z.string().uuid().parse(formData.get("customer_id"));
  const inquiryId = optionalText(formData.get("inquiry_id"), 36);
  const note = z.string().trim().min(2).max(2000).parse(formData.get("note"));
  const { error } = await client.from("customer_notes").insert({ customer_id: customerId, inquiry_id: inquiryId, note, created_by_role: session.role });
  if (error) throw new Error("No se pudo guardar la nota");
  await client.from("customer_activities").insert({ customer_id: customerId, inquiry_id: inquiryId, activity_type: "note_added", summary: "Se agregó una nota interna", actor_role: session.role });
  await writeAudit(client, "customer_note_added", "customer", customerId, session.role);
  revalidatePath(`/admin/clientes/${customerId}`);
}

export async function openWhatsAppConversation(formData: FormData) {
  const session = await requireAdmin("business");
  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase no está disponible");
  const parsed = z.object({
    phone: z.string().trim().min(10).max(30).transform(normalizePhone).refine((phone) => /^57[3]\d{9}$/.test(phone), "Ingresa un celular colombiano válido"),
    name: z.string().trim().max(100).optional(),
  }).parse({ phone: formData.get("phone"), name: formData.get("name") });

  let customer = await client.from("customers").select("id,name").eq("normalized_phone", parsed.phone).maybeSingle();
  if (customer.error) throw new Error("No se pudo verificar el contacto");
  if (!customer.data) {
    customer = await client.from("customers").insert({
      normalized_phone: parsed.phone,
      phone: `+${parsed.phone}`,
      name: parsed.name || `Contacto ${parsed.phone.slice(-4)}`,
      last_contact_at: new Date().toISOString(),
    }).select("id,name").single();
  } else if (parsed.name && customer.data.name !== parsed.name) {
    const renamed = await client.from("customers").update({ name: parsed.name, updated_at: new Date().toISOString() }).eq("id", customer.data.id);
    if (renamed.error) throw new Error("No se pudo actualizar el nombre del contacto");
  }
  if (customer.error || !customer.data) throw new Error("No se pudo crear el contacto");

  const existing = await client.from("whatsapp_conversations").select("id").eq("normalized_phone", parsed.phone).maybeSingle();
  if (existing.error) throw new Error("No se pudo verificar la conversación");
  let conversationId = existing.data?.id as string | undefined;
  if (conversationId) {
    const reopened = await client.from("whatsapp_conversations").update({ deleted_at: null, deleted_by_role: null, updated_at: new Date().toISOString() }).eq("id", conversationId);
    if (reopened.error) throw new Error("No se pudo abrir la conversación");
  } else {
    const created = await client.from("whatsapp_conversations").insert({ customer_id: customer.data.id, normalized_phone: parsed.phone }).select("id").single();
    if (created.error || !created.data) throw new Error("No se pudo crear la conversación");
    conversationId = created.data.id;
  }
  if (!conversationId) throw new Error("No se pudo abrir la conversación");
  await writeAudit(client, "whatsapp_conversation_opened", "whatsapp_conversation", conversationId, session.role, { normalized_phone: parsed.phone });
  revalidatePath("/admin/conversaciones");
  redirect(`/admin/conversaciones/${conversationId}`);
}

export async function updateWhatsAppConversation(formData: FormData) {
  const session = await requireAdmin("business");
  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase no está disponible");
  const parsed = z.object({
    id: z.string().uuid(),
    status: z.enum(["requiere_respuesta", "esperando_cliente", "cotizando", "cerrada_ganada", "cerrada_perdida"]),
  }).parse({ id: formData.get("id"), status: formData.get("status") });
  const updated = await client.from("whatsapp_conversations").update({ status: parsed.status, status_manual_at: new Date().toISOString(), unread_count: 0, updated_at: new Date().toISOString() }).eq("id", parsed.id);
  if (updated.error) throw new Error("No se pudo actualizar la conversación");
  await writeAudit(client, "whatsapp_conversation_updated", "whatsapp_conversation", parsed.id, session.role, { status: parsed.status });
  revalidatePath("/admin/conversaciones");
  revalidatePath(`/admin/conversaciones/${parsed.id}`);
}

export async function reanalyzeWhatsAppConversation(formData: FormData) {
  const session = await requireAdmin("business");
  const id = z.string().uuid().parse(formData.get("id"));
  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase no está disponible");
  const conversation = await client.from("whatsapp_conversations").select("id").eq("id", id).is("deleted_at", null).maybeSingle();
  if (conversation.error || !conversation.data) throw new Error("La conversación ya no está disponible");
  await analyzeWhatsAppConversation(id, null, true);
  await writeAudit(client, "whatsapp_conversation_reanalyzed", "whatsapp_conversation", id, session.role);
  revalidatePath(`/admin/conversaciones/${id}`);
}

export async function sendWhatsAppMessage(formData: FormData) {
  const session = await requireAdmin("business");
  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase no está disponible");
  const parsed = z.object({ id: z.string().uuid(), body: z.string().trim().min(1).max(2000) }).parse({ id: formData.get("id"), body: formData.get("body") });
  const conversation = await client.from("whatsapp_conversations").select("id,customer_id,normalized_phone,last_inbound_at").eq("id", parsed.id).maybeSingle();
  if (conversation.error || !conversation.data) throw new Error("La conversación ya no está disponible");
  const inboundAt = conversation.data.last_inbound_at ? new Date(conversation.data.last_inbound_at).getTime() : 0;
  if (!inboundAt || Date.now() - inboundAt > 24 * 60 * 60 * 1000) throw new Error("La ventana de atención terminó; usa una plantilla aprobada por Meta");
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!accessToken || !phoneNumberId) throw new Error("WhatsApp Cloud API no está configurado");
  const response = await fetch(`https://graph.facebook.com/${process.env.META_GRAPH_API_VERSION || "v26.0"}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: conversation.data.normalized_phone, type: "text", text: { preview_url: false, body: parsed.body } }),
  });
  const payload = await response.json() as { messages?: Array<{ id?: string }> };
  const providerMessageId = payload.messages?.[0]?.id;
  if (!response.ok || !providerMessageId) throw new Error("Meta no aceptó el mensaje");
  const now = new Date().toISOString();
  const stored = await client.from("whatsapp_messages").insert({ conversation_id: parsed.id, customer_id: conversation.data.customer_id, provider_message_id: providerMessageId, direction: "outbound", message_type: "text", body: parsed.body, delivery_status: "accepted" });
  if (stored.error) throw new Error("El mensaje fue aceptado por Meta, pero no se pudo registrar");
  await client.from("whatsapp_conversations").update({ status: "esperando_cliente", automation_mode: "human", agent_follow_up_at: null, unread_count: 0, last_message_at: now, last_outbound_at: now, updated_at: now }).eq("id", parsed.id);
  await client.from("customer_activities").insert({ customer_id: conversation.data.customer_id, activity_type: "whatsapp_outbound", summary: `Liira: ${parsed.body}`.slice(0, 300), actor_role: session.role, metadata: { provider_message_id: providerMessageId } });
  await writeAudit(client, "whatsapp_message_sent", "whatsapp_conversation", parsed.id, session.role, { provider_message_id: providerMessageId });
  revalidatePath("/admin/conversaciones");
  revalidatePath(`/admin/conversaciones/${parsed.id}`);
  revalidatePath(`/admin/clientes/${conversation.data.customer_id}`);
}

export async function sendWhatsAppMedia(formData: FormData) {
  const session = await requireAdmin("business");
  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase no está disponible");
  const parsed = z.object({ id: z.string().uuid(), caption: z.string().trim().max(1024) }).parse({ id: formData.get("id"), caption: String(formData.get("caption") || "") });
  const file = formData.get("file");
  if (!(file instanceof File) || !file.size) throw new Error("Selecciona una imagen o un video");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const media = inspectOutboundMedia(bytes, file.type);
  const conversation = await client.from("whatsapp_conversations").select("id,customer_id,normalized_phone,last_inbound_at").eq("id", parsed.id).is("deleted_at", null).maybeSingle();
  if (conversation.error || !conversation.data) throw new Error("La conversación ya no está disponible");
  const inboundAt = conversation.data.last_inbound_at ? new Date(conversation.data.last_inbound_at).getTime() : 0;
  if (!inboundAt || Date.now() - inboundAt > 24 * 60 * 60 * 1000) throw new Error("La ventana de atención terminó; primero usa una plantilla aprobada por Meta");

  const storagePath = `outbound/${parsed.id}/${randomUUID()}.${media.extension}`;
  const storedFile = await client.storage.from("whatsapp-media").upload(storagePath, bytes, { contentType: media.mimeType, upsert: false });
  if (storedFile.error) throw new Error("No se pudo guardar el archivo");
  try {
    const mediaId = await uploadMetaMedia(bytes, media.mimeType, `liira.${media.extension}`);
    const providerMessageId = await sendMetaMedia(conversation.data.normalized_phone, media.kind, mediaId, parsed.caption || null);
    const now = new Date().toISOString();
    const message = await client.from("whatsapp_messages").insert({
      conversation_id: parsed.id,
      customer_id: conversation.data.customer_id,
      provider_message_id: providerMessageId,
      direction: "outbound",
      message_type: media.kind,
      body: null,
      media_id: mediaId,
      media_path: storagePath,
      media_mime_type: media.mimeType,
      media_caption: parsed.caption || null,
      delivery_status: "accepted",
      metadata: { actor: "operator", original_name: file.name.slice(0, 180) },
    });
    if (message.error) throw new Error("El archivo fue aceptado por Meta, pero no se pudo registrar");
    await client.from("whatsapp_conversations").update({ status: "esperando_cliente", automation_mode: "human", agent_follow_up_at: null, unread_count: 0, last_message_at: now, last_outbound_at: now, updated_at: now }).eq("id", parsed.id);
    await client.from("customer_activities").insert({ customer_id: conversation.data.customer_id, activity_type: "whatsapp_outbound_media", summary: `Liira envió ${media.kind === "image" ? "una imagen" : "un video"}${parsed.caption ? `: ${parsed.caption}` : ""}`.slice(0, 300), actor_role: session.role, metadata: { provider_message_id: providerMessageId, media_type: media.mimeType } });
    await writeAudit(client, "whatsapp_media_sent", "whatsapp_conversation", parsed.id, session.role, { provider_message_id: providerMessageId, media_type: media.mimeType, size: bytes.length });
  } catch (error) {
    await client.storage.from("whatsapp-media").remove([storagePath]);
    throw error;
  }
  revalidatePath("/admin/conversaciones");
  revalidatePath(`/admin/conversaciones/${parsed.id}`);
  revalidatePath(`/admin/clientes/${conversation.data.customer_id}`);
}

export async function sendWhatsAppContactTemplate(formData: FormData) {
  const session = await requireAdmin("business");
  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase no está disponible");
  const parsed = z.object({
    id: z.string().uuid(),
    idempotencyKey: z.string().uuid(),
    topic: z.string().trim().min(2).max(120),
    consent: z.literal("confirmed"),
  }).parse({ id: formData.get("id"), idempotencyKey: formData.get("idempotency_key"), topic: formData.get("topic"), consent: formData.get("consent") });
  const templateName = process.env.WHATSAPP_INIT_TEMPLATE_NAME;
  const language = process.env.WHATSAPP_INIT_TEMPLATE_LANGUAGE || "es_CO";
  if (!templateName) throw new Error("La plantilla inicial aún no está configurada");
  const conversation = await client.from("whatsapp_conversations").select("id,customer_id,normalized_phone,last_inbound_at,customer:customers(name)").eq("id", parsed.id).is("deleted_at", null).maybeSingle();
  if (conversation.error || !conversation.data) throw new Error("La conversación ya no está disponible");
  const inboundAt = conversation.data.last_inbound_at ? new Date(conversation.data.last_inbound_at).getTime() : 0;
  if (inboundAt && Date.now() - inboundAt <= 24 * 60 * 60 * 1000) throw new Error("La conversación está abierta; envía un mensaje normal");
  const recent = await client.from("whatsapp_template_sends").select("id,status").eq("conversation_id", parsed.id).in("status", ["pending", "accepted"]).gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()).limit(1).maybeSingle();
  if (recent.error) throw new Error("No se pudo validar el historial de plantillas");
  if (recent.data) throw new Error("Ya existe una plantilla enviada o en proceso durante las últimas 24 horas");
  const customer = conversation.data.customer as unknown as { name?: string } | null;
  const now = new Date().toISOString();
  const reservation = await client.from("whatsapp_template_sends").insert({
    idempotency_key: parsed.idempotencyKey,
    conversation_id: parsed.id,
    customer_id: conversation.data.customer_id,
    template_name: templateName,
    language,
    topic: parsed.topic,
    consent_version: "whatsapp_contact_v1",
    consent_source: "admin_attestation",
    consented_at: now,
    actor_role: session.role,
  }).select("id").maybeSingle();
  if (reservation.error || !reservation.data) {
    const duplicate = await client.from("whatsapp_template_sends").select("id,status").eq("idempotency_key", parsed.idempotencyKey).maybeSingle();
    if (duplicate.data) return;
    throw new Error("No se pudo reservar el envío seguro");
  }
  const consent = await client.from("customers").update({
    transactional_consent: true,
    whatsapp_consent_at: now,
    whatsapp_consent_source: "admin_attestation",
    whatsapp_consent_version: "whatsapp_contact_v1",
    updated_at: now,
  }).eq("id", conversation.data.customer_id);
  if (consent.error) {
    await client.from("whatsapp_template_sends").update({ status: "failed", error_code: "consent_store_failed", updated_at: new Date().toISOString() }).eq("id", reservation.data.id);
    throw new Error("No se pudo registrar el consentimiento");
  }
  let sent: Awaited<ReturnType<typeof sendMetaContactTemplate>>;
  try {
    sent = await sendMetaContactTemplate(conversation.data.normalized_phone, customer?.name || `Cliente ${conversation.data.normalized_phone.slice(-4)}`, parsed.topic);
  } catch (error) {
    await client.from("whatsapp_template_sends").update({ status: "failed", error_code: error instanceof Error ? error.message.slice(0, 80) : "unknown", updated_at: new Date().toISOString() }).eq("id", reservation.data.id);
    throw error;
  }
  await client.from("whatsapp_template_sends").update({ status: "accepted", provider_message_id: sent.messageId, updated_at: new Date().toISOString() }).eq("id", reservation.data.id);
  const stored = await client.from("whatsapp_messages").insert({
      conversation_id: parsed.id,
      customer_id: conversation.data.customer_id,
      provider_message_id: sent.messageId,
      direction: "outbound",
      message_type: "template",
      body: `Solicitud de contacto: ${parsed.topic}`,
      delivery_status: "accepted",
      metadata: { actor: "operator", template_name: sent.templateName, language, consent_version: "whatsapp_contact_v1" },
  });
  await client.from("whatsapp_conversations").update({ status: "esperando_cliente", automation_mode: "autonomous", unread_count: 0, last_message_at: now, last_outbound_at: now, updated_at: now }).eq("id", parsed.id);
  await client.from("customer_activities").insert({ customer_id: conversation.data.customer_id, activity_type: "whatsapp_template_sent", summary: `Plantilla de contacto enviada: ${parsed.topic}`.slice(0, 300), actor_role: session.role, metadata: { template_name: sent.templateName, consent_source: "admin_attestation", consent_version: "whatsapp_contact_v1" } });
  await writeAudit(client, stored.error ? "whatsapp_template_store_failed" : "whatsapp_template_sent", "whatsapp_conversation", parsed.id, session.role, { template_name: sent.templateName, provider_message_id: sent.messageId });
  revalidatePath("/admin/conversaciones");
  revalidatePath(`/admin/conversaciones/${parsed.id}`);
  revalidatePath(`/admin/clientes/${conversation.data.customer_id}`);
}

export async function updateAmandaMode(formData: FormData) {
  const session = await requireAdmin("business");
  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase no está disponible");
  const parsed = z.object({ id: z.string().uuid(), mode: z.enum(["autonomous", "paused", "human"]) }).parse({ id: formData.get("id"), mode: formData.get("mode") });
  const changes: { automation_mode: typeof parsed.mode; updated_at: string; agent_follow_up_at?: null; agent_due_at?: null } = { automation_mode: parsed.mode, updated_at: new Date().toISOString(), agent_due_at: null };
  if (parsed.mode !== "autonomous") changes.agent_follow_up_at = null;
  const result = await client.from("whatsapp_conversations").update(changes).eq("id", parsed.id);
  if (result.error) throw new Error("No se pudo cambiar el modo de Amanda");
  await writeAudit(client, "amanda_mode_updated", "whatsapp_conversation", parsed.id, session.role, { mode: parsed.mode });
  revalidatePath("/admin/conversaciones");
  revalidatePath(`/admin/conversaciones/${parsed.id}`);
}

export async function approveAmandaPaymentMethod(formData: FormData) {
  const session = await requireAdmin("business");
  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase no está disponible");
  const parsed = z.object({ method: z.enum(["nequi", "breb"]), recipient: z.string().trim().min(3).max(80), ownership: z.literal("confirmed"), disclosure: z.literal("approved") }).parse({
    method: formData.get("method"), recipient: formData.get("recipient"), ownership: formData.get("ownership"), disclosure: formData.get("disclosure"),
  });
  if (parsed.method === "nequi" && !/^3\d{9}$/.test(parsed.recipient)) throw new Error("Nequi requiere un número colombiano de diez dígitos");
  if (parsed.method === "breb" && !/^@[A-Za-z0-9._-]{3,30}$/.test(parsed.recipient)) throw new Error("La llave Bre-B debe comenzar por @ y tener un formato válido");
  const result = await client.rpc("approve_amanda_payment_method", { p_method: parsed.method, p_recipient: parsed.recipient, p_role: session.role });
  if (result.error) throw new Error("No se pudo aprobar este medio de pago");
  revalidatePath("/admin/pagos");
}

export async function approveAmandaManualOrder(formData: FormData) {
  const session = await requireAdmin("business");
  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase no está disponible");
  const parsed = z.object({ conversationId: z.string().uuid(), handoffId: z.string().uuid(), summary: z.string().trim().min(3).max(400), amount: z.coerce.number().int().positive().max(50_000_000), method: z.enum(["nequi", "breb", "link"]), link: z.string().trim().max(2000).optional(), confirmation: z.literal("approved") }).parse({
    conversationId: formData.get("conversationId"), handoffId: formData.get("handoffId"), summary: formData.get("summary"), amount: formData.get("amount"), method: formData.get("method"), link: formData.get("link"), confirmation: formData.get("confirmation"),
  });
  const method = parsed.method === "link" ? null : await client.from("amanda_payment_methods").select("recipient").eq("method", parsed.method).maybeSingle();
  const destination = parsed.method === "link" ? approvedPaymentUrl(parsed.link || "", paymentLinkHosts()) : method?.data?.recipient || null;
  if (!destination) throw new Error("El medio de pago no está aprobado; verifica titularidad, divulgación y dominio del proveedor");
  const result = await client.rpc("approve_amanda_manual_order", { p_conversation_id: parsed.conversationId, p_handoff_id: parsed.handoffId, p_summary: parsed.summary, p_amount_cop: parsed.amount, p_method: parsed.method, p_destination: destination, p_role: session.role });
  if (result.error || !result.data) throw new Error("No se pudo aprobar el pedido; revisa que el caso siga pendiente y no haya cambiado");
  revalidatePath(`/admin/conversaciones/${parsed.conversationId}`);
}

export async function verifyAmandaManualPayment(formData: FormData) {
  const session = await requireAdmin("business");
  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase no está disponible");
  const parsed = z.object({ conversationId: z.string().uuid(), handoffId: z.string().uuid(), orderId: z.string().uuid(), transactionReference: z.string().trim().min(6).max(120), confirmation: z.literal("funds_verified") }).parse({
    conversationId: formData.get("conversationId"), handoffId: formData.get("handoffId"), orderId: formData.get("orderId"), transactionReference: formData.get("transactionReference"), confirmation: formData.get("confirmation"),
  });
  const confirmed = await client.rpc("verify_amanda_manual_payment", { p_conversation_id: parsed.conversationId, p_handoff_id: parsed.handoffId, p_order_id: parsed.orderId, p_transaction_reference: parsed.transactionReference, p_role: session.role });
  if (confirmed.error || !confirmed.data) throw new Error("No se pudo verificar: comprueba pedido, referencia, fondos recibidos y comprobante no utilizado");
  revalidatePath(`/admin/conversaciones/${parsed.conversationId}`);
}

export async function approveAmandaShippingQuote(formData: FormData) {
  const session = await requireAdmin("business");
  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase no está disponible");
  const parsed = z.object({
    conversationId: z.string().uuid(), handoffId: z.string().uuid(), orderId: z.union([z.string().uuid(), z.literal("")]),
    destination: z.string().trim().min(3).max(200), itemSummary: z.string().trim().min(3).max(400),
    amount: z.string().regex(/^\d{1,7}$/).transform(Number).pipe(z.number().int().max(5_000_000)), deliveryEstimate: z.string().trim().min(3).max(160),
    conditions: z.string().trim().min(3).max(300), validHours: z.coerce.number().int().min(1).max(72),
    confirmation: z.literal("approved"),
  }).parse({ conversationId: formData.get("conversationId"), handoffId: formData.get("handoffId"), orderId: formData.get("orderId"), destination: formData.get("destination"), itemSummary: formData.get("itemSummary"), amount: formData.get("amount"), deliveryEstimate: formData.get("deliveryEstimate"), conditions: formData.get("conditions"), validHours: formData.get("validHours"), confirmation: formData.get("confirmation") });
  const result = await client.rpc("approve_amanda_shipping_quote", { p_conversation_id: parsed.conversationId, p_handoff_id: parsed.handoffId, p_order_id: parsed.orderId || null, p_destination: parsed.destination, p_item_summary: parsed.itemSummary, p_amount_cop: parsed.amount, p_delivery_estimate: parsed.deliveryEstimate, p_conditions: parsed.conditions, p_valid_hours: parsed.validHours, p_role: session.role });
  if (result.error || !result.data) throw new Error("No se pudo aprobar la cotización: comprueba el caso, destino y pedido asociado");
  revalidatePath(`/admin/conversaciones/${parsed.conversationId}`);
}

export async function cancelAmandaHandoff(formData: FormData) {
  const session = await requireAdmin("business");
  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase no está disponible");
  const parsed = z.object({ id: z.string().uuid(), conversationId: z.string().uuid() }).parse({ id: formData.get("id"), conversationId: formData.get("conversationId") });
  const cancelled = await client.from("amanda_handoffs").update({ status: "cancelled", resolved_at: new Date().toISOString() }).eq("id", parsed.id).eq("conversation_id", parsed.conversationId).eq("status", "pending").select("id").maybeSingle();
  if (cancelled.error || !cancelled.data) throw new Error("La alerta ya no está disponible");
  const remaining = await client.from("amanda_handoffs").select("id", { count: "exact", head: true }).eq("conversation_id", parsed.conversationId).eq("status", "pending");
  if (remaining.error) throw new Error("No se pudo comprobar el estado de Amanda");
  if (!remaining.count) await client.from("whatsapp_conversations").update({ updated_at: new Date().toISOString() }).eq("id", parsed.conversationId);
  await writeAudit(client, "amanda_handoff_cancelled", "amanda_handoff", parsed.id, session.role, { conversation_id: parsed.conversationId });
  revalidatePath(`/admin/conversaciones/${parsed.conversationId}`);
}

export async function retryAmandaOperatorAlert(formData: FormData) {
  const session = await requireAdmin("business");
  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase no está disponible");
  const parsed = z.object({ id: z.string().uuid(), conversationId: z.string().uuid(), confirmation: z.literal("checked") }).parse({
    id: formData.get("id"), conversationId: formData.get("conversationId"), confirmation: formData.get("confirmation"),
  });
  const requeued = await client.rpc("requeue_amanda_operator_alert", { p_handoff_id: parsed.id, p_conversation_id: parsed.conversationId, p_role: session.role });
  if (requeued.error || !requeued.data) throw new Error("No se pudo rearmar la alerta; comprueba el chat y que siga pendiente");
  revalidatePath(`/admin/conversaciones/${parsed.conversationId}`);
}

export async function approveAmandaKnowledge(formData: FormData) {
  const session = await requireAdmin("business");
  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase no está disponible");
  const parsed = z.object({ id: z.string().uuid(), conversationId: z.string().uuid(), confirmation: z.literal("approved") }).parse({ id: formData.get("id"), conversationId: formData.get("conversationId"), confirmation: formData.get("confirmation") });
  const rule = safeGeneralRule(String(formData.get("rule") || ""));
  if (!rule) throw new Error("Escribe una regla general de 20 a 500 caracteres sin teléfonos, correos, enlaces ni importes particulares");
  const source = await client.from("amanda_handoffs").select("id").eq("id", parsed.id).eq("conversation_id", parsed.conversationId).eq("status", "resolved").maybeSingle();
  if (source.error || !source.data) throw new Error("La orientación debe estar resuelta antes de aprobar una regla");
  const result = await client.from("amanda_knowledge").insert({ source_handoff_id: parsed.id, content: rule, approved_by_role: session.role }).select("id").single();
  if (result.error || !result.data) throw new Error("La regla ya existe o no pudo guardarse");
  await writeAudit(client, "amanda_knowledge_approved", "amanda_knowledge", result.data.id, session.role, { source_handoff_id: parsed.id });
  revalidatePath(`/admin/conversaciones/${parsed.conversationId}`);
}

export async function revokeAmandaKnowledge(formData: FormData) {
  const session = await requireAdmin("business");
  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase no está disponible");
  const parsed = z.object({ id: z.string().uuid(), conversationId: z.string().uuid() }).parse({ id: formData.get("id"), conversationId: formData.get("conversationId") });
  const rule = await client.from("amanda_knowledge").select("id,source_handoff_id").eq("id", parsed.id).eq("status", "approved").maybeSingle();
  if (rule.error || !rule.data) throw new Error("La regla ya no está activa");
  const source = await client.from("amanda_handoffs").select("id").eq("id", rule.data.source_handoff_id).eq("conversation_id", parsed.conversationId).maybeSingle();
  if (source.error || !source.data) throw new Error("La regla no pertenece a esta conversación");
  const result = await client.from("amanda_knowledge").update({ status: "revoked", revoked_by_role: session.role, revoked_at: new Date().toISOString() }).eq("id", parsed.id).eq("status", "approved").select("id").maybeSingle();
  if (result.error || !result.data) throw new Error("No se pudo revocar la regla");
  await writeAudit(client, "amanda_knowledge_revoked", "amanda_knowledge", parsed.id, session.role);
  revalidatePath(`/admin/conversaciones/${parsed.conversationId}`);
}

export async function deleteWhatsAppMessage(formData: FormData) {
  const session = await requireAdmin("business");
  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase no está disponible");
  const id = z.string().uuid().parse(formData.get("id"));
  const message = await client.from("whatsapp_messages").select("conversation_id,media_path,deleted_at").eq("id", id).maybeSingle();
  if (message.error || !message.data || message.data.deleted_at) throw new Error("El mensaje ya no está disponible");
  if (message.data.media_path) await client.storage.from("whatsapp-media").remove([message.data.media_path]);
  const result = await client.from("whatsapp_messages").update({ body: null, media_id: null, media_path: null, media_caption: null, deleted_at: new Date().toISOString(), deleted_by_role: session.role }).eq("id", id);
  if (result.error) throw new Error("No se pudo eliminar el mensaje del panel");
  await writeAudit(client, "whatsapp_message_deleted", "whatsapp_message", id, session.role, { conversation_id: message.data.conversation_id });
  revalidatePath(`/admin/conversaciones/${message.data.conversation_id}`);
}

export async function deleteWhatsAppConversation(formData: FormData) {
  const session = await requireAdmin("business");
  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase no está disponible");
  const id = z.string().uuid().parse(formData.get("id"));
  const result = await client.from("whatsapp_conversations").update({ deleted_at: new Date().toISOString(), deleted_by_role: session.role, automation_mode: "paused", agent_follow_up_at: null }).eq("id", id).is("deleted_at", null).select("id").maybeSingle();
  if (result.error || !result.data) throw new Error("La conversación ya no está disponible");
  await writeAudit(client, "whatsapp_conversation_deleted", "whatsapp_conversation", id, session.role);
  revalidatePath("/admin/conversaciones");
  redirect("/admin/conversaciones");
}

export async function adjustInventory(formData: FormData) {
  const session = await requireAdmin("business");
  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase no está disponible");
  const id = z.string().uuid().parse(formData.get("id"));
  const delta = z.number().int().min(-999).max(999).parse(Number(formData.get("delta")));
  const reason = z.string().trim().min(2).max(240).parse(formData.get("reason"));
  if (!delta) throw new Error("El ajuste no puede ser cero");
  const current = await client.from("products").select("stock,name").eq("id", id).maybeSingle();
  if (current.error || !current.data) throw new Error("Producto no encontrado");
  const balance = Number(current.data.stock) + delta;
  if (balance < 0) throw new Error("El stock no puede quedar negativo");
  const update = await client.from("products").update({ stock: balance, updated_at: new Date().toISOString() }).eq("id", id).eq("stock", current.data.stock).select("id").maybeSingle();
  if (update.error || !update.data) throw new Error("El inventario cambió mientras editabas. Recarga e intenta de nuevo");
  await client.from("inventory_movements").insert({ product_id: id, delta, balance_after: balance, reason, actor_role: session.role });
  await writeAudit(client, "inventory_adjusted", "product", id, session.role, { delta, balance, reason });
  revalidatePath("/admin/productos");
  revalidatePath("/admin");
  revalidatePath("/catalogo");
}

export async function deleteProductImage(formData: FormData) {
  const session = await requireAdmin("business");
  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase no está disponible");
  const imageId = z.string().uuid().parse(formData.get("image_id"));
  const image = await client.from("product_images").select("product_id,storage_path").eq("id", imageId).maybeSingle();
  if (image.error || !image.data) throw new Error("La imagen ya no existe");
  if (image.data.storage_path) await client.storage.from("products").remove([image.data.storage_path]);
  const result = await client.from("product_images").delete().eq("id", imageId);
  if (result.error) throw new Error("No se pudo eliminar la imagen");
  await writeAudit(client, "product_image_deleted", "product", image.data.product_id, session.role);
  revalidatePath("/admin/productos");
  revalidatePath("/catalogo");
  revalidatePath("/");
}

export async function makeProductImageCover(formData: FormData) {
  const session = await requireAdmin("business");
  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase no está disponible");
  const imageId = z.string().uuid().parse(formData.get("image_id"));
  const image = await client.from("product_images").select("product_id").eq("id", imageId).maybeSingle();
  if (image.error || !image.data) throw new Error("La imagen ya no existe");
  const rows = await client.from("product_images").select("id,sort_order").eq("product_id", image.data.product_id).order("sort_order");
  if (rows.error) throw new Error("No se pudo ordenar la galería");
  const ordered = (rows.data || []).sort((a, b) => a.id === imageId ? -1 : b.id === imageId ? 1 : a.sort_order - b.sort_order);
  await Promise.all(ordered.map((row, index) => client.from("product_images").update({ sort_order: index }).eq("id", row.id)));
  await writeAudit(client, "product_cover_changed", "product", image.data.product_id, session.role, { image_id: imageId });
  revalidatePath("/admin/productos");
  revalidatePath("/catalogo");
  revalidatePath("/");
}
