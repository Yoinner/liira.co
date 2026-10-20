export const privacyVersion = "2026-10-20.v1";
export const marketingConsentText = "Autorizo a Liira a escribirme por WhatsApp sobre novedades y piezas de su colección. Puedo retirar este permiso cuando quiera.";

export function classifyVisit(pathname: string, search: string) {
  const category = pathname === "/catalogo" ? new URLSearchParams(search).get("categoria") : null;
  const eventType = pathname.startsWith("/producto/") ? "product_view" : category ? "category_view" : pathname === "/personaliza" ? "personalization_view" : null;
  const reference = eventType === "product_view" ? pathname.slice(10) : category || "personaliza";
  return eventType && /^[a-z0-9][a-z0-9-]{0,99}$/.test(reference) ? { eventType, reference } : null;
}
