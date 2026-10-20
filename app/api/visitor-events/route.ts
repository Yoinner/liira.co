import { createHmac } from "node:crypto";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { privacyVersion } from "@/lib/privacy";

const schema = z.object({
  sessionId: z.string().uuid(),
  eventType: z.enum(["category_view", "product_view", "personalization_view"]),
  reference: z.string().regex(/^[a-z0-9][a-z0-9-]{0,99}$/),
  consentVersion: z.literal(privacyVersion),
}).strict();

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response(null, { status: 403 });
  if (Number(request.headers.get("content-length") || 0) > 1024) return new Response(null, { status: 413 });
  let body: unknown;
  try { body = await request.json(); } catch { return new Response(null, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return new Response(null, { status: 400 });
  const client = getSupabaseAdmin();
  if (!client) return new Response(null, { status: 503 });
  if (!process.env.AUTH_SECRET && process.env.NODE_ENV === "production") return new Response(null, { status: 503 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const ipHash = createHmac("sha256", process.env.AUTH_SECRET || "liira-development-rate-limit").update(ip).digest("hex");
  const since = new Date(Date.now() - 60_000).toISOString();
  const limited = await client.from("public_form_attempts").select("id", { count: "exact", head: true }).eq("form_name", "visitor_event").eq("ip_hash", ipHash).gte("created_at", since);
  if (limited.error) return new Response(null, { status: 503 });
  if ((limited.count || 0) >= 30) return new Response(null, { status: 429 });
  const attempt = await client.from("public_form_attempts").insert({ form_name: "visitor_event", ip_hash: ipHash });
  if (attempt.error) return new Response(null, { status: 503 });
  const { error } = await client.from("visitor_events").insert({ session_id: parsed.data.sessionId, event_type: parsed.data.eventType, reference: parsed.data.reference, consent_version: parsed.data.consentVersion });
  return new Response(null, { status: error ? 503 : 204 });
}
