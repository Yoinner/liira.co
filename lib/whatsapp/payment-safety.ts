export function approvedPaymentUrl(raw: string, hosts: string[]) {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash) return null;
    if (!hosts.some((host) => host.toLowerCase() === url.hostname.toLowerCase())) return null;
    return url.href;
  } catch { return null; }
}

export function paymentLinkHosts() {
  return (process.env.AMANDA_PAYMENT_LINK_HOSTS || "").split(",").map((host) => host.trim().toLowerCase()).filter((host) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(host));
}

export function paymentHandoffApproved(kind: string, order: { status: string; verified_at?: string | null; proof_message_id?: string | null } | null, sourceMessageId: string | null) {
  if (kind === "payment_link") return order?.status === "awaiting_payment";
  if (kind === "payment_verification") return Boolean(order?.status === "paid" && order.verified_at && sourceMessageId && order.proof_message_id === sourceMessageId);
  return true;
}
