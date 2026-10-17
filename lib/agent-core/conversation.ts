export type AgentBusiness = {
  name: string;
  agentName: string;
  locale: string;
  website: string;
  description: string;
  boundaries: string;
};

export type ConversationLine = { direction: "inbound" | "outbound"; body: string | null; message_type: string; media_caption?: string | null };

export function conversationTranscript(messages: ConversationLine[]) {
  return messages.map((message) => `${message.direction === "inbound" ? "Cliente" : "Negocio"}: ${(message.body || message.media_caption || `[${message.message_type}]`).slice(0, 700)}`).join("\n");
}

export function operatorCaseCode(text: string | null | undefined) {
  return text?.match(/\b[A-Z]{2,8}-[A-F0-9]{6}\b/i)?.[0]?.toUpperCase() || null;
}

export function allowedAgentStage(stage: string) {
  // Payment and closed-sale states require an independently verified operation.
  return ["closed_won", "closed_lost", "awaiting_payment_proof"].includes(stage) ? "recommendation" : stage;
}

export function shouldResumeAfterGuidance(mode: string, sourceMessageId: string | null, latestInboundId: string | null) {
  return mode === "autonomous" && Boolean(sourceMessageId && sourceMessageId === latestInboundId);
}
