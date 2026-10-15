import { NextRequest, NextResponse } from "next/server";
import { buildMetaCatalogFeed } from "@/lib/catalog/meta-feed";
import { getCatalog } from "@/lib/data/catalog";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const catalog = await getCatalog();
  if (!catalog.available) return new NextResponse("Catalog unavailable", { status: 503 });
  return new NextResponse(buildMetaCatalogFeed(catalog.products, request.nextUrl.origin), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'inline; filename="liira-meta-catalog.csv"',
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
