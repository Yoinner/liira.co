-- One debounced, recoverable job per conversation. Existing messages remain the source of truth.
alter table public.whatsapp_conversations
  add column if not exists agent_due_at timestamptz,
  add column if not exists agent_processing_until timestamptz,
  add column if not exists ai_status text not null default 'pending',
  add column if not exists ai_error_code text,
  add column if not exists ai_source_message_id uuid,
  add column if not exists ai_model text,
  add column if not exists status_manual_at timestamptz;

create index if not exists whatsapp_conversations_agent_due_idx
  on public.whatsapp_conversations(agent_due_at)
  where agent_due_at is not null and automation_mode = 'autonomous' and deleted_at is null;

create or replace function public.claim_amanda_conversation(p_conversation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.whatsapp_conversations
  set agent_processing_until = now() + interval '90 seconds'
  where id = p_conversation_id
    and automation_mode = 'autonomous'
    and deleted_at is null
    and agent_due_at <= now()
    and (agent_processing_until is null or agent_processing_until < now());
  return found;
end;
$$;

revoke all on function public.claim_amanda_conversation(uuid) from public, anon, authenticated;
grant execute on function public.claim_amanda_conversation(uuid) to service_role;

alter table public.amanda_agent_runs
  add column if not exists model text,
  add column if not exists prompt_version text,
  add column if not exists phase text not null default 'preparing',
  add column if not exists latency_ms integer,
  add column if not exists input_tokens integer,
  add column if not exists output_tokens integer;

alter table public.amanda_operator_messages
  add column if not exists reply_to_provider_message_id text;

alter table public.amanda_handoffs
  add column if not exists application_status text not null default 'pending';

do $$
begin
  alter table public.amanda_handoffs
    add constraint amanda_handoffs_application_status_check
    check (application_status in ('pending', 'applied', 'not_applied'));
exception when duplicate_object then null;
end $$;

create table if not exists public.amanda_knowledge (
  id uuid primary key default gen_random_uuid(),
  source_handoff_id uuid not null unique references public.amanda_handoffs(id) on delete restrict,
  content text not null check (char_length(content) between 20 and 500),
  status text not null default 'approved' check (status in ('approved', 'revoked')),
  version integer not null default 1,
  approved_by_role text not null,
  approved_at timestamptz not null default now(),
  revoked_by_role text,
  revoked_at timestamptz
);

create index if not exists amanda_knowledge_active_idx on public.amanda_knowledge(status, approved_at desc);
alter table public.amanda_knowledge enable row level security;
