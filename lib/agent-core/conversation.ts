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

export function handoffNamedInMessage(text: string, cases: Array<{ id: string; customerName: string | null }>) {
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
  const words = ` ${normalize(text)} `;
  const matches = cases.filter(({ customerName }) => {
    if (!customerName) return false;
    const name = normalize(customerName);
    const firstName = name.split(" ")[0];
    return name.length >= 3 && (words.includes(` ${name} `) || firstName.length >= 3 && words.includes(` ${firstName} `));
  });
  return matches.length === 1 ? matches[0].id : null;
}

export function allowedAgentStage(stage: string) {
  // Payment and closed-sale states require an independently verified operation.
  return ["closed_won", "closed_lost", "awaiting_payment_proof"].includes(stage) ? "recommendation" : stage;
}
