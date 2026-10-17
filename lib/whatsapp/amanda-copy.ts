export type AmandaFallback = { reply: string; handoffQuestion?: string };

export function amandaSafeFallback(text: string | null, customerName?: string | null, introSent = false): AmandaFallback | null {
  if (!text?.trim()) return null;
  const normalized = text.trim();
  const name = customerName?.trim().split(/\s+/)[0];
  const intro = `Hola${name ? ` ${name}` : ""}, mucho gusto. Soy Amanda, la asistente virtual que te ayuda en tu proceso de compra en Liira 💛`;
  const greeting = /^(h?ola|holi|buen(?:a|as|o|os)(?:\s+(?:tarde|tardes|día|dias|días|noche|noches))?|hey|ey|saludos)[!.¡¿?\s]*$/iu.test(normalized);
  const shipping = /\b(env[ií]o|enviar|entrega|domicilio|mensajer[ií]a|transportadora|cu[aá]nto\s+(?:tarda|demora)|tiempo\s+de\s+entrega)\b/iu.test(normalized);
  const products = [...normalized.matchAll(/\b(denario|collar|collares|maxicollar|maxicollares|rosario|rosarios|pulsera|pulseras|accesorio|accesorios)\b/giu)].map((match) => match[1].toLowerCase());
  if (/\b(cat[aá]logo|ver\s+(?:los\s+)?productos|d[oó]nde.{0,30}productos)\b/iu.test(normalized)) return {
    reply: `${introSent ? "Claro." : intro} Puedes ver los accesorios disponibles aquí: https://liira-co.vercel.app/catalogo. Si alguno te gusta, mándame su nombre o una captura y te ayudo.`,
  };
  if (shipping) return {
    reply: `${introSent ? "Claro." : intro} Voy a consultar con la persona encargada de los envíos para darte el costo y el tiempo correctos. En cuanto lo confirme, te respondo por aquí.`,
    handoffQuestion: `La clienta pregunta por el proceso de envío: «${normalized.slice(0, 300)}». Indícame qué debo explicarle y qué dato necesito pedirle.`,
  };
  if (products.length) {
    const choices = [...new Set(products)];
    const subject = choices.length > 1 ? choices.join(" o ") : choices[0];
    return { reply: `${introSent ? "Perfecto." : intro} Te ayudo con ${subject}. ¿Lo quieres de los disponibles o prefieres personalizarlo con algún color?` };
  }
  if (/\b(comprar|compra|ordenar|pedir|pedido)\b/iu.test(normalized)) return {
    reply: `${introSent ? "Claro." : intro} La compra la hacemos por este chat. Dime qué accesorio te interesa y te acompaño a elegirlo y confirmar los siguientes pasos.`,
  };
  if (introSent) return greeting
    ? { reply: "¡Hola de nuevo! Aquí estoy para ayudarte." }
    : { reply: "Quiero darte una respuesta precisa. Déjame revisar lo que me escribiste y te respondo por aquí.", handoffQuestion: `Ayúdame a responder esta consulta del cliente con el contexto de su conversación: «${normalized.slice(0, 300)}». Indica solo datos verificados y qué debemos preguntar si falta información.` };
  return { reply: greeting
    ? `${intro} ¿Buscas un accesorio disponible o quieres crear uno personalizado?`
    : `${intro} Ya reviso tu mensaje para orientarte bien.`, handoffQuestion: greeting ? undefined : `Primera consulta del cliente: «${normalized.slice(0, 300)}». ¿Qué respuesta verificada corresponde?` };
}
