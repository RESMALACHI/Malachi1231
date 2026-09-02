-- ============================================================================
-- Make meetings a SHARED dataset.
--
-- The app is an internal tool: meetings come from central iCal feeds and are
-- scoped by agent_name (the agent selected in the header), NOT by which Google
-- account is logged in. So any authenticated user may read/manage all meetings,
-- and queries filter by agent_name only.
--
-- Run this in the Supabase SQL Editor after 0001-0004.
-- ============================================================================

-- agent_id stays as a record of who last synced a row, but is no longer used
-- for access control. Allow nulls so a sync never fails on it.
alter table public.meetings alter column agent_id drop not null;

create index if not exists meetings_name_date_idx
  on public.meetings (agent_name, meeting_date);

-- Replace the per-owner meetings policies with shared authenticated access.
drop policy if exists "meetings: agent reads own"    on public.meetings;
drop policy if exists "meetings: admins read all"    on public.meetings;
drop policy if exists "meetings: agent inserts own"  on public.meetings;
drop policy if exists "meetings: agent updates own"  on public.meetings;
drop policy if exists "meetings: agent deletes own"  on public.meetings;

drop policy if exists "meetings: authenticated read" on public.meetings;
create policy "meetings: authenticated read"
  on public.meetings for select
  using (auth.uid() is not null);

drop policy if exists "meetings: authenticated insert" on public.meetings;
create policy "meetings: authenticated insert"
  on public.meetings for insert
  with check (auth.uid() is not null);

drop policy if exists "meetings: authenticated update" on public.meetings;
create policy "meetings: authenticated update"
  on public.meetings for update
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

drop policy if exists "meetings: authenticated delete" on public.meetings;
create policy "meetings: authenticated delete"
  on public.meetings for delete
  using (auth.uid() is not null);
