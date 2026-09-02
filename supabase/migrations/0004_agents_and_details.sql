-- ============================================================================
-- Multi-agent support + richer meeting details.
--   agent_name  : which agent this meeting belongs to (matched from the event
--                 text). Lets one Google account hold meetings for several
--                 agents and switch between them.
--   description : the event's description/body (shown in the detail view).
--   location    : the event location.
-- ============================================================================

alter table public.meetings add column if not exists agent_name text;
alter table public.meetings add column if not exists description text;
alter table public.meetings add column if not exists location text;

create index if not exists meetings_agent_name_idx
  on public.meetings (agent_id, agent_name, meeting_date);

-- Backfill: existing rows were all synced under the default name filter.
update public.meetings set agent_name = 'מלאכי אזערי' where agent_name is null;
