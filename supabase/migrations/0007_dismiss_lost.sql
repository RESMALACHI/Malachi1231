-- ============================================================================
-- Let the manager permanently dismiss (delete) a lost meeting.
--
-- A hard delete wouldn't stick — the next sync would re-insert the event from
-- the calendar feed. Instead we flag it `dismissed = true`; the sync preserves
-- the flag (it only updates title/time/details), and the Claim Yard hides
-- dismissed rows.
-- ============================================================================

alter table public.meetings add column if not exists dismissed boolean not null default false;

-- Fast lookup of active (non-dismissed) lost meetings.
create index if not exists meetings_unassigned_active_idx
  on public.meetings (meeting_date)
  where agent_name is null and dismissed = false;
