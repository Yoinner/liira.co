export function shouldRetryOperatorAlert(messages: Array<{ body: string | null; delivery_status: string }>) {
  const delivered = messages.some((message) => message.delivery_status === "delivered" || message.delivery_status === "read");
  const templateAttempted = messages.some((message) => message.body?.startsWith("Alerta iniciada con plantilla:"));
  return !delivered && !templateAttempted;
}
