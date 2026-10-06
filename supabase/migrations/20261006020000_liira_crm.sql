-- Liira CRM: manual commerce pipeline, customer 360 and inventory traceability.
-- Payments and WhatsApp Cloud API remain intentionally out of scope.

alter table public.inquiries
  add column if not exists customer_id uuid,
  add column if not exists pipeline_stage text not null default 'nuevo',
  add column if not exists priority text not null default 'normal',
  add column if not exists next_follow_up_at timestamptz,
  add column if not exists last_contacted_at timestamptz,
  add column if not exists lost_reason text,
  add column if not exists tags text[] not null default '{}';

do $$
begin
  alter table public.inquiries
    add constraint inquiries_pipeline_stage_check
    check (pipeline_stage in ('nuevo', 'contactado', 'cotizado', 'seguimiento', 'ganado', 'perdido'));
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.inquiries
    add constraint inquiries_priority_check
    check (priority in ('baja', 'normal', 'alta'));
exception when duplicate_object then null;
end $$;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  normalized_phone text,
  name text not null check (char_length(name) between 1 and 100),
  phone text,
  email text,
  instagram_handle text,
  city text,
  preferences text,
  tags text[] not null default '{}',
  transactional_consent boolean not null default false,
  marketing_consent boolean not null default false,
  first_seen_at timestamptz not null default now(),
  last_contact_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists customers_normalized_phone_unique
  on public.customers(normalized_phone);

do $$
begin
  alter table public.inquiries
    add constraint inquiries_customer_id_fkey
    foreign key (customer_id) references public.customers(id) on delete set null;
exception when duplicate_object then null;
end $$;

create table if not exists public.customer_notes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  inquiry_id uuid references public.inquiries(id) on delete set null,
  note text not null check (char_length(note) between 2 and 2000),
  created_by_role text not null check (created_by_role in ('business', 'technical')),
  created_at timestamptz not null default now()
);

create table if not exists public.customer_activities (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete cascade,
  inquiry_id uuid references public.inquiries(id) on delete set null,
  activity_type text not null,
  summary text not null check (char_length(summary) between 2 and 300),
  metadata jsonb not null default '{}'::jsonb,
  actor_role text,
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  delta integer not null check (delta <> 0),
  balance_after integer not null check (balance_after >= 0),
  reason text not null check (char_length(reason) between 2 and 240),
  actor_role text not null check (actor_role in ('business', 'technical')),
  created_at timestamptz not null default now()
);

create index if not exists inquiries_customer_idx on public.inquiries(customer_id, created_at desc);
create index if not exists inquiries_pipeline_follow_up_idx on public.inquiries(pipeline_stage, next_follow_up_at);
create index if not exists customers_updated_idx on public.customers(updated_at desc);
create index if not exists customer_notes_customer_idx on public.customer_notes(customer_id, created_at desc);
create index if not exists customer_activities_customer_idx on public.customer_activities(customer_id, created_at desc);
create index if not exists inventory_movements_product_idx on public.inventory_movements(product_id, created_at desc);

alter table public.customers enable row level security;
alter table public.customer_notes enable row level security;
alter table public.customer_activities enable row level security;
alter table public.inventory_movements enable row level security;

-- Backfill one customer per usable phone without overwriting curated CRM data.
insert into public.customers (normalized_phone, name, phone, first_seen_at, last_contact_at)
select
  regexp_replace(customer_phone, '[^0-9]', '', 'g') as normalized_phone,
  coalesce(nullif(max(customer_name), ''), 'Contacto de WhatsApp') as name,
  max(customer_phone) as phone,
  min(created_at) as first_seen_at,
  max(created_at) as last_contact_at
from public.inquiries
where customer_phone is not null
  and regexp_replace(customer_phone, '[^0-9]', '', 'g') <> ''
group by regexp_replace(customer_phone, '[^0-9]', '', 'g')
on conflict (normalized_phone)
do update set
  name = case when public.customers.name = 'Contacto de WhatsApp' then excluded.name else public.customers.name end,
  phone = coalesce(public.customers.phone, excluded.phone),
  last_contact_at = greatest(public.customers.last_contact_at, excluded.last_contact_at),
  updated_at = now();

update public.inquiries i
set customer_id = c.id
from public.customers c
where i.customer_id is null
  and i.customer_phone is not null
  and c.normalized_phone = regexp_replace(i.customer_phone, '[^0-9]', '', 'g');

update public.inquiries
set pipeline_stage = case status
  when 'vendido' then 'ganado'
  when 'no_vendido' then 'perdido'
  else 'nuevo'
end
where pipeline_stage = 'nuevo';
