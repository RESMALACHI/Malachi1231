-- The reserved '__summary__' row in whatsapp_instances holds the company-wide
-- WhatsApp instance used ONLY by the day-summary page, so every agent's summary
-- goes out from the same number.
--
-- Its token must never reach the browser: clients are blocked from reading or
-- writing that row, and only the Edge Function touches it (service role, which
-- bypasses RLS). The credentials themselves are inserted straight into the DB —
-- never committed here.

drop policy if exists wa_inst_select on public.whatsapp_instances;
create policy wa_inst_select on public.whatsapp_instances
  for select to authenticated using (agent_name <> '__summary__');

drop policy if exists wa_inst_insert on public.whatsapp_instances;
create policy wa_inst_insert on public.whatsapp_instances
  for insert to authenticated with check (agent_name <> '__summary__');

drop policy if exists wa_inst_update on public.whatsapp_instances;
create policy wa_inst_update on public.whatsapp_instances
  for update to authenticated
  using (agent_name <> '__summary__') with check (agent_name <> '__summary__');

drop policy if exists wa_inst_delete on public.whatsapp_instances;
create policy wa_inst_delete on public.whatsapp_instances
  for delete to authenticated using (agent_name <> '__summary__');
