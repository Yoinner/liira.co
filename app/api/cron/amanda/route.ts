import { timingSafeEqual } from "node:crypto";
import { runDueAmandaFollowups } from "@/lib/whatsapp/amanda";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET || "";
  const received = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!secret || secret.length !== received.length) return false;
  return timingSafeEqual(Buffer.from(secret), Buffer.from(received));
}

export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ ok: false }, { status: 401 });
  const sent = await runDueAmandaFollowups(request.headers.get("x-vercel-oidc-token"));
  return Response.json({ ok: true, sent }, { headers: { "cache-control": "no-store" } });
}
