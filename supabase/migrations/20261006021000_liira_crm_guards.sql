-- Durable abuse protection and database-level CRM invariants.

update public.inquiries
set lost_reason = 'No registrado en historial'
where pipeline_stage = 'perdido' and lost_reason is null;

do $$
begin
  alter table public.inquiries
    add constraint inquiries_stage_status_consistency
    check (
      (pipeline_stage = 'ganado' and status = 'vendido') or
      (pipeline_stage = 'perdido' and status = 'no_vendido') or
      (pipeline_stage not in ('ganado', 'perdido') and status = 'contacto')
    );
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.inquiries
    add constraint inquiries_lost_reason_required
    check (pipeline_stage <> 'perdido' or nullif(trim(lost_reason), '') is not null);
exception when duplicate_object then null;
end $$;

create table if not exists public.public_form_attempts (
  id bigint generated always as identity primary key,
  form_name text not null,
  ip_hash text not null,
  created_at timestamptz not null default now()
);

create index if not exists public_form_attempts_lookup_idx
  on public.public_form_attempts(form_name, ip_hash, created_at desc);

alter table public.public_form_attempts enable row level security;
