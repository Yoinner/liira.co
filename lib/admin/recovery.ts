import type { Customer, CustomerActivity, Inquiry } from "@/lib/types";

export function recoveryCandidate(customer: Customer, inquiries: Inquiry[], activities: CustomerActivity[]) {
  const permission = activities.filter((item) => item.customer_id === customer.id && ["marketing_consent_granted", "marketing_consent_revoked"].includes(item.activity_type)).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  if (!customer.marketing_consent || permission?.activity_type !== "marketing_consent_granted") return null;
  const open = inquiries.filter((item) => item.customer_id === customer.id && ["nuevo", "contactado", "cotizado", "seguimiento"].includes(item.pipeline_stage)).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  if (!open || inquiries.some((item) => item.customer_id === customer.id && item.status === "vendido" && (item.sold_at || item.created_at) >= open.created_at)) return null;
  return { product: open.product_name, inquiryId: open.id, createdAt: open.created_at };
}
