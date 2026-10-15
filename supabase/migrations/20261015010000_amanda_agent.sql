-- Amanda: autonomous commercial flow, operator handoffs and durable media.

alter table public.whatsapp_conversations
  add column if not exists automation_mode text not null default 'autonomous',
  add column if not exists agent_stage text not null default 'new',
  add column if not exists agent_context jsonb not null default '{}'::jsonb,
  add column if not exists agent_follow_up_at timestamptz,
  add column if not exists agent_follow_up_source_message_id text,
  add column if not exists agent_last_nudge_at timestamptz,
  add column if not exists agent_intro_sent_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by_role text;

do $$
begin
  alter table public.whatsapp_conversations
    add constraint whatsapp_conversations_automation_mode_check
    check (automation_mode in ('autonomous', 'paused', 'human'));
exception when duplicate_object then null;
end $$;

alter table public.whatsapp_messages
  add column if not exists media_id text,
  add column if not exists media_path text,
  add column if not exists media_mime_type text,
  add column if not exists media_caption text,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by_role text;

create table if not exists public.amanda_handoffs (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  conversation_id uuid not null references public.whatsapp_conversations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  source_message_id uuid references public.whatsapp_messages(id) on delete set null,
  kind text not null check (kind in ('general','media_review','payment_link','payment_verification','shipping_quote')),
  status text not null default 'pending' check (status in ('pending','resolved','cancelled')),
  question text not null check (char_length(question) between 2 and 1200),
  operator_guidance text,
  learning_candidate text,
  operator_delivery_status text not null default 'queued',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.amanda_operator_messages (
  id uuid primary key default gen_random_uuid(),
  provider_message_id text not null unique,
  direction text not null check (direction in ('inbound','outbound')),
  body text,
  delivery_status text not null default 'received',
  provider_timestamp timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.amanda_agent_runs (
  source_message_id uuid primary key references public.whatsapp_messages(id) on delete cascade,
  conversation_id uuid not null references public.whatsapp_conversations(id) on delete cascade,
  status text not null default 'running' check (status in ('running','done','failed')),
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists whatsapp_conversations_agent_queue_idx
  on public.whatsapp_conversations(agent_follow_up_at)
  where automation_mode = 'autonomous' and deleted_at is null;
create index if not exists amanda_handoffs_pending_idx
  on public.amanda_handoffs(status, created_at desc);

alter table public.amanda_handoffs enable row level security;
alter table public.amanda_operator_messages enable row level security;
alter table public.amanda_agent_runs enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('whatsapp-media', 'whatsapp-media', false, 20971520, array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/quicktime','video/3gpp'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Supabase Cron provides minute-level scheduling without requiring a paid Vercel cron plan.
-- The encrypted Vault secret `amanda_cron_secret` is created operationally, never in Git.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
declare existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname = 'amanda-followups' limit 1;
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
end $$;

select cron.schedule(
  'amanda-followups',
  '* * * * *',
  $cron$
  select net.http_get(
    url := 'https://liira-co.vercel.app/api/cron/amanda',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'amanda_cron_secret' limit 1), '')
    )
  );
  $cron$
);
