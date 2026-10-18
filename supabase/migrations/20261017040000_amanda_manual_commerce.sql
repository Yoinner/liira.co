-- Manual orders and approved payment destinations. Nothing here initiates or confirms a bank transfer.
create table if not exists public.amanda_payment_methods (
  method text primary key check (method in ('nequi', 'breb')),
  recipient text not null check (char_length(recipient) between 3 and 80),
  ownership_confirmed_at timestamptz not null,
  disclosure_approved_at timestamptz not null,
  approved_by_role text not null check (approved_by_role in ('business', 'technical')),
  updated_at timestamptz not null default now()
);

create table if not exists public.amanda_manual_orders (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  handoff_id uuid not null unique references public.amanda_handoffs(id),
  conversation_id uuid not null references public.whatsapp_conversations(id),
  customer_id uuid not null references public.customers(id),
  summary text not null check (char_length(summary) between 3 and 400),
  amount_cop integer not null check (amount_cop > 0 and amount_cop <= 50000000),
  payment_method text not null check (payment_method in ('nequi', 'breb', 'link')),
  payment_destination text not null check (char_length(payment_destination) between 3 and 2000),
  status text not null default 'awaiting_payment' check (status in ('awaiting_payment', 'paid', 'cancelled')),
  proof_message_id uuid unique references public.whatsapp_messages(id),
  verification_reference text unique,
  verified_by_role text check (verified_by_role in ('business', 'technical')),
  verified_at timestamptz,
  approved_by_role text not null check (approved_by_role in ('business', 'technical')),
  approved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint amanda_manual_order_payment_check check ((status = 'paid') = (verified_at is not null))
);

create index if not exists amanda_manual_orders_conversation_idx on public.amanda_manual_orders(conversation_id, created_at desc);
alter table public.amanda_payment_methods enable row level security;
alter table public.amanda_manual_orders enable row level security;

-- A quote is approved for one case and one conversation snapshot; later inbound messages require review.
create table if not exists public.amanda_shipping_quotes (
  id uuid primary key default gen_random_uuid(),
  handoff_id uuid not null unique references public.amanda_handoffs(id),
  conversation_id uuid not null references public.whatsapp_conversations(id),
  customer_id uuid not null references public.customers(id),
  order_id uuid references public.amanda_manual_orders(id),
  destination text not null check (char_length(destination) between 3 and 200),
  item_summary text not null check (char_length(item_summary) between 3 and 400),
  amount_cop integer not null check (amount_cop between 0 and 5000000),
  delivery_estimate text not null check (char_length(delivery_estimate) between 3 and 160),
  conditions text not null check (char_length(conditions) between 3 and 300),
  source_last_inbound_at timestamptz not null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null check (expires_at > issued_at),
  approved_by_role text not null check (approved_by_role in ('business', 'technical'))
);
create index if not exists amanda_shipping_quotes_conversation_idx on public.amanda_shipping_quotes(conversation_id, issued_at desc);
alter table public.amanda_shipping_quotes enable row level security;

create or replace function public.approve_amanda_shipping_quote(
  p_conversation_id uuid, p_handoff_id uuid, p_order_id uuid, p_destination text,
  p_item_summary text, p_amount_cop integer, p_delivery_estimate text,
  p_conditions text, p_valid_hours integer, p_role text
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_handoff public.amanda_handoffs%rowtype;
  v_conversation public.whatsapp_conversations%rowtype;
  v_existing public.amanda_shipping_quotes%rowtype;
  v_id uuid;
begin
  if p_role is null or p_role not in ('business', 'technical') or p_destination is null
    or p_item_summary is null or p_amount_cop is null or p_delivery_estimate is null
    or p_conditions is null or p_valid_hours is null
    or char_length(trim(p_destination)) not between 3 and 200
    or char_length(trim(p_item_summary)) not between 3 and 400
    or p_amount_cop not between 0 and 5000000
    or char_length(trim(p_delivery_estimate)) not between 3 and 160
    or char_length(trim(p_conditions)) not between 3 and 300
    or p_valid_hours not between 1 and 72 then raise exception 'invalid_shipping_quote'; end if;
  select * into v_handoff from public.amanda_handoffs
    where id = p_handoff_id and conversation_id = p_conversation_id
      and kind = 'shipping_quote' and status = 'pending' for update;
  if not found then raise exception 'shipping_handoff_unavailable'; end if;
  select * into v_conversation from public.whatsapp_conversations
    where id = p_conversation_id and customer_id = v_handoff.customer_id
      and deleted_at is null and last_inbound_at is not null for update;
  if not found then raise exception 'shipping_conversation_unavailable'; end if;
  if p_order_id is not null and not exists (
    select 1 from public.amanda_manual_orders where id = p_order_id
      and conversation_id = p_conversation_id and customer_id = v_handoff.customer_id
      and status <> 'cancelled' and summary = trim(p_item_summary)
  ) then raise exception 'shipping_order_mismatch'; end if;
  select * into v_existing from public.amanda_shipping_quotes where handoff_id = p_handoff_id;
  if found then
    if v_existing.conversation_id <> p_conversation_id or v_existing.order_id is distinct from p_order_id
      or v_existing.destination <> trim(p_destination) or v_existing.item_summary <> trim(p_item_summary)
      or v_existing.amount_cop <> p_amount_cop or v_existing.delivery_estimate <> trim(p_delivery_estimate)
      or v_existing.conditions <> trim(p_conditions) then raise exception 'shipping_quote_already_approved'; end if;
    return v_existing.id;
  end if;
  insert into public.amanda_shipping_quotes(handoff_id, conversation_id, customer_id, order_id,
    destination, item_summary, amount_cop, delivery_estimate, conditions,
    source_last_inbound_at, expires_at, approved_by_role)
  values (p_handoff_id, p_conversation_id, v_handoff.customer_id, p_order_id,
    trim(p_destination), trim(p_item_summary), p_amount_cop, trim(p_delivery_estimate), trim(p_conditions),
    v_conversation.last_inbound_at, now() + make_interval(hours => p_valid_hours), p_role)
  returning id into v_id;
  update public.amanda_handoffs set operator_guidance = 'Cotización de envío aprobada',
    application_status = 'pending', guidance_due_at = now(), guidance_error_code = null where id = p_handoff_id;
  insert into public.audit_events(action, entity_type, entity_id, metadata)
  values ('amanda_shipping_quote_approved', 'amanda_shipping_quote', v_id,
    jsonb_build_object('handoff_id', p_handoff_id, 'conversation_id', p_conversation_id, 'actor_role', p_role));
  return v_id;
end;
$$;

create or replace function public.approve_amanda_payment_method(p_method text, p_recipient text, p_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_role is null or p_method is null or p_recipient is null or p_role not in ('business', 'technical')
    or (p_method = 'nequi' and p_recipient !~ '^3[0-9]{9}$')
    or (p_method = 'breb' and p_recipient !~ '^@[A-Za-z0-9._-]{3,30}$')
    or p_method not in ('nequi', 'breb') then raise exception 'invalid_payment_method'; end if;
  insert into public.amanda_payment_methods(method, recipient, ownership_confirmed_at, disclosure_approved_at, approved_by_role)
  values (p_method, p_recipient, now(), now(), p_role)
  on conflict (method) do update set recipient = excluded.recipient, ownership_confirmed_at = now(), disclosure_approved_at = now(), approved_by_role = p_role, updated_at = now();
  insert into public.audit_events(action, entity_type, metadata)
  values ('amanda_payment_method_approved', 'amanda_payment_method', jsonb_build_object('method', p_method, 'recipient', p_recipient, 'actor_role', p_role));
end;
$$;

create or replace function public.approve_amanda_manual_order(
  p_conversation_id uuid, p_handoff_id uuid, p_summary text, p_amount_cop integer,
  p_method text, p_destination text, p_role text
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_handoff public.amanda_handoffs%rowtype;
  v_existing public.amanda_manual_orders%rowtype;
  v_order uuid;
  v_reference text;
begin
  if p_role is null or p_summary is null or p_amount_cop is null or p_method is null or p_destination is null
    or p_role not in ('business', 'technical') or char_length(trim(p_summary)) not between 3 and 400
    or p_amount_cop not between 1 and 50000000 or p_method not in ('nequi', 'breb', 'link')
    or char_length(p_destination) not between 3 and 2000 then raise exception 'invalid_manual_order'; end if;
  select * into v_handoff from public.amanda_handoffs
    where id = p_handoff_id and conversation_id = p_conversation_id and status = 'pending' and kind = 'payment_link' for update;
  if not found then raise exception 'handoff_unavailable'; end if;
  if p_method in ('nequi', 'breb') and not exists (
    select 1 from public.amanda_payment_methods where method = p_method and recipient = p_destination
      and ownership_confirmed_at is not null and disclosure_approved_at is not null
  ) then raise exception 'payment_destination_not_approved'; end if;
  if p_method = 'link' and p_destination !~ '^https://[^[:space:]]+$' then raise exception 'invalid_payment_link'; end if;
  select * into v_existing from public.amanda_manual_orders where handoff_id = p_handoff_id for update;
  if found then
    if v_existing.status <> 'awaiting_payment' or v_existing.summary <> trim(p_summary)
      or v_existing.amount_cop <> p_amount_cop or v_existing.payment_method <> p_method
      or v_existing.payment_destination <> p_destination then raise exception 'order_already_approved_with_other_data'; end if;
    v_order := v_existing.id;
    v_reference := v_existing.reference;
  else
    v_order := gen_random_uuid();
    v_reference := 'LIR-' || v_order::text;
    insert into public.amanda_manual_orders(id, reference, handoff_id, conversation_id, customer_id, summary, amount_cop, payment_method, payment_destination, approved_by_role)
    values (v_order, v_reference, p_handoff_id, p_conversation_id, v_handoff.customer_id, trim(p_summary), p_amount_cop, p_method, p_destination, p_role);
    insert into public.audit_events(action, entity_type, entity_id, metadata)
    values ('amanda_manual_order_approved', 'amanda_manual_order', v_order,
      jsonb_build_object('reference', v_reference, 'handoff_id', p_handoff_id, 'amount_cop', p_amount_cop, 'payment_method', p_method, 'actor_role', p_role));
  end if;
  update public.amanda_handoffs set operator_guidance = 'Pedido aprobado ' || v_reference,
    application_status = 'pending', guidance_due_at = now(), guidance_error_code = null
  where id = p_handoff_id;
  return v_order;
end;
$$;

create or replace function public.verify_amanda_manual_payment(
  p_conversation_id uuid, p_handoff_id uuid, p_order_id uuid, p_transaction_reference text, p_role text
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_handoff public.amanda_handoffs%rowtype;
  v_order public.amanda_manual_orders%rowtype;
  v_reference text := upper(trim(p_transaction_reference));
begin
  if p_role is null or p_transaction_reference is null or p_role not in ('business', 'technical')
    or v_reference !~ '^[A-Z0-9._/-]{6,120}$' then
    raise exception 'invalid_payment_verification';
  end if;
  select * into v_handoff from public.amanda_handoffs
  where id = p_handoff_id and conversation_id = p_conversation_id and kind = 'payment_verification' and status = 'pending' for update;
  if not found or v_handoff.source_message_id is null then raise exception 'verification_handoff_unavailable'; end if;
  if not exists (select 1 from public.whatsapp_messages
    where id = v_handoff.source_message_id and conversation_id = p_conversation_id and direction = 'inbound'
      and message_type in ('image','video') and deleted_at is null) then raise exception 'proof_message_unavailable'; end if;
  select * into v_order from public.amanda_manual_orders
    where id = p_order_id and conversation_id = p_conversation_id and status = 'awaiting_payment' for update;
  if not found then raise exception 'order_unavailable'; end if;
  update public.amanda_manual_orders set status = 'paid', proof_message_id = v_handoff.source_message_id,
    verification_reference = v_reference, verified_by_role = p_role, verified_at = now(), updated_at = now()
  where id = p_order_id;
  update public.amanda_handoffs set operator_guidance = 'Pago verificado contra fondos recibidos para el pedido ' || v_order.reference,
    application_status = 'pending', guidance_due_at = now(), guidance_error_code = null where id = p_handoff_id;
  insert into public.customer_activities(customer_id, activity_type, summary, actor_role, metadata)
  values (v_order.customer_id, 'manual_payment_verified', 'Pago verificado para el pedido ' || v_order.reference, p_role,
    jsonb_build_object('order_id', p_order_id, 'proof_message_id', v_handoff.source_message_id));
  insert into public.audit_events(action, entity_type, entity_id, metadata)
  values ('amanda_manual_payment_verified', 'amanda_manual_order', p_order_id,
    jsonb_build_object('handoff_id', p_handoff_id, 'proof_message_id', v_handoff.source_message_id, 'actor_role', p_role));
  return p_order_id;
end;
$$;

revoke all on function public.approve_amanda_payment_method(text,text,text) from public, anon, authenticated;
revoke all on function public.approve_amanda_manual_order(uuid,uuid,text,integer,text,text,text) from public, anon, authenticated;
revoke all on function public.verify_amanda_manual_payment(uuid,uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.approve_amanda_payment_method(text,text,text) to service_role;
grant execute on function public.approve_amanda_manual_order(uuid,uuid,text,integer,text,text,text) to service_role;
grant execute on function public.verify_amanda_manual_payment(uuid,uuid,uuid,text,text) to service_role;
revoke all on function public.approve_amanda_shipping_quote(uuid,uuid,uuid,text,text,integer,text,text,integer,text) from public, anon, authenticated;
grant execute on function public.approve_amanda_shipping_quote(uuid,uuid,uuid,text,text,integer,text,text,integer,text) to service_role;
