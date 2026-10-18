import "server-only";

import { cache } from "react";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { AmandaHandoff, Customer, CustomerActivity, CustomerNote, Inquiry, InventoryMovement, Product, WhatsAppConversation, WhatsAppMessage } from "@/lib/types";

export type CrmData = {
  customers: Customer[];
  inquiries: Inquiry[];
  activities: CustomerActivity[];
  notes: CustomerNote[];
  movements: InventoryMovement[];
  available: boolean;
  schemaReady: boolean;
};

const empty: CrmData = {
  customers: [], inquiries: [], activities: [], notes: [], movements: [], available: false, schemaReady: false,
};

export const getCrmData = cache(async (): Promise<CrmData> => {
  const client = getSupabaseAdmin();
  if (!client) return empty;

  const [customers, inquiries, activities, notes, movements] = await Promise.all([
    client.from("customers").select("*").order("updated_at", { ascending: false }).limit(500),
    client.from("inquiries").select("*").order("created_at", { ascending: false }).limit(500),
    client.from("customer_activities").select("*").order("created_at", { ascending: false }).limit(600),
    client.from("customer_notes").select("*").order("created_at", { ascending: false }).limit(500),
    client.from("inventory_movements").select("*").order("created_at", { ascending: false }).limit(500),
  ]);

  const schemaReady = !customers.error && !activities.error && !notes.error && !movements.error;
  return {
    customers: (customers.data || []) as Customer[],
    inquiries: (inquiries.data || []) as Inquiry[],
    activities: (activities.data || []) as CustomerActivity[],
    notes: (notes.data || []) as CustomerNote[],
    movements: (movements.data || []) as InventoryMovement[],
    available: !inquiries.error,
    schemaReady,
  };
});

export const getCustomerDetail = cache(async (id: string) => {
  const client = getSupabaseAdmin();
  if (!client) return null;
  const [customer, inquiries, notes, activities] = await Promise.all([
    client.from("customers").select("*").eq("id", id).maybeSingle(),
    client.from("inquiries").select("*").eq("customer_id", id).order("created_at", { ascending: false }),
    client.from("customer_notes").select("*").eq("customer_id", id).order("created_at", { ascending: false }),
    client.from("customer_activities").select("*").eq("customer_id", id).order("created_at", { ascending: false }).limit(100),
  ]);
  if (customer.error || !customer.data) return null;
  return {
    customer: customer.data as Customer,
    inquiries: (inquiries.data || []) as Inquiry[],
    notes: (notes.data || []) as CustomerNote[],
    activities: (activities.data || []) as CustomerActivity[],
  };
});

export async function searchAdminRecords(query: string) {
  const client = getSupabaseAdmin();
  const term = query.trim().slice(0, 80);
  if (!client || term.length < 2) return { customers: [] as Customer[], inquiries: [] as Inquiry[], products: [] as Product[] };
  const safe = term.replace(/[^a-zA-Z0-9áéíóúüñÁÉÍÓÚÜÑ@+ _-]/g, " ");
  const [customers, inquiries, products] = await Promise.all([
    client.from("customers").select("*").or(`name.ilike.%${safe}%,phone.ilike.%${safe}%,email.ilike.%${safe}%`).limit(20),
    client.from("inquiries").select("*").or(`product_name.ilike.%${safe}%,customer_name.ilike.%${safe}%,customer_phone.ilike.%${safe}%`).limit(20),
    client.from("products").select("*, category:categories(name,slug), images:product_images(*)").ilike("name", `%${safe}%`).limit(20),
  ]);
  return {
    customers: (customers.data || []) as Customer[],
    inquiries: (inquiries.data || []) as Inquiry[],
    products: (products.data || []) as Product[],
  };
}

export const getWhatsAppInbox = cache(async () => {
  const client = getSupabaseAdmin();
  if (!client) return { conversations: [] as WhatsAppConversation[], available: false };
  const result = await client.from("whatsapp_conversations").select("*, customer:customers(id,name,phone)").is("deleted_at", null).order("last_message_at", { ascending: false }).limit(200);
  return { conversations: (result.data || []) as WhatsAppConversation[], available: !result.error };
});

export const getWhatsAppConversation = cache(async (id: string) => {
  const client = getSupabaseAdmin();
  if (!client) return null;
  const [conversation, messages, handoffs, templateSends, orders, quotes] = await Promise.all([
    client.from("whatsapp_conversations").select("*, customer:customers(id,name,phone)").eq("id", id).is("deleted_at", null).maybeSingle(),
    client.from("whatsapp_messages").select("*").eq("conversation_id", id).order("created_at", { ascending: false }).limit(300),
    client.from("amanda_handoffs").select("*").eq("conversation_id", id).order("created_at", { ascending: false }).limit(30),
    client.from("whatsapp_template_sends").select("status,template_name,topic,created_at").eq("conversation_id", id).in("status", ["pending", "accepted"]).gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()).order("created_at", { ascending: false }).limit(1),
    client.from("amanda_manual_orders").select("id,reference,handoff_id,summary,amount_cop,payment_method,status,proof_message_id,verified_at").eq("conversation_id", id).order("created_at", { ascending: false }).limit(20),
    client.from("amanda_shipping_quotes").select("id,handoff_id,order_id,destination,item_summary,amount_cop,delivery_estimate,conditions,source_last_inbound_at,issued_at,expires_at").eq("conversation_id", id).order("issued_at", { ascending: false }).limit(20),
  ]);
  if (conversation.error || !conversation.data || messages.error) return null;
  const knowledge = handoffs.data?.length ? await client.from("amanda_knowledge").select("id,source_handoff_id,content,status").in("source_handoff_id", handoffs.data.map((item) => item.id)) : null;
  return { conversation: conversation.data as WhatsAppConversation, messages: [...(messages.data || [])].reverse() as WhatsAppMessage[], handoffs: (handoffs.data || []) as AmandaHandoff[], knowledge: knowledge?.data || [], latestTemplateSend: templateSends.data?.[0] || null, orders: orders.data || [], paymentsReady: !orders.error, quotes: quotes.data || [], quotesReady: !quotes.error };
});
