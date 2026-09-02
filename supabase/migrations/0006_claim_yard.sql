-- ============================================================================
-- The Claim Yard (לוח המציאות) — unassigned meetings.
--
-- Meetings whose calendar text doesn't match any known agent are stored with
-- agent_name = NULL and can be claimed by an agent from the Claim Yard view.
--
-- Column nullability is already in place:
--   - agent_name : nullable since 0004 (added as plain text).
--   - agent_id   : made nullable in 0005.
--
-- RLS: 0005 already grants authenticated users SELECT/UPDATE on ALL meetings
-- (this is a shared internal tool). So viewing rows where agent_name IS NULL and
-- claiming them (UPDATE agent_name) already work under the existing policies.
-- Status/type editing relies on that same broad UPDATE policy, so we keep the
-- shared model rather than narrowing UPDATE to "own name only".
-- ============================================================================

-- Which calendar feed an event came from (shown in the Claim Yard list).
alter table public.meetings add column if not exists source text;

-- Fast lookup / count of unassigned meetings.
create index if not exists meetings_unassigned_idx
  on public.meetings (meeting_date)
  where agent_name is null;
