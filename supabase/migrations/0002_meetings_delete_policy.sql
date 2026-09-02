-- ============================================================================
-- Allow agents to delete their own meetings.
-- Needed so calendar sync can remove meetings whose Google Calendar event was
-- deleted. Run this if you already applied 0001_init.sql before this policy
-- existed. (Idempotent — safe to run more than once.)
-- ============================================================================

drop policy if exists "meetings: agent deletes own" on public.meetings;
create policy "meetings: agent deletes own"
  on public.meetings for delete
  using (agent_id = auth.uid());
