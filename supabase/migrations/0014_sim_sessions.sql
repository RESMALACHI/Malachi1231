-- Training arena ("זירת אימון"): one row per practice call against a virtual
-- prospect. Nothing here is about a real client — the prospect is a persona the
-- model plays, so the transcript holds only the agent's own words and fiction.
--
-- Same access rule as every other table in this app: the team shares one
-- signed-in account, and "who am I" is the name picked on the device.

create table if not exists public.sim_sessions (
  id          uuid primary key default gen_random_uuid(),
  agent_name  text not null,
  persona     text not null,
  lang        text not null default 'he',
  outcome     text not null,          -- booked | hung_up | ended
  score       integer,                -- 0-100, null if grading failed
  transcript  jsonb not null default '[]'::jsonb,
  feedback    jsonb,
  duration_s  integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists sim_sessions_agent_created
  on public.sim_sessions (agent_name, created_at desc);

alter table public.sim_sessions enable row level security;

create policy "sim_sessions: signed in"
  on public.sim_sessions for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);
