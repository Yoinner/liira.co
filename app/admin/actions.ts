"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { clearAdminSession, requireAdmin } from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { customerUpdateSchema, inquiryUpdateSchema, normalizePhone, parseTags } from "@/lib/validation/crm";
import { hasDependents, matchesDeletionConfirmation } from "@/lib/validation/deletion";

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

export async function updateWhatsAppConversation(formData: FormData) {
  const session = await requireAdmin("business");
  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase no está disponible");
  const parsed = z.object({
    id: z.string().uuid(),
    status: z.enum(["requiere_respuesta", "esperando_cliente", "cotizando", "cerrada_ganada", "cerrada_perdida"]),
  }).parse({ id: formData.get("id"), status: formData.get("status") });
  const updated = await client.from("whatsapp_conversations").update({ status: parsed.status, unread_count: 0, updated_at: new Date().toISOString() }).eq("id", parsed.id);
  if (updated.error) throw new Error("No se pudo actualizar la conversación");
  await writeAudit(client, "whatsapp_conversation_updated", "whatsapp_conversation", parsed.id, session.role, { status: parsed.status });
  revalidatePath("/admin/conversaciones");
  revalidatePath(`/admin/conversaciones/${parsed.id}`);
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
  await client.from("whatsapp_conversations").update({ status: "esperando_cliente", unread_count: 0, last_message_at: now, last_outbound_at: now, updated_at: now }).eq("id", parsed.id);
  await client.from("customer_activities").insert({ customer_id: conversation.data.customer_id, activity_type: "whatsapp_outbound", summary: `Liira: ${parsed.body}`.slice(0, 300), actor_role: session.role, metadata: { provider_message_id: providerMessageId } });
  await writeAudit(client, "whatsapp_message_sent", "whatsapp_conversation", parsed.id, session.role, { provider_message_id: providerMessageId });
  revalidatePath("/admin/conversaciones");
  revalidatePath(`/admin/conversaciones/${parsed.id}`);
  revalidatePath(`/admin/clientes/${conversation.data.customer_id}`);
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
