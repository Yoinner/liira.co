export type Category = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url?: string | null;
  sort_order: number;
  active: boolean;
};

export type ProductImage = {
  id: string;
  product_id: string;
  url: string;
  alt: string | null;
  sort_order: number;
};

export type Product = {
  id: string;
  category_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  sale_price: number | null;
  stock: number;
  active: boolean;
  featured: boolean;
  created_at: string;
  updated_at: string;
  category?: Pick<Category, "name" | "slug"> | null;
  images: ProductImage[];
};

export type InquiryStatus = "contacto" | "vendido" | "no_vendido";
export type PipelineStage = "nuevo" | "contactado" | "cotizado" | "seguimiento" | "ganado" | "perdido";
export type InquiryPriority = "baja" | "normal" | "alta";

export type Inquiry = {
  id: string;
  product_id: string | null;
  product_name: string;
  customer_name: string | null;
  customer_phone: string | null;
  color_preference: string | null;
  customization: string | null;
  status: InquiryStatus;
  pipeline_stage: PipelineStage;
  priority: InquiryPriority;
  customer_id: string | null;
  source: string;
  next_follow_up_at: string | null;
  last_contacted_at: string | null;
  lost_reason: string | null;
  tags: string[];
  sale_amount: number | null;
  sold_at: string | null;
  created_at: string;
  updated_at?: string;
};

export type Customer = {
  id: string;
  normalized_phone: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  instagram_handle: string | null;
  city: string | null;
  preferences: string | null;
  tags: string[];
  transactional_consent: boolean;
  marketing_consent: boolean;
  first_seen_at: string;
  last_contact_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CustomerNote = {
  id: string;
  customer_id: string;
  inquiry_id: string | null;
  note: string;
  created_by_role: "business" | "technical";
  created_at: string;
};

export type CustomerActivity = {
  id: string;
  customer_id: string | null;
  inquiry_id: string | null;
  activity_type: string;
  summary: string;
  metadata: Record<string, unknown>;
  actor_role: "business" | "technical" | null;
  created_at: string;
};

export type InventoryMovement = {
  id: string;
  product_id: string;
  delta: number;
  balance_after: number;
  reason: string;
  actor_role: "business" | "technical";
  created_at: string;
};

export type WhatsAppConversation = {
  id: string;
  customer_id: string;
  normalized_phone: string;
  status: "requiere_respuesta" | "esperando_cliente" | "cotizando" | "cerrada_ganada" | "cerrada_perdida";
  unread_count: number;
  last_message_at: string;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  ai_summary: string | null;
  ai_intent: string | null;
  ai_sentiment: string | null;
  ai_next_action: string | null;
  ai_confidence: number | null;
  ai_analyzed_at: string | null;
  automation_mode: "autonomous" | "paused" | "human";
  agent_stage: string;
  agent_follow_up_at: string | null;
  deleted_at: string | null;
  customer?: Pick<Customer, "id" | "name" | "phone"> | null;
};

export type WhatsAppMessage = {
  id: string;
  conversation_id: string;
  customer_id: string;
  provider_message_id: string;
  direction: "inbound" | "outbound";
  message_type: string;
  body: string | null;
  media_id: string | null;
  media_path: string | null;
  media_mime_type: string | null;
  media_caption: string | null;
  deleted_at: string | null;
  delivery_status: string;
  provider_timestamp: string | null;
  created_at: string;
};

export type AmandaHandoff = {
  id: string;
  code: string;
  conversation_id: string;
  customer_id: string;
  kind: "general" | "media_review" | "payment_link" | "payment_verification" | "shipping_quote";
  status: "pending" | "resolved" | "cancelled";
  question: string;
  operator_guidance: string | null;
  operator_delivery_status: string;
  created_at: string;
  resolved_at: string | null;
};
