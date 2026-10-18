-- Global admission control shared by all serverless instances. Reserve below the observed 5 rpm free-tier ceiling.
create table if not exists public.amanda_gateway_requests (
  id uuid primary key default gen_random_uuid(),
  reserved_at timestamptz not null default clock_timestamp(),
  priority text not null check (priority in ('operator', 'customer', 'background')),
  model text,
  http_status integer,
  input_tokens integer,
  output_tokens integer,
  error_code text
);

create index if not exists amanda_gateway_requests_reserved_idx on public.amanda_gateway_requests(reserved_at);
alter table public.amanda_gateway_requests enable row level security;

-- Historical operator messages are already handled. New inbound messages remain queued until processed.
alter table public.amanda_operator_messages
  add column if not exists processed_at timestamptz default now(),
  add column if not exists processing_until timestamptz,
  add column if not exists processing_error_code text;
alter table public.amanda_operator_messages alter column processed_at drop default;
create index if not exists amanda_operator_inbound_pending_idx
  on public.amanda_operator_messages(created_at)
  where direction = 'inbound' and processed_at is null;

create or replace function public.reserve_amanda_gateway_request(p_priority text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_count integer;
  v_limit integer;
  v_now timestamptz;
begin
  if p_priority not in ('operator', 'customer', 'background') then
    raise exception 'invalid_priority';
  end if;
  perform pg_advisory_xact_lock(20261017, 3);
  v_now := clock_timestamp();
  delete from public.amanda_gateway_requests where reserved_at < v_now - interval '7 days';
  select count(*) into v_count from public.amanda_gateway_requests where reserved_at > v_now - interval '60 seconds';
  v_limit := case p_priority when 'operator' then 4 when 'customer' then 3 else 2 end;
  if v_count >= v_limit then return null; end if;
  insert into public.amanda_gateway_requests(priority, reserved_at) values (p_priority, v_now) returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.reserve_amanda_gateway_request(text) from public, anon, authenticated;
grant execute on function public.reserve_amanda_gateway_request(text) to service_role;

-- A webhook retry must not increment unread or reset the queue twice. Serialize by customer phone.
create or replace function public.persist_liira_whatsapp_inbound(
  p_phone text, p_name text, p_message_id text, p_type text, p_body text,
  p_media_id text, p_caption text, p_provider_at timestamptz, p_phone_number_id text
)
returns table(conversation_id uuid, message_id uuid, inserted boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer uuid;
  v_conversation uuid;
  v_message uuid;
  v_now timestamptz := clock_timestamp();
begin
  if p_phone !~ '^[0-9]{7,15}$' or length(p_message_id) not between 5 and 250
    or length(trim(p_type)) not between 1 and 40
    or length(coalesce(p_body, '')) > 4096 or length(coalesce(p_caption, '')) > 1024 then
    raise exception 'invalid_inbound_message';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_phone, 0));
  select m.conversation_id, m.id into v_conversation, v_message
    from public.whatsapp_messages m where m.provider_message_id = p_message_id;
  if found then
    return query select v_conversation, v_message, false;
    return;
  end if;

  insert into public.customers(normalized_phone, phone, name, first_seen_at, last_contact_at)
  values (p_phone, p_phone, left(coalesce(nullif(trim(p_name), ''), 'Contacto de WhatsApp'), 100), v_now, v_now)
  on conflict (normalized_phone) do update set
    name = case when public.customers.name = 'Contacto de WhatsApp' then excluded.name else public.customers.name end,
    last_contact_at = v_now, updated_at = v_now
  returning id into v_customer;

  insert into public.whatsapp_conversations(customer_id, normalized_phone, status, unread_count, last_message_at, last_inbound_at, agent_due_at, ai_status, created_at, updated_at)
  values (v_customer, p_phone, 'requiere_respuesta', 1, v_now, v_now, v_now + interval '3 seconds', 'pending', v_now, v_now)
  on conflict (normalized_phone) do update set
    status = 'requiere_respuesta', status_manual_at = null,
    unread_count = public.whatsapp_conversations.unread_count + 1,
    last_message_at = v_now, last_inbound_at = v_now,
    agent_follow_up_at = null, agent_follow_up_attempts = 0, agent_follow_up_source_message_id = null,
    agent_due_at = v_now + interval '3 seconds', ai_status = 'pending', ai_error_code = null,
    deleted_at = null, deleted_by_role = null, updated_at = v_now
  returning id into v_conversation;

  insert into public.whatsapp_messages(conversation_id, customer_id, provider_message_id, direction, message_type, body, media_id, media_caption, provider_timestamp, metadata)
  values (v_conversation, v_customer, p_message_id, 'inbound', p_type, p_body, p_media_id, p_caption, p_provider_at, jsonb_build_object('phone_number_id', p_phone_number_id))
  returning id into v_message;

  insert into public.customer_activities(customer_id, activity_type, summary, metadata)
  values (v_customer, 'whatsapp_inbound', left(case when p_body is null then 'Mensaje de WhatsApp (' || p_type || ')' else 'WhatsApp: ' || p_body end, 300),
    jsonb_build_object('message_type', p_type, 'phone_number_id', p_phone_number_id, 'provider_message_id', p_message_id));
  return query select v_conversation, v_message, true;
end;
$$;

revoke all on function public.persist_liira_whatsapp_inbound(text,text,text,text,text,text,text,timestamptz,text) from public, anon, authenticated;
grant execute on function public.persist_liira_whatsapp_inbound(text,text,text,text,text,text,text,timestamptz,text) to service_role;

create unique index if not exists amanda_handoffs_source_kind_pending_idx
  on public.amanda_handoffs(source_message_id, kind)
  where status = 'pending' and source_message_id is not null;
