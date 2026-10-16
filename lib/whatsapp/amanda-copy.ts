export type AmandaFallback = { reply: string; handoffQuestion?: string };

export function amandaSafeFallback(text: string | null, customerName?: string | null, introSent = false): AmandaFallback | null {
  if (!text?.trim()) return null;
  const normalized = text.trim();
  const name = customerName?.trim().split(/\s+/)[0];
  const intro = `Hola${name ? ` ${name}` : ""}, mucho gusto. Soy Amanda, la encargada de ayudarte en tu proceso de compra en Liira 💛`;
  const greeting = /^(h?ola|holi|buen(?:a|as|o|os)(?:\s+(?:tarde|tardes|día|dias|días|noche|noches))?|hey|ey|saludos)[!.¡¿?\s]*$/iu.test(normalized);
  const shipping = /\b(env[ií]o|enviar|entrega|domicilio|mensajer[ií]a|transportadora|cu[aá]nto\s+(?:tarda|demora)|tiempo\s+de\s+entrega)\b/iu.test(normalized);
  if (shipping) return {
    reply: `${introSent ? "Claro" : intro} 💛 Voy a confirmar con Dani cómo sería el envío para darte el costo y el tiempo correctos. En cuanto me oriente, te respondo por aquí.`,
    handoffQuestion: `La clienta pregunta por el proceso de envío: «${normalized.slice(0, 300)}». Indícame qué debo explicarle y qué dato necesito pedirle.`,
  };
  if (introSent) return { reply: greeting
    ? "¡Hola de nuevo! 💛 Cuéntame, ¿en qué te gustaría que te ayudara?"
    : "Entiendo 💛 Para ayudarte bien, ¿qué te gustaría saber o conseguir en este momento?" };
  return { reply: greeting
    ? `${intro} ¿Buscas un accesorio disponible o quieres crear uno personalizado?`
    : `${intro} Quiero entenderte bien para ayudarte. ¿Buscas un producto disponible, uno personalizado o información sobre tu pedido?` };
}
