-- ============================================================================
-- Let an agent "close" a task (follow-up / reschedule) once it's handled.
--
-- Flagged rather than deleted so the sync (which only updates title/time/details)
-- keeps it closed. The Tasks page hides rows where task_done = true; the meeting
-- itself still exists everywhere else (calendar, reports).
-- ============================================================================

alter table public.meetings add column if not exists task_done boolean not null default false;
