-- Anonymous, consented interests only. No phone, customer, IP or device fingerprint.
create table if not exists public.visitor_events (
  id bigint generated always as identity primary key,
  session_id uuid not null,
  event_type text not null check (event_type in ('category_view', 'product_view', 'personalization_view')),
  reference text not null check (char_length(reference) between 1 and 100),
  consent_version text not null check (char_length(consent_version) between 1 and 40),
  created_at timestamptz not null default now()
);

create index if not exists visitor_events_session_idx on public.visitor_events(session_id, created_at desc);
create index if not exists visitor_events_created_idx on public.visitor_events(created_at);
alter table public.visitor_events enable row level security;
revoke all on public.visitor_events from anon, authenticated;
grant select, insert, delete on public.visitor_events to service_role;
grant usage, select on sequence public.visitor_events_id_seq to service_role;

-- A daily database job enforces retention even when no new visitors arrive.
create extension if not exists pg_cron with schema pg_catalog;
do $$
declare existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname = 'liira-visitor-events-retention' limit 1;
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
end $$;
select cron.schedule(
  'liira-visitor-events-retention',
  '15 2 * * *',
  $cron$delete from public.visitor_events where created_at < now() - interval '90 days'$cron$
);
