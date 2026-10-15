export function amandaSafeFallback(text: string | null, customerName?: string | null, introSent = false) {
  if (!text?.trim()) return null;
  const name = customerName?.trim().split(/\s+/)[0];
  const intro = introSent
    ? `¡Hola${name ? `, ${name}` : ""}! 💛`
    : `Hola${name ? ` ${name}` : ""}, mucho gusto. Soy Amanda, la encargada de ayudarte en tu proceso de compra en Liira 💛`;
  const greeting = /^(h?ola|holi|buen(?:a|as|o|os)(?:\s+(?:tarde|tardes|día|dias|días|noche|noches))?|hey|ey|saludos)[!.¡¿?\s]*$/iu.test(text.trim());
  return greeting
    ? `${intro} ¿Buscas un accesorio disponible o quieres crear uno personalizado?`
    : `${intro} Quiero entenderte bien para ayudarte. ¿Buscas un producto disponible, uno personalizado o información sobre tu pedido?`;
}
