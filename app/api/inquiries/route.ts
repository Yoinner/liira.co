import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";

const schema = z.object({
  productId: z.string().uuid().nullable().optional(),
  productName: z.string().trim().min(1).max(160),
  customerName: z.string().trim().max(80).optional().default(""),
  customerPhone: z.string().trim().max(30).optional().default(""),
  colorPreference: z.string().trim().max(80).optional().default(""),
  customization: z.string().trim().max(600).optional().default(""),
  website: z.string().max(0).optional().default(""),
});

const requests = new Map<string, number[]>();

function limited(ip: string) {
  const now = Date.now();
  const recent = (requests.get(ip) || []).filter((time) => now - time < 60_000);
  recent.push(now);
  requests.set(ip, recent);
  return recent.length > 8;
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (limited(ip)) return NextResponse.json({ error: "Intenta de nuevo en un momento." }, { status: 429 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Revisa la información enviada." }, { status: 400 });

  const client = getSupabaseAdmin();
  if (!client) return NextResponse.json({ error: "Registro temporalmente no disponible." }, { status: 503 });

  const payload = parsed.data;
  const { error } = await client.from("inquiries").insert({
    product_id: payload.productId || null,
    product_name: payload.productName,
    customer_name: payload.customerName || null,
    customer_phone: payload.customerPhone || null,
    color_preference: payload.colorPreference || null,
    customization: payload.customization || null,
    status: "contacto",
    source: "whatsapp_web",
  });

  if (error) return NextResponse.json({ error: "No se pudo registrar la solicitud." }, { status: 503 });
  return NextResponse.json({ ok: true }, { status: 201 });
}
