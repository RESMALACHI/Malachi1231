-- Per-agent WhatsApp connection (Green API instance).
-- Each agent connects their OWN business WhatsApp by scanning a QR in the app;
-- the app then sends template messages automatically through their own number.
--
-- id_instance / api_token come from each agent's Green API instance. They are
-- only ever read server-side (by the Edge Function via the service role); the
-- browser talks to the Edge Function, never to Green API directly.

create table if not exists public.whatsapp_instances (
  agent_name  text primary key,
  id_instance text not null,
  api_token   text not null,
  api_url     text not null default 'https://api.green-api.com',
  status      text not null default 'notAuthorized', -- notAuthorized | authorized
  phone       text,
  updated_at  timestamptz not null default now()
);

alter table public.whatsapp_instances enable row level security;

-- Internal tool: any signed-in user may read/write connections.
drop policy if exists wa_inst_select on public.whatsapp_instances;
create policy wa_inst_select on public.whatsapp_instances
  for select to authenticated using (true);

drop policy if exists wa_inst_insert on public.whatsapp_instances;
create policy wa_inst_insert on public.whatsapp_instances
  for insert to authenticated with check (true);

drop policy if exists wa_inst_update on public.whatsapp_instances;
create policy wa_inst_update on public.whatsapp_instances
  for update to authenticated using (true) with check (true);

drop policy if exists wa_inst_delete on public.whatsapp_instances;
create policy wa_inst_delete on public.whatsapp_instances
  for delete to authenticated using (true);
