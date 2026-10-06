import { z } from "zod";

export const pipelineStages = ["nuevo", "contactado", "cotizado", "seguimiento", "ganado", "perdido"] as const;
export const inquiryPriorities = ["baja", "normal", "alta"] as const;

export function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10 && digits.startsWith("3")) return `57${digits}`;
  if (digits.length === 12 && digits.startsWith("57")) return digits;
  return digits;
}

export function parseTags(value: string) {
  return [...new Set(value.split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean))].slice(0, 12);
}

export const inquiryPayloadSchema = z.object({
  productId: z.string().uuid().nullable().optional(),
  productName: z.string().trim().min(1).max(160),
  customerName: z.string().trim().min(2).max(80),
  customerPhone: z.string().trim().min(7).max(30).transform(normalizePhone).refine((phone) => /^\d{10,15}$/.test(phone), "Número inválido"),
  colorPreference: z.string().trim().max(80).optional().default(""),
  customization: z.string().trim().min(4).max(600),
  website: z.string().max(0).optional().default(""),
});

export const inquiryUpdateSchema = z.object({
  id: z.string().uuid(),
  stage: z.enum(pipelineStages),
  priority: z.enum(inquiryPriorities),
  saleAmount: z.number().nonnegative().nullable(),
  nextFollowUpAt: z.string().datetime({ offset: true }).nullable(),
  lostReason: z.string().trim().max(300).nullable(),
});

export const customerUpdateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(2).max(100),
  phone: z.string().trim().max(30).nullable(),
  email: z.string().trim().email().max(160).nullable(),
  instagramHandle: z.string().trim().max(80).nullable(),
  city: z.string().trim().max(100).nullable(),
  preferences: z.string().trim().max(1200).nullable(),
  tags: z.array(z.string().max(40)).max(12),
  transactionalConsent: z.boolean(),
  marketingConsent: z.boolean(),
});
