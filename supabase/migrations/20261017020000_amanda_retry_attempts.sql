-- Bounded technical retries for model/tool failures; does not alter historical runs.
alter table public.amanda_agent_runs
  add column if not exists attempt_count integer not null default 0
  check (attempt_count between 0 and 100);

alter table public.whatsapp_conversations
  add column if not exists agent_follow_up_attempts integer not null default 0
  check (agent_follow_up_attempts between 0 and 100);

alter table public.amanda_handoffs
  add column if not exists guidance_attempt_count integer not null default 0
  check (guidance_attempt_count between 0 and 100),
  add column if not exists guidance_due_at timestamptz,
  add column if not exists guidance_error_code text;

alter table public.amanda_handoffs drop constraint if exists amanda_handoffs_application_status_check;
alter table public.amanda_handoffs
  add constraint amanda_handoffs_application_status_check
  check (application_status in ('pending', 'processing', 'sending', 'send_unconfirmed', 'applied', 'not_applied'));

create index if not exists amanda_guidance_due_idx
  on public.amanda_handoffs(guidance_due_at)
  where status = 'pending' and application_status = 'pending' and guidance_due_at is not null;

-- Keep model tool rounds and operator guidance on the same per-conversation lease.
create or replace function public.claim_amanda_conversation(p_conversation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.whatsapp_conversations
  set agent_processing_until = now() + interval '180 seconds'
  where id = p_conversation_id
    and automation_mode = 'autonomous'
    and deleted_at is null
    and agent_due_at <= now()
    and (agent_processing_until is null or agent_processing_until < now());
  return found;
end;
$$;

-- Recover an uncertain private alert only after the operator checks the chat.
-- The state change and audit must succeed or fail together.
create or replace function public.requeue_amanda_operator_alert(
  p_handoff_id uuid, p_conversation_id uuid, p_role text
)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_handoff public.amanda_handoffs%rowtype;
begin
  if p_role not in ('business', 'technical') then raise exception 'invalid_operator_role'; end if;
  select * into v_handoff from public.amanda_handoffs
  where id = p_handoff_id and conversation_id = p_conversation_id and status = 'pending'
  for update;
  if not found or v_handoff.operator_delivery_status not in ('sending', 'send_unconfirmed') then
    raise exception 'operator_alert_not_recoverable';
  end if;
  if exists (
    select 1 from public.amanda_operator_messages
    where direction = 'outbound' and delivery_status in ('delivered', 'read')
      and position(v_handoff.code in coalesce(body, '')) > 0
  ) then raise exception 'operator_alert_already_delivered'; end if;
  update public.amanda_handoffs set operator_delivery_status = 'queued' where id = p_handoff_id;
  insert into public.audit_events(action, entity_type, entity_id, metadata)
  values ('amanda_operator_alert_requeued', 'amanda_handoff', p_handoff_id,
    jsonb_build_object('conversation_id', p_conversation_id, 'actor_role', p_role));
  return true;
end;
$$;

revoke all on function public.requeue_amanda_operator_alert(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.requeue_amanda_operator_alert(uuid, uuid, text) to service_role;
