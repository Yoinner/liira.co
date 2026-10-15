export function amandaGreetingFallback(text: string | null, customerName?: string | null, introSent = false) {
  if (!text || !/^(hola|holi|buen(?:a|as|o|os)(?:\s+(?:tarde|tardes|día|dias|días|noche|noches))?|hey|ey|saludos)[!.¡¿?\s]*$/iu.test(text.trim())) return null;
  const name = customerName?.trim().split(/\s+/)[0];
  const intro = introSent
    ? `¡Hola${name ? `, ${name}` : ""}! 💛`
    : `Hola${name ? ` ${name}` : ""}, mucho gusto. Soy Amanda, la encargada de ayudarte en tu proceso de compra en Liira 💛`;
  return `${intro} ¿Buscas un accesorio disponible o quieres crear uno personalizado?`;
}
