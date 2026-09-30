import "server-only";

import { cache } from "react";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { Category, Inquiry, Product } from "@/lib/types";

type CatalogResult = {
  products: Product[];
  categories: Category[];
  available: boolean;
};

export const getCatalog = cache(async (): Promise<CatalogResult> => {
  const client = getSupabaseAdmin();
  if (!client) return { products: [], categories: [], available: false };

  try {
    const [{ data: products, error: productsError }, { data: categories, error: categoriesError }] =
      await Promise.all([
        client
          .from("products")
          .select("*, category:categories(name,slug), images:product_images(*)")
          .eq("active", true)
          .order("featured", { ascending: false })
          .order("created_at", { ascending: false }),
        client.from("categories").select("*").eq("active", true).order("sort_order"),
      ]);

    if (productsError || categoriesError) throw productsError || categoriesError;

    return {
      products: (products || []).map((product) => ({
        ...product,
        images: (product.images || []).sort(
          (a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order,
        ),
      })) as Product[],
      categories: (categories || []) as Category[],
      available: true,
    };
  } catch {
    return { products: [], categories: [], available: false };
  }
});

export const getProductBySlug = cache(async (slug: string): Promise<Product | null> => {
  const client = getSupabaseAdmin();
  if (!client) return null;
  const { data, error } = await client
    .from("products")
    .select("*, category:categories(name,slug), images:product_images(*)")
    .eq("slug", slug)
    .eq("active", true)
    .maybeSingle();

  if (error || !data) return null;
  return {
    ...data,
    images: (data.images || []).sort(
      (a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order,
    ),
  } as Product;
});

export async function getAdminData() {
  const client = getSupabaseAdmin();
  if (!client) {
    return { products: [] as Product[], categories: [] as Category[], inquiries: [] as Inquiry[], available: false };
  }

  const [productsResult, categoriesResult, inquiriesResult] = await Promise.all([
    client
      .from("products")
      .select("*, category:categories(name,slug), images:product_images(*)")
      .order("updated_at", { ascending: false }),
    client.from("categories").select("*").order("sort_order"),
    client.from("inquiries").select("*").order("created_at", { ascending: false }).limit(200),
  ]);

  const available = !productsResult.error && !categoriesResult.error && !inquiriesResult.error;
  return {
    products: (productsResult.data || []) as Product[],
    categories: (categoriesResult.data || []) as Category[],
    inquiries: (inquiriesResult.data || []) as Inquiry[],
    available,
  };
}
