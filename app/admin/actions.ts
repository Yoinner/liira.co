"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { clearAdminSession, requireAdmin } from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { customerUpdateSchema, inquiryUpdateSchema, normalizePhone, parseTags } from "@/lib/validation/crm";

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
  const sortOrder = Number(formData.get("sort_order") || 0);
  if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 10000) throw new Error("La posición no es válida");
  const record = {
    name,
    slug: slugify(name),
    description: String(formData.get("description") || "").trim() || null,
    sort_order: sortOrder,
    active: formData.get("active") === "on",
  };
  const result = id ? await client.from("categories").update(record).eq("id", id) : await client.from("categories").insert(record);
  if (result.error) throw new Error("No se pudo guardar la categoría");
  const cover = formData.get("image");
  if (cover instanceof File && cover.size > 0) {
    if (!cover.type.startsWith("image/") || cover.size > 8 * 1024 * 1024) {
      throw new Error("La imagen debe ser JPG, PNG o WebP y pesar máximo 8 MB");
    }
    const storagePath = `categories/${record.slug}/cover`;
    const upload = await client.storage.from("products").upload(storagePath, await cover.arrayBuffer(), { contentType: cover.type, upsert: true });
    if (upload.error) throw new Error("No se pudo subir la imagen de la categoría");
  }
  await writeAudit(client, id ? "category_updated" : "category_created", "category", id || null, session.role, { name, sort_order: sortOrder });
  revalidatePath("/admin/categorias");
  revalidatePath("/catalogo");
  revalidatePath("/");
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
