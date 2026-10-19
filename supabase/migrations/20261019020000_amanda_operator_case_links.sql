-- Exact reply correlation, additive to preserve all existing operator messages.
alter table public.amanda_operator_messages
  add column if not exists handoff_id uuid references public.amanda_handoffs(id) on delete set null,
  add column if not exists phone_number_id text;

create index if not exists amanda_operator_messages_handoff_idx
  on public.amanda_operator_messages(handoff_id, created_at desc)
  where handoff_id is not null;

-- Historical outbound alerts include the unique case code. Never guess an inbound link.
update public.amanda_operator_messages m
set handoff_id = h.id
from public.amanda_handoffs h
where m.direction = 'outbound' and m.handoff_id is null
  and (m.body = 'Alerta iniciada con plantilla: ' || h.code
    or m.body like 'Amanda necesita tu ayuda · ' || h.code || E'\n%');
