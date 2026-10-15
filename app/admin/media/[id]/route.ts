import { getAdminSession } from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) return new Response("No autorizado", { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Solicitud inválida", { status: 400 });
  const client = getSupabaseAdmin();
  if (!client) return new Response("No disponible", { status: 503 });
  const message = await client.from("whatsapp_messages").select("media_path,media_mime_type,deleted_at").eq("id", id).maybeSingle();
  if (message.error || !message.data?.media_path || message.data.deleted_at) return new Response("No encontrado", { status: 404 });
  const media = await client.storage.from("whatsapp-media").download(message.data.media_path);
  if (media.error || !media.data) return new Response("No disponible", { status: 404 });
  return new Response(await media.data.arrayBuffer(), {
    headers: {
      "content-type": message.data.media_mime_type || "application/octet-stream",
      "cache-control": "private, max-age=300",
      "x-content-type-options": "nosniff",
    },
  });
}
