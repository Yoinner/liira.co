create table if not exists public.whatsapp_conversations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  normalized_phone text not null,
  status text not null default 'requiere_respuesta' check (status in ('requiere_respuesta','esperando_cliente','cotizando','cerrada_ganada','cerrada_perdida')),
  unread_count integer not null default 0 check (unread_count >= 0),
  last_message_at timestamptz not null default now(),
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  ai_summary text,
  ai_intent text,
  ai_sentiment text,
  ai_next_action text,
  ai_confidence numeric(4,3),
  ai_analyzed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (normalized_phone)
);

create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.whatsapp_conversations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  provider_message_id text not null unique,
  direction text not null check (direction in ('inbound','outbound')),
  message_type text not null default 'text',
  body text,
  delivery_status text not null default 'received',
  provider_timestamp timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_conversations_queue_idx on public.whatsapp_conversations(status, last_message_at desc);
create index if not exists whatsapp_messages_conversation_idx on public.whatsapp_messages(conversation_id, created_at desc);
alter table public.whatsapp_conversations enable row level security;
alter table public.whatsapp_messages enable row level security;

create or replace function public.increment_whatsapp_unread(conversation uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.whatsapp_conversations
  set unread_count = unread_count + 1
  where id = conversation;
$$;

revoke all on function public.increment_whatsapp_unread(uuid) from public, anon, authenticated;
grant execute on function public.increment_whatsapp_unread(uuid) to service_role;

