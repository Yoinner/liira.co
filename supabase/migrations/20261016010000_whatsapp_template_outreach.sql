alter table public.customers
  add column if not exists whatsapp_consent_at timestamptz,
  add column if not exists whatsapp_consent_source text,
  add column if not exists whatsapp_consent_version text;

create table if not exists public.whatsapp_template_sends (
  id uuid primary key default gen_random_uuid(),
  idempotency_key uuid not null unique,
  conversation_id uuid not null references public.whatsapp_conversations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  template_name text not null,
  language text not null,
  topic text not null check (char_length(topic) between 2 and 120),
  consent_version text not null,
  consent_source text not null,
  consented_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','accepted','failed')),
  provider_message_id text unique,
  error_code text,
  actor_role text not null check (actor_role in ('business','technical')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists whatsapp_template_sends_conversation_idx
  on public.whatsapp_template_sends(conversation_id, created_at desc);

alter table public.whatsapp_template_sends enable row level security;
