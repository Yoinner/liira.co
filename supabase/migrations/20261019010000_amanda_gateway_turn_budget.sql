-- One customer turn can use all four model rounds; the fifth request remains blocked.
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
  v_limit := case p_priority when 'operator' then 4 when 'customer' then 4 else 2 end;
  if v_count >= v_limit then return null; end if;
  insert into public.amanda_gateway_requests(priority, reserved_at) values (p_priority, v_now) returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.reserve_amanda_gateway_request(text) from public, anon, authenticated;
grant execute on function public.reserve_amanda_gateway_request(text) to service_role;
