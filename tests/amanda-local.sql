-- Run only on an isolated local Supabase database with psql ON_ERROR_STOP=1.
begin;

do $$
declare
  v_conversation uuid;
  v_message uuid;
  v_customer uuid;
  v_duplicate record;
  v_unread integer;
  v_payment_handoff uuid;
  v_proof_handoff uuid;
  v_shipping_handoff uuid;
  v_order uuid;
  v_quote uuid;
  v_other uuid;
  v_proof uuid;
  v_requeued boolean;
begin
  select conversation_id, message_id into v_conversation, v_message
  from public.persist_liira_whatsapp_inbound('573100000001', 'Cliente de prueba', 'wamid.local-first-001', 'text',
    'Quiero un denario', null, null, now(), 'local-only');
  select * into v_duplicate from public.persist_liira_whatsapp_inbound('573100000001', 'Cliente de prueba',
    'wamid.local-first-001', 'text', 'Quiero un denario', null, null, now(), 'local-only');
  if v_duplicate.inserted or v_duplicate.conversation_id <> v_conversation or v_duplicate.message_id <> v_message then
    raise exception 'duplicate_webhook_not_idempotent';
  end if;
  select unread_count, customer_id into v_unread, v_customer from public.whatsapp_conversations where id = v_conversation;
  if v_unread <> 1 then raise exception 'duplicate_incremented_unread'; end if;

  perform public.approve_amanda_payment_method('nequi', '3100000001', 'business');
  insert into public.amanda_handoffs(code, conversation_id, customer_id, source_message_id, kind, question)
  values ('LIR-TEST01', v_conversation, v_customer, v_message, 'payment_link', 'Aprobar pedido de prueba')
  returning id into v_payment_handoff;
  v_order := public.approve_amanda_manual_order(v_conversation, v_payment_handoff, 'Denario prueba', 45000,
    'nequi', '3100000001', 'business');
  v_other := public.approve_amanda_manual_order(v_conversation, v_payment_handoff, 'Denario prueba', 45000,
    'nequi', '3100000001', 'business');
  if v_other <> v_order then raise exception 'manual_order_not_idempotent'; end if;
  update public.amanda_handoffs set operator_delivery_status = 'send_unconfirmed'
  where id = v_payment_handoff;
  v_requeued := public.requeue_amanda_operator_alert(v_payment_handoff, v_conversation, 'business');
  if not v_requeued or not exists (select 1 from public.audit_events where action = 'amanda_operator_alert_requeued'
      and entity_id = v_payment_handoff)
    or (select operator_delivery_status from public.amanda_handoffs where id = v_payment_handoff) <> 'queued'
  then raise exception 'operator_alert_requeue_not_audited'; end if;
  update public.amanda_handoffs set operator_delivery_status = 'send_unconfirmed'
  where id = v_payment_handoff;
  insert into public.amanda_operator_messages(provider_message_id, direction, body, delivery_status)
  values ('wamid.local-operator-delivered', 'outbound', 'Caso LIR-TEST01', 'delivered');
  begin
    perform public.requeue_amanda_operator_alert(v_payment_handoff, v_conversation, 'business');
    raise exception 'delivered_alert_was_requeued';
  exception when raise_exception then
    if sqlerrm = 'delivered_alert_was_requeued' then raise; end if;
  end;
  begin
    perform public.approve_amanda_manual_order(v_conversation, v_payment_handoff, 'Denario prueba', 46000,
      'nequi', '3100000001', 'business');
    raise exception 'changed_order_was_accepted';
  exception when raise_exception then
    if sqlerrm = 'changed_order_was_accepted' then raise; end if;
  end;

  select message_id into v_proof from public.persist_liira_whatsapp_inbound('573100000001', 'Cliente de prueba',
    'wamid.local-proof-001', 'image', null, 'local-image-only', null, now(), 'local-only');
  insert into public.amanda_handoffs(code, conversation_id, customer_id, source_message_id, kind, question)
  values ('LIR-TEST02', v_conversation, v_customer, v_proof, 'payment_verification', 'Revisar comprobante de prueba')
  returning id into v_proof_handoff;
  perform public.verify_amanda_manual_payment(v_conversation, v_proof_handoff, v_order, 'TX-LOCAL-0001', 'business');
  if not exists (select 1 from public.amanda_manual_orders where id = v_order and status = 'paid'
    and proof_message_id = v_proof and verified_at is not null) then raise exception 'payment_verification_not_recorded'; end if;

  insert into public.amanda_handoffs(code, conversation_id, customer_id, source_message_id, kind, question)
  values ('LIR-TEST03', v_conversation, v_customer, v_proof, 'shipping_quote', 'Cotizar destino de prueba')
  returning id into v_shipping_handoff;
  v_quote := public.approve_amanda_shipping_quote(v_conversation, v_shipping_handoff, v_order, 'Bucaramanga',
    'Denario prueba', 12000, '2 a 4 días hábiles', 'Sujeto a cobertura local', 24, 'business');
  v_other := public.approve_amanda_shipping_quote(v_conversation, v_shipping_handoff, v_order, 'Bucaramanga',
    'Denario prueba', 12000, '2 a 4 días hábiles', 'Sujeto a cobertura local', 24, 'business');
  if v_quote <> v_other then raise exception 'shipping_quote_not_idempotent'; end if;
  if not exists (select 1 from public.amanda_shipping_quotes where id = v_quote and order_id = v_order
    and expires_at > issued_at and source_last_inbound_at =
      (select last_inbound_at from public.whatsapp_conversations where id = v_conversation)) then
    raise exception 'shipping_quote_not_bound_to_case';
  end if;
  begin
    perform public.approve_amanda_shipping_quote(v_conversation, v_shipping_handoff, v_order, 'Bogotá',
      'Denario prueba', 12000, '2 a 4 días hábiles', 'Sujeto a cobertura local', 24, 'business');
    raise exception 'changed_quote_was_accepted';
  exception when raise_exception then
    if sqlerrm = 'changed_quote_was_accepted' then raise; end if;
  end;

  if (select count(*) from public.audit_events where entity_id in (v_order, v_quote)) < 3 then
    raise exception 'financial_audit_missing';
  end if;
  raise notice 'PASS webhook idempotency, order approval, payment verification, quote binding and audit';
end $$;

do $$
declare
  v_function oid;
  v_table text;
begin
  for v_function in select oid from pg_proc where pronamespace = 'public'::regnamespace
    and proname in ('reserve_amanda_gateway_request', 'persist_liira_whatsapp_inbound',
      'approve_amanda_payment_method', 'approve_amanda_manual_order',
      'verify_amanda_manual_payment', 'approve_amanda_shipping_quote',
      'requeue_amanda_operator_alert')
  loop
    if has_function_privilege('anon', v_function, 'EXECUTE')
      or has_function_privilege('authenticated', v_function, 'EXECUTE')
      or not has_function_privilege('service_role', v_function, 'EXECUTE') then
      raise exception 'rpc_privilege_incorrect_for_%', v_function;
    end if;
  end loop;
  foreach v_table in array array['amanda_gateway_requests', 'amanda_payment_methods',
    'amanda_manual_orders', 'amanda_shipping_quotes'] loop
    if not (select relrowsecurity from pg_class where oid = ('public.' || v_table)::regclass) then
      raise exception 'rls_disabled_for_%', v_table;
    end if;
  end loop;
  raise notice 'PASS service-role-only RPC and RLS on new tables';
end $$;

create function pg_temp.reject_local_audit() returns trigger language plpgsql as $$
begin
  raise exception 'local_audit_blocked';
end $$;
create trigger reject_local_audit before insert on public.audit_events
for each row execute function pg_temp.reject_local_audit();

do $$
declare
  v_conversation uuid;
  v_customer uuid;
  v_message uuid;
  v_handoff uuid;
begin
  select conversation_id, message_id into v_conversation, v_message
  from public.persist_liira_whatsapp_inbound('573100000004', 'Rollback ficticio', 'wamid.rollback-local-001',
    'text', 'Quiero comprar', null, null, now(), 'local-only');
  select customer_id into v_customer from public.whatsapp_conversations where id = v_conversation;
  insert into public.amanda_handoffs(code, conversation_id, customer_id, source_message_id, kind, question)
  values ('LIR-TEST04', v_conversation, v_customer, v_message, 'payment_link', 'Probar rollback de auditoría')
  returning id into v_handoff;
  begin
    perform public.approve_amanda_manual_order(v_conversation, v_handoff, 'Denario rollback', 45000,
      'nequi', '3100000001', 'business');
    raise exception 'unlogged_order_was_accepted';
  exception when raise_exception then
    if sqlerrm = 'unlogged_order_was_accepted' then raise; end if;
  end;
  if exists (select 1 from public.amanda_manual_orders where handoff_id = v_handoff) then
    raise exception 'audit_failure_left_order';
  end if;
  update public.amanda_handoffs set operator_delivery_status = 'send_unconfirmed' where id = v_handoff;
  begin
    perform public.requeue_amanda_operator_alert(v_handoff, v_conversation, 'business');
    raise exception 'unlogged_alert_was_requeued';
  exception when raise_exception then
    if sqlerrm = 'unlogged_alert_was_requeued' then raise; end if;
  end;
  if (select operator_delivery_status from public.amanda_handoffs where id = v_handoff) <> 'send_unconfirmed' then
    raise exception 'audit_failure_left_requeued_alert';
  end if;
  raise notice 'PASS failed audit rolls back financial order and alert recovery';
end $$;

rollback;
