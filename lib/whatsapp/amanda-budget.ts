import type { GatewayRequestRecord } from "@/lib/agent-core/gateway";
import { getSupabaseAdmin } from "@/lib/supabase/server";

type Client = NonNullable<ReturnType<typeof getSupabaseAdmin>>;
type Priority = "operator" | "customer" | "background";

export function gatewayBudget(client: Client, priority: Priority) {
  return {
    reserve: async () => {
      const result = await client.rpc("reserve_amanda_gateway_request", { p_priority: priority });
      if (result.error) throw new Error("gateway_quota_unavailable");
      return result.data as string | null;
    },
    record: async (id: string, request: GatewayRequestRecord) => {
      const result = await client.from("amanda_gateway_requests").update(request).eq("id", id);
      if (result.error) console.warn("amanda_gateway_usage_record_failed", { error_code: "usage_store_failed" });
    },
  };
}
