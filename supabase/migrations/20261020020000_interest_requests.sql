-- An explicit contact request is independent of anonymous visit events and cookie consent.
alter table public.inquiries add column if not exists request_key uuid;
alter table public.inquiries add column if not exists restock_consent_at timestamptz;
alter table public.inquiries add column if not exists restock_consent_version text;
create unique index if not exists inquiries_request_key_unique on public.inquiries(request_key);
