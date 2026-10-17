export function safeGeneralRule(value: string) {
  const rule = value.trim().replace(/\s+/g, " ");
  if (rule.length < 20 || rule.length > 500) return null;
  if (/(?:\+?\d[\s().-]*){7,}|\b[^\s@]+@[^\s@]+\.[^\s@]+\b|https?:\/\//i.test(rule)) return null;
  return rule;
}
