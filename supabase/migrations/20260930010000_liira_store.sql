create extension if not exists pgcrypto;

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  slug text not null unique,
  description text,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories(id) on delete set null,
  name text not null check (char_length(name) between 2 and 160),
  slug text not null unique,
  description text,
  price numeric(12,2) not null check (price >= 0),
  sale_price numeric(12,2) check (sale_price is null or (sale_price >= 0 and sale_price < price)),
  stock integer not null default 0 check (stock >= 0),
  active boolean not null default true,
  featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  url text not null,
  storage_path text,
  alt text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create type public.inquiry_status as enum ('contacto', 'vendido', 'no_vendido');

create table if not exists public.inquiries (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  customer_name text,
  customer_phone text,
  color_preference text,
  customization text,
  source text not null default 'whatsapp_web',
  status public.inquiry_status not null default 'contacto',
  sale_amount numeric(12,2) check (sale_amount is null or sale_amount >= 0),
  sold_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sold_requires_amount check (status <> 'vendido' or (sale_amount is not null and sale_amount > 0))
);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists products_category_idx on public.products(category_id);
create index if not exists products_active_featured_idx on public.products(active, featured);
create index if not exists product_images_product_idx on public.product_images(product_id, sort_order);
create index if not exists inquiries_status_created_idx on public.inquiries(status, created_at desc);
create index if not exists inquiries_sold_at_idx on public.inquiries(sold_at) where sold_at is not null;

alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.inquiries enable row level security;
alter table public.audit_events enable row level security;

-- The application accesses operational tables only from server-side code with the
-- service role. No anon/authenticated table policies are intentionally created.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('products', 'products', true, 8388608, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public product image reads" on storage.objects;
create policy "Public product image reads" on storage.objects for select to public using (bucket_id = 'products');

drop policy if exists "Service role product image writes" on storage.objects;
create policy "Service role product image writes" on storage.objects for all to service_role using (bucket_id = 'products') with check (bucket_id = 'products');

insert into public.categories (name, slug, description, sort_order)
values
  ('Cordones Murano', 'cordones-murano', 'Cordones largos y versátiles elaborados con cuentas de murano.', 10),
  ('Denarios', 'denarios', 'Piezas de mano que unen color, fe y significado.', 20),
  ('Rosarios de mano', 'rosarios-de-mano', 'Rosarios artesanales diseñados para acompañar cada día.', 30)
on conflict (slug) do nothing;
