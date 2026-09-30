"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { clearAdminSession, requireAdmin } from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/supabase/server";

function slugify(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function optionalNumber(value: FormDataEntryValue | null) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export async function logoutAction() {
  await clearAdminSession();
  redirect("/admin/login");
}

export async function saveCategory(formData: FormData) {
  await requireAdmin("business");
  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase no está disponible");
  const name = String(formData.get("name") || "").trim();
  if (!name) throw new Error("El nombre es obligatorio");
  const id = String(formData.get("id") || "");
  const record = {
    name,
    slug: slugify(name),
    description: String(formData.get("description") || "").trim() || null,
    sort_order: Number(formData.get("sort_order") || 0),
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
  revalidatePath("/admin/categorias");
  revalidatePath("/catalogo");
  revalidatePath("/");
}

export async function saveProduct(formData: FormData) {
  await requireAdmin("business");
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

  revalidatePath("/");
  revalidatePath("/catalogo");
  revalidatePath("/admin/productos");
  redirect("/admin/productos?saved=1");
}

export async function updateInquiry(formData: FormData) {
  await requireAdmin("business");
  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase no está disponible");
  const id = String(formData.get("id") || "");
  const status = z.enum(["contacto", "vendido", "no_vendido"]).parse(formData.get("status"));
  const saleAmount = optionalNumber(formData.get("sale_amount"));
  if (status === "vendido" && (!saleAmount || saleAmount <= 0)) throw new Error("Indica el precio vendido");
  const update = { status, sale_amount: status === "vendido" ? saleAmount : null, sold_at: status === "vendido" ? new Date().toISOString() : null, updated_at: new Date().toISOString() };
  const { error } = await client.from("inquiries").update(update).eq("id", id);
  if (error) throw new Error("No se pudo actualizar la solicitud");
  revalidatePath("/admin");
  revalidatePath("/admin/solicitudes");
}
